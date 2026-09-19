# Schema 1.6 — security release report

**Branch:** `claude/database-security-audit-aqqs95` · **Commits:** `48afb31` → `c261383`
**Live project audited:** JardinOcultoPOS (`qqmwzmddalroazcjjfre`), previously on schema 1.5
**Status:** written, reviewed and verified. **Not yet applied to the live database.**

---

## 1. What this release is about

Every finding here traces back to one fact: **the Supabase anon key is printed inside the
QR code on every receipt** (`src/utils/cfdiUrl.js`), and in the public menu link. That is
how Supabase is designed to work — the key is public, and the database's access rules are
what protect the data. Those rules were too open.

A second, quieter fact: **Supabase grants `EXECUTE` on every function in `public` to `anon`
and `authenticated` by default.** The `REVOKE ... FROM PUBLIC` lines already in the install
script did not touch that grant, so they had no effect. All 32 functions on the project
were callable by anyone holding a receipt.

## 2. Findings and what was done

| # | Severity | Finding | Fix | Migration |
|---|---|---|---|---|
| 1 | Critical | `anon` could read every sale and UPDATE any column of any sale | portal moved to two RPCs; anon policies and table grants dropped | 039, 040 |
| 2 | Critical | `anon` could read and rewrite every customer's fiscal data (RFC, legal name, email — personal data under the LFPDPPP) | same | 039, 040 |
| 3 | High | 32 functions callable without signing in, incl. `set_cashier_pin`, `delete_cashier_pin`, `verify_pin`, `restore_menu_version`, stock movement | EXECUTE revoked and re-granted per role; admin check inside the PIN functions; default privileges revoked for future functions | 041 |
| 4 | High | any signed-in account could read/write every table; the `app_users` allowlist was only checked client-side; public sign-ups were on | policies now use `is_app_user(auth.uid())`; setup turns sign-ups off | 042 + `api/install.js`, `api/supabase.js` |
| 5 | Medium | every signed-in account could read the bcrypt PIN hashes | `cashier_pins` reachable only through its functions | 043 |
| 6 | Medium | OAuth login forgery: fixed `state`, no PKCE | server-side `/api/auth/start` with random state + PKCE; callback verifies with `timingSafeEqual` | `api/auth/start.js`, `api/auth/callback.js` |
| 7 | Low | functions without a pinned `search_path`; leaked-password protection off | `search_path` pinned; `password_hibp_enabled` set at install | 046 + auth config |
| — | — | *(added during the work)* PIN and ticket references were guessable with no throttle | Postgres-side rate limiting, with a visible cooldown | 044, 045 |

### Found during the work, not in the original audit

- **`order_fulfillment` has `KDS anon read` / `KDS anon update`, both `USING (true)`.**
  Anyone with a receipt can read the order queue and mark orders done. These policies are
  not created by this repo — they belong to the kitchen-display app. **Still open.** See
  `docs/handoff/tinykds.md`.
- **The from-scratch install script never had the CFDI tables.** `fiscal_profiles`, the
  `cfdi_*` columns and `cfdi_global_periods` only ever shipped as deltas 0.9/1.0, so a
  brand-new install had no CFDI support at all. Fixed in passing (migration 039).
- **`is_app_user` existed on the live project but was never in the install script.** Now
  defined in migration 042.

## 3. Deliberate behaviour changes

1. **Factura Global month** is computed in the shop's timezone (`shop_timezone()`) rather
   than the visitor's browser clock. Same answer for local customers; correct instead of
   wrong for one scanning from abroad on the 1st or 31st.
2. **A cashier who enters 10 wrong PINs in 15 minutes is locked out** for the rest of that
   window. A correct PIN clears the counter, so ordinary use never accumulates. The pad
   freezes and counts down rather than repeating "wrong PIN"; Cancel stays live.
3. **The CFDI portal throttles unresolved lookups** (30 misses/minute, project-wide) and
   shows a countdown, then reloads itself. A customer scanning a real receipt is never
   counted.
