# Handoff — `AldaGs/tinylogistics-` (delivery tracking & calendar sync)

**Start a session in that repo.** Context: `../SECURITY-1.6.md`, and `README.md` here.

Layout seen when the repo was attached: `supabase/migrations/0003_google_calendar.sql` and
neighbours, plus Edge Functions `track`, `google-calendar-sync`, `google-oauth-callback`,
and UI in `src/TicketDetailModal.jsx`, `src/GoogleCalendarModal.jsx`.

## The findings

### 1. Functions callable by anyone with the anon key — **High**

Confirmed on the live project. Every function in `public` is executable by `anon` because
Supabase grants it directly; `REVOKE ... FROM PUBLIC` does not remove that grant. These are
this app's:

```
get_tracking(p_token text)                 gen_tracking_token()
get_tracking_private(p_token text,         set_tracking_pin(p_id uuid, p_pin text)
                     p_pin text)
google_calendar_resync_all()               trigger_google_calendar_sync()
provision_schema()
```

Two stand out:

- **`set_tracking_pin`** — an unauthenticated caller can overwrite the PIN protecting a
  delivery's private tracking details, then read them with `get_tracking_private`.
- **`provision_schema`** — whatever this provisions, it should not be reachable by the
  public. Check what it does first; it may be a setup-only function that should be
  `service_role` only.

`get_tracking` and `gen_tracking_token` are plausibly *meant* to be public (a customer
opening a tracking link). Establish that from the Edge Function and the UI before touching
them.

**Also check the PIN itself.** tinypos found cashier PINs stored as bcrypt but readable, and
four digits crack offline in seconds. If tracking PINs are short, or stored in a table any
signed-in account can read, apply the same two fixes: reachable only through
`SECURITY DEFINER` functions (tinypos `043`), and rate-limited (tinypos `044`/`045` —
`rate_limit_hit` and `rate_limit_retry_after` already exist on the project and can be reused
as-is; they are granted to nobody, so a `SECURITY DEFINER` function can call them).

### 2. Blanket-authenticated tables — **High**

```
employees_logistics   "Authenticated devices can view logistics employees", "auth read employees"
logistics_settings    "Enable read access ...", "Enable update access ...", "auth read settings"
```

All `USING (true)`: any account that can sign in to the project reads them. Replace with
`USING (public.is_app_user(auth.uid()))` — see tinypos `db/migrations/042`. Employee records
are personal data; treat this as the priority of the two.

### 3. No pinned `search_path` — **Low**

All seven functions above. See tinypos `046`.

### 4. Worth checking while you are in there

`google-oauth-callback`: tinypos found its Supabase OAuth callback accepted **any** code
with a fixed `state` and no PKCE, which let a crafted link plant an attacker's token in the
owner's browser. If this Edge Function follows the same shape, it has the same hole. The
fix is in `api/auth/start.js` and `api/auth/callback.js` in tinypos: random state and a PKCE
verifier in HttpOnly cookies, `timingSafeEqual` on the way back, one-shot cookies burned
after use. Tests: `src/tests/oauthCallback.test.js`.

## Order of work

1. Read-only: confirm the list above with `has_function_privilege` and `pg_policies`, and
   read the Edge Functions to see which functions the **public** tracking page calls.
2. Narrow RPCs for whatever the public page needs (tinypos `039`), deployed first.
3. Revoke and re-grant EXECUTE (tinypos `041`).
4. Allowlist the two tables (tinypos `042`).
5. Rate-limit the tracking PIN check (tinypos `044`/`045`).
6. Pin `search_path` (tinypos `046`).
7. OAuth state + PKCE if the callback needs it.

Prove each step in `BEGIN … ROLLBACK` first: as `anon`, the tracking link must still open
and everything else must be denied.
