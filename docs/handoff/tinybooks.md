# Handoff — `AldaGs/tinybooks` (books / accounting)

**Start a session in that repo.** Context: `../SECURITY-1.6.md`, and `README.md` here.

Not attached to the session where this was written, so the findings below come from the
live project's catalog rather than from reading the code. **Confirm each one before acting.**

## The finding — **High**

Twenty-two `book_*` tables each carry a single policy of the form

```
<table>_rw   FOR ALL TO authenticated USING (true)
```

```
book_accounts            book_capital_movements   book_category_map      book_bills
book_employees           book_expense_overrides   book_expenses          book_fixed_assets
book_journal             book_journal_lines       book_loan_payments     book_loans
book_loans_made          book_loans_made_payments book_meta              book_payment_processors
book_payroll_runs        book_purchase_lines      book_purchase_orders   book_receivables
book_suppliers
```

Any account that can sign in to the project can read and write all of it: the ledger,
payroll runs, employee records, loans, supplier terms. This is the most sensitive data on
the project.

Two things currently stand between that and a stranger, and only the first is a control:

1. Public sign-ups — **off** as of tinypos 1.6 (setup now turns them off; do not turn them
   back on).
2. Nobody having created an account earlier. Verified at audit time: 3 auth users, 3 linked
   `app_users` rows, 0 unlisted.

So there is no *known* exposure today — but the tables are protected by a setting rather
than by a rule, and any future account (a device, a contractor, a mistake) inherits full
access to the books.

## The fix

Exactly tinypos `db/migrations/042_enforce_app_users_allowlist.sql`, with the `book_*` list
in place of the POS tables:

```sql
CREATE POLICY book_expenses_app_users_rw ON public.book_expenses
  FOR ALL TO authenticated
  USING (public.is_app_user(auth.uid()))
  WITH CHECK (public.is_app_user(auth.uid()));
```

`is_app_user(uuid)` already exists on the project and is granted to `authenticated`. The
tinypos migration does this in a `DO` loop over a table-name array and drops the old
policies by table rather than by name — copy that shape.

**Consider going further than tinypos did.** Books are not till data: if only the owner
should see payroll and loans, use `public.is_app_admin(auth.uid())` instead. That function
also already exists. A device account has no business reading the ledger.

## Check before applying

- Every account tinybooks signs in as must be in `app_users` and not disabled. An account
  missing from it will see **empty tables, not an error** — which reads as data loss.
- If tinybooks reads any tinypos table directly (`sales`, `expenses`) for reporting, those
  are now allowlisted too. Same accounts, so it should be unaffected — worth confirming.
- The books app defines no functions of its own in the live catalog. If that has changed,
  apply tinypos `041` (EXECUTE grants) and `046` (`search_path`) as well, and remember
  `ALTER DEFAULT PRIVILEGES` on `public` now means a new function needs an explicit
  `GRANT EXECUTE ... TO anon` if a public page calls it.

## Verify

```sql
BEGIN;
-- apply the policies
SELECT set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-000000000000','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.book_journal;   -- expect 0
ROLLBACK;
```

Then the same with a real `app_users.auth_user_id` and confirm the rows come back.
