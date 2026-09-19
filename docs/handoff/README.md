# Handoff: finishing the security pass in the sibling apps

Four apps share one Supabase project, **JardinOcultoPOS** (`qqmwzmddalroazcjjfre`):

| App | Repo | Owns |
|---|---|---|
| tinypos (this one) | `AldaGs/coffee-system-pos` | sales, menu, inventory, CFDI, `app_users` |
| Kitchen display | `AldaGs/tinykds` | `order_fulfillment` |
| Delivery / logistics | `AldaGs/tinylogistics-` | tracking, logistics settings, calendar sync |
| Books | `AldaGs/tinybooks` | the `book_*` tables |

Schema 1.6 fixed tinypos's own tables and functions (see `../SECURITY-1.6.md`). The same
three classes of problem exist in the other three, and **could not be fixed from here**:
their objects are created by their own install scripts, and this repo cannot know which of
their functions their public pages legitimately call. Revoking blind would break them
silently.

Each file in this folder is written to be handed to a fresh session **in that repo**, on its
own, with no memory of this work. They share a common shape:

1. Confirm what is exposed, read-only, against the live project.
2. Work out which of that app's functions its public (no-sign-in) pages actually call.
3. Replace blanket access with narrow RPCs or an allowlist predicate.
4. Verify inside `BEGIN … ROLLBACK` before anything is applied.

## Three patterns worth copying

They are implemented and verified in this repo; point each session at the file.

- **Public page → narrow RPC.** `db/migrations/039_cfdi_portal_rpcs.sql`: a `SECURITY
  DEFINER` function returning only the fields the page renders, taking a reference the
  visitor already holds, so the anon key needs no table access at all. Then
  `040_drop_cfdi_anon_policies.sql` drops the policies *and* revokes the table grants.
- **Function EXECUTE.** `db/migrations/041_function_execute_grants.sql`: `REVOKE ... FROM
  PUBLIC, anon, authenticated` per function, explicit re-grants, plus `ALTER DEFAULT
  PRIVILEGES`. The key insight: `REVOKE ... FROM PUBLIC` alone does nothing, because
  Supabase grants `anon` directly.
- **Allowlist in the database.** `db/migrations/042_enforce_app_users_allowlist.sql`:
  `USING (public.is_app_user(auth.uid()))` instead of `USING (true)`. `is_app_user` already
  exists on the project and is shared — the sibling apps can call it as-is.

## Ground rules for every session

- **Read-only first.** `pg_policies`, `has_function_privilege`, and the Supabase security
  advisor. Then prove each change in a rolled-back transaction before applying anything.
- **Never revoke a function an app's public page needs** without replacing it with a narrow
  RPC in the same change, deployed first.
- **Check `app_users` before enforcing the allowlist.** Any account missing from it sees an
  empty database rather than an error. Today: 3 accounts, all `admin`, all linked.
- **`ALTER DEFAULT PRIVILEGES` is already set** on `public` by tinypos migration 041. Any
  new function whose public page calls it now needs an explicit
  `GRANT EXECUTE ... TO anon`.
- **One repo per session.** These changes are per-app; mixing them makes the blast radius
  impossible to reason about.