4. **OAuth scopes moved server-side**, keyed by flow. Device pairing can now only ask for
   `api_keys_read`.
5. **`cfdi_lookup_ticket` is no longer `STABLE`** — it writes the rate-limit counter — so it
   must be called as an RPC. That is the only way the app calls it.

## 4. Will everything still work?

**Yes, with one ordering requirement and two things to watch.**

Verified against the live project throughout, inside `BEGIN … ROLLBACK` transactions. No
change has been written to it, and no row was modified.

| Probe (as the real role) | Result |
|---|---|
| `anon` → `SELECT FROM sales` | permission denied |
| `anon` → `cfdi_lookup_ticket('<real ticket>')` | returns the ticket |
| that payload contains `cashier_name` / `loyalty_phone` | no |
| `anon` → functions reachable | menu ×4, `shop_timezone`, the two CFDI ones — nothing else |
| signed-in account **not** on the allowlist → `SELECT FROM sales` | 0 rows |
| signed-in account **on** the allowlist → `SELECT FROM sales` | sees its data |
| allowlisted account → `SELECT FROM cashier_pins` | permission denied |
| allowlisted account → `verify_pin(...)` | still answers |
| 12 attempts against a limit of 10 | allow ×10, then BLOCK, BLOCK |
| 11th PIN attempt via `verify_pin_status` | `{ok:false, locked:true, retry_after:900}` |
| functions still missing `search_path` | only the 8 sibling-app ones |

Repo checks: lint clean, **156 tests** (5 new for OAuth), production build succeeds.

### The ordering requirement

**Deploy the app first, then apply the schema.** Migration 040 removes the anon policies
the *old* CFDI portal depends on. If the schema lands while the old frontend is still
served, every customer scanning a receipt hits a dead portal until the deploy catches up.

```
1. Deploy the branch to Vercel (app + /api/auth/start).
2. Admin → General Settings → Update Schema (1.5 → 1.6).
3. Scan a receipt QR and request a factura end to end.
```

### Watch these two

- **`app_users` is now load-bearing.** An account missing from it sees an empty database,
  not an error — which looks like data loss. Today: 3 auth users, 3 linked rows, 0 accounts
  affected. Any new device or staff account must be in `app_users` before it sees anything.
- **`ALTER DEFAULT PRIVILEGES` crosses app boundaries.** Existing sibling functions are
  untouched, but any *new* function a sibling app creates in `public` must now
  `GRANT EXECUTE ... TO anon` explicitly if its public page calls it.

### Rollback

Every migration is idempotent and re-runnable. To undo the allowlist specifically, recreate
the old policies as `FOR ALL TO authenticated USING (true)`; to undo the anon lockout,
re-create the policies listed in `db/migrations/040_drop_cfdi_anon_policies.sql`. The
version stamp in `schema_meta` would also need resetting to `1.5`.

### One operational note

The 1.5 → 1.6 delta is ~46 KB of DDL in a single Management API call. It is all DDL (no
backfills, no table rewrites), so it should stay well inside Vercel Hobby's ~10s budget —
but it is the largest delta this project has shipped. If it ever times out, the same SQL is
in `db/migrations/039`–`046` and can be pasted into the Supabase SQL editor in order.

## 5. What is still open

| Item | Where | Why not fixed here |
|---|---|---|
| `order_fulfillment` anon read/update | tinykds | policies belong to that app; dropping them here breaks it |
| 8 sibling functions callable by anon, incl. `provision_schema`, `set_tracking_pin` | tinylogistics-, others | this repo cannot know which their public pages call |
| ~22 `book_*` tables blanket-authenticated | tinybooks | same allowlist fix, their repo |
| Local mode trusts the device | by design | documented gap: unencrypted browser storage, plain-text local PINs |
| No 2FA / SSO | by design | free-tier product |

Per-repo instructions: `docs/handoff/`.
