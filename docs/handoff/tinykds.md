# Handoff — `AldaGs/tinykds` (kitchen display)

**Start a session in that repo.** Context: `../SECURITY-1.6.md`, and `README.md` here.

## The finding

`order_fulfillment` carries two policies, confirmed on the live project
(`qqmwzmddalroazcjjfre`):

```
KDS anon read     SELECT  TO anon  USING (true)
KDS anon update   UPDATE  TO anon  USING (true) WITH CHECK (true)
```

The anon key is **printed inside the QR code on every receipt** (tinypos builds it in
`src/utils/cfdiUrl.js`) and is in the public menu link. So anyone who has held one receipt
can read your entire order queue — items, ticket names, timing — and mark any order as
done or not done. No sign-in.

Neither policy is created by tinypos's install script, which is why this was left alone:
dropping them from the POS side would have broken the kitchen display with no replacement.

Severity: **High.** Reading the queue is a privacy leak; writing to it is an operational
attack — an outsider can clear the kitchen's screen mid-service.

## Before changing anything

1. **Does the KDS actually run on the anon key?** Look for `createClient(url, anonKey)` with
   no sign-in, or a display opened from a plain URL on a tablet. If the KDS signs in with a
   real account, these policies may be dead weight and can simply be dropped — check the
   Supabase logs for anon requests to `order_fulfillment` first.
2. **List every column the display reads and every field it writes.** The RPCs below should
   expose exactly those and nothing else.
3. Note `order_fulfillment` also has three `authenticated ... USING (true)` policies
   (`Authenticated devices can read tickets`, `Authenticated devices can update tickets`,
   `auth read fulfillment`). Those are the allowlist problem, below.

## The fix

### A. If the KDS is genuinely anonymous

Replace the two anon policies with two `SECURITY DEFINER` functions, following
`db/migrations/039_cfdi_portal_rpcs.sql` in tinypos:

- `kds_list_orders()` — returns only the open orders and only the fields the screen draws.
- `kds_set_order_state(p_id, p_state)` — accepts only the state transitions the screen can
  make; rejects anything else.

Then, following `040_drop_cfdi_anon_policies.sql`:

```sql
DROP POLICY IF EXISTS "KDS anon read"   ON public.order_fulfillment;
DROP POLICY IF EXISTS "KDS anon update" ON public.order_fulfillment;
REVOKE ALL ON TABLE public.order_fulfillment FROM anon;
```

**Deploy the KDS that calls the RPCs before applying the drops**, exactly as tinypos
sequenced steps 1 and 2 — otherwise the kitchen screen goes blank mid-service.

A display that is public by URL is still public: consider a per-display token the RPC
requires, so a receipt alone is not enough.

### B. Either way: the allowlist

Replace the three `authenticated ... USING (true)` policies with the shared predicate:

```sql
CREATE POLICY order_fulfillment_app_users_rw ON public.order_fulfillment
  FOR ALL TO authenticated
  USING (public.is_app_user(auth.uid()))
  WITH CHECK (public.is_app_user(auth.uid()));
```

`is_app_user` already exists on the project (tinypos migration 042) and is granted to
`authenticated`. Check `app_users` covers every account the KDS signs in as first.

### C. Function EXECUTE

These belong to this app and are callable by `anon` today:

```
create_fulfillment_ticket()
create_fulfillment_from_active_ticket()
check_requires_logistics(order_items jsonb)
```

Apply the pattern in `db/migrations/041_function_execute_grants.sql`: revoke from `PUBLIC,
anon, authenticated`, re-grant only what each role needs. Remember plain
`REVOKE ... FROM PUBLIC` does nothing on its own — Supabase grants `anon` directly.

All three also lack a pinned `search_path` (`046_function_search_path.sql` shows the
`ALTER FUNCTION` loop).

## Verify

In one `BEGIN … ROLLBACK`, apply the change, then:

```sql
SET LOCAL ROLE anon;
SELECT count(*) FROM public.order_fulfillment;   -- expect: permission denied
SELECT public.kds_list_orders();                 -- expect: the open orders
```

and confirm the display's own flow end to end before applying for real.
