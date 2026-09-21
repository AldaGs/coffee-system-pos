# Handoff — `AldaGs/tinylogistics-`: `gen_tracking_token` broke the tinypos register

**Start a session in that repo.** Companion to `tinylogistics.md` in this folder; that file
is the broader security handoff and still stands. This one is a single, already-diagnosed
production incident with a one-line fix that has **already been applied to the live
database by hand** and now needs to be written into the repo so the next deploy does not
undo it.

Project: **JardinOcultoPOS** (`qqmwzmddalroazcjjfre`). Incident date: 2026-09-21.

## What happened

The tinypos register could not sync active tickets to the cloud. Creating a ticket worked;
adding any item to it failed silently and the ticket stayed local forever.

The chain:

1. tinypos PATCHes `public.active_tickets` when items change.
2. `AFTER INSERT OR UPDATE` trigger `create_fulfillment_from_active_ticket` fires and calls
   `check_requires_logistics(NEW.items)`, which reads `logistics_settings.tracked_product_ids`.
3. When the ticket contains a tracked product (`lavado_250`, `envio`, …) it INSERTs into
   `public.order_fulfillment`.
4. `order_fulfillment.tracking_token` has `DEFAULT gen_tracking_token()`.
5. `gen_tracking_token()` was defined with `SET search_path TO 'public'` but calls
   `gen_random_bytes(8)`, which is **pgcrypto, installed in the `extensions` schema** on
   this project.
6. `42883 function gen_random_bytes(integer) does not exist` → the whole PATCH rolls back →
   PostgREST returns **404** to the register.

Why it looked intermittent: ticket creation sends `items: []`, so
`check_requires_logistics` returns false and the trigger no-ops. Only tickets containing a
tracked product hit the broken path. That is most real orders in this shop.

Evidence gathered at the time (all read-only, reproducible):

- Edge logs, `/rest/v1/active_tickets`, 24h window: 8 × `PATCH → 404`, alongside
  `GET → 200` and the ticket's original `POST → 201`.
- Postgres logs: one `42883 function gen_random_bytes(integer) does not exist` at the exact
  millisecond of each failing PATCH.
- Rolled-back probe: the same UPDATE with a non-tracked item succeeds; with `lavado_250` in
  `items` it raises `gen_random_bytes(integer) does not exist`.

## The fix, already applied live

```sql
ALTER FUNCTION public.gen_tracking_token() SET search_path = public, extensions;
```

Verified after applying: `proconfig` reads `search_path=public, extensions`, the function
returns a token directly, and the previously failing UPDATE succeeds and produces a
fulfillment row with a token. The verification probe was rolled back — no fulfillment rows
or ticket edits were left behind.

**This was a manual `ALTER` against the live database. It is not in any repo.** Anything
that re-runs the migration defining `gen_tracking_token` will silently reintroduce the
outage.

## What this session needs to do

1. **Find the definition.** Grep `supabase/migrations/` for `gen_tracking_token`. It is
   created with `SET search_path TO 'public'` and a body of roughly
   `SELECT replace(replace(replace(encode(gen_random_bytes(8),'base64'),'+','-'),'/','_'),'=','')`.

2. **Add a migration that codifies the live fix**, so a fresh provision and a re-run both
   converge on the working definition:

   ```sql
   ALTER FUNCTION public.gen_tracking_token() SET search_path = public, extensions;
   ```

   and **also** correct the original `CREATE OR REPLACE` in place, so a from-scratch install
   never creates the broken version. Doing only one of the two leaves a path that regresses.

3. **Audit the rest of this app's functions for the same trap.** State on the live project
   as of 2026-09-21:

   | Function | `search_path` | Uses an `extensions` function |
   |---|---|---|
   | `gen_tracking_token` | `public, extensions` *(fixed by hand — not in repo)* | yes |
   | `get_tracking_private` | `public, extensions` | yes |
   | `set_tracking_pin` | `public, extensions` | yes |
   | `get_tracking` | `public` | no |
   | `google_calendar_resync_all` | `public` | no |
   | `trigger_google_calendar_sync` | `public` | no |
   | `check_requires_logistics` | `public` | no |
   | `create_fulfillment_from_active_ticket` | `public` | no |
   | `create_fulfillment_ticket` | `public` | no |
   | `provision_schema` | *(unset)* | no |
   | `verify_admin_pin` | *(unset)* | no |

   The three bare-`public` functions in the fulfillment trigger chain are not broken today,
   but they sit directly in the tinypos write path — if any of them ever reaches for
   `crypt()`, `digest()` or `gen_random_bytes()`, the register stops taking orders again.
   Pin them to `public, extensions` as a matter of course.

   `provision_schema` and `verify_admin_pin` are still unpinned entirely — that is finding 3
   in `tinylogistics.md`, still open. `provision_schema` was checked during this incident
   and does **not** recreate `gen_tracking_token`, so it will not undo the live fix.

4. **Confirm ownership of the fulfillment trigger chain before editing it.**
   `create_fulfillment_from_active_ticket`, `check_requires_logistics` and
   `create_fulfillment_ticket` read `logistics_settings` but write `order_fulfillment`, which
   `README.md` here assigns to **tinykds**. Work out which repo's migrations actually create
   them and make the change there; do not create a second competing definition.

## The rule to carry forward

When pinning `search_path` on a Supabase project, the value is **`public, extensions`**,
never bare `public`. Supabase installs pgcrypto (and others) into `extensions`, so a bare
`public` pin breaks every call to `gen_random_bytes`, `crypt`, `gen_salt`, `digest` and
`hmac` — at runtime, in whatever unrelated app happens to sit upstream of the trigger.

tinypos migration `046_function_search_path.sql` uses `public, extensions` for exactly this
reason and says so in its header. The functions here that were pinned to bare `public`
followed finding 3 of `tinylogistics.md`, which pointed at `046` without spelling out the
`extensions` part. That gap is what caused this outage; `tinylogistics.md` has been
corrected.

## How to prove it before and after

Pick a tracked product id from `logistics_settings.tracked_product_ids` and run, against an
open ticket id from `active_tickets`:

```sql
BEGIN;
UPDATE public.active_tickets
   SET items = '[{"id":"<tracked-id>","name":"probe","qty":1}]'::jsonb
 WHERE id = <ticket-id>;
SELECT tracking_token FROM public.order_fulfillment WHERE active_ticket_id = <ticket-id>;
ROLLBACK;
```

Before the fix this raises `42883`. After it, the UPDATE succeeds and the token is
populated. Always `ROLLBACK` — this is the live shop database, and a committed probe leaves
a real fulfillment row and a corrupted ticket.

## Related, not yours

tinypos has its own defects that made this take a database query to diagnose rather than
showing an error: `src/hooks/useTickets.js` wraps Supabase writes in `try/catch`, but
supabase-js returns `{ error }` instead of throwing on a PostgREST error, so rejected cloud
writes are dropped silently and never queued; and `src/services/syncService.js` treats only
400/401 as retryable, so a persistent 404 loops forever while the Force Sync card reports
success. Those are tracked in `AldaGs/coffee-system-pos` and are not part of this handoff.
