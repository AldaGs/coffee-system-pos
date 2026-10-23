# Schema migrations

`db/migrations/NNN_*.sql` is the only schema source.

- `000_baseline.sql` is the full schema as of 5.5 (old 001–068 squashed, drift fixed).
  It is idempotent, so it also upgrades installs older than 5.5.
- Every change after that is a new file, `069_….sql`, `070_….sql`, … Bump
  `APP_SCHEMA_VERSION` in `src/utils/schemaVersion.js` with it.
- `archive/` holds the old 001–068 files for reference. Nothing runs them.

## How they run

`/api/install` (first install from SetupScreen, and Admin → Settings → "Update
Schema") creates `public.schema_migrations`, runs every file not listed there
(one Management API request per file, each in its own transaction), records it,
then stamps `schema_meta.schema_version` for sibling apps and cached clients.
An install that predates the ledger and is stamped 5.5 counts the baseline as
already applied.

"Connect to existing" in SetupScreen runs no SQL; only "Update Schema" applies
new migrations to an existing project.

Tables owned by tinylogistics / tinybooks (`order_fulfillment`,
`push_subscriptions`, `book_*`, …) live in the same database. Never create or
drop them here.

`src/tests/schemaBaseline.test.js` runs every file twice on an in-process
Postgres (PGlite) with a Supabase stub, so a migration must be idempotent.

## Writing a migration

`CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE FUNCTION` are
forgiving, but they silently skip if the prior version already exists.
That means any **column add** or **constraint change** on an existing
table needs an explicit idempotent ALTER, or installs that ran an earlier
draft will be stuck.

### Adding a column

```sql
CREATE TABLE IF NOT EXISTS public.foo (
  id        bigint PRIMARY KEY,
  new_col   bool NOT NULL DEFAULT false  -- desired final shape
);
-- Heals installs that ran an earlier draft without new_col.
ALTER TABLE public.foo ADD COLUMN IF NOT EXISTS new_col bool NOT NULL DEFAULT false;
```

### Changing FK actions (or any constraint)

```sql
ALTER TABLE public.bar
  DROP CONSTRAINT IF EXISTS bar_foo_id_fkey;
ALTER TABLE public.bar
  ADD CONSTRAINT bar_foo_id_fkey
    FOREIGN KEY (foo_id) REFERENCES public.foo(id)
    ON UPDATE CASCADE ON DELETE CASCADE;  -- desired final shape
```

### Real examples in this repo

- `010_split_menu_data.sql` — uses `CREATE TABLE IF NOT EXISTS` plus `ALTER
  TABLE ... ADD COLUMN IF NOT EXISTS allow_multiple` for the column added
  mid-development.
- `011_public_menu_rpc.sql` — same `ALTER ADD COLUMN IF NOT EXISTS` at the
  top to self-heal stale installs before defining the RPC that uses the
  column.
- `012_normalize_menu_fks.sql` — `DROP CONSTRAINT IF EXISTS` + re-add with
  the correct actions, for installs that ran a draft of 010 without
  `ON UPDATE CASCADE`.

## Verifying the Management API behavior empirically

If you ever doubt "are errors really propagating?" run
[`db/probe-management-api.sql`](probe-management-api.sql) in the Supabase
SQL editor. It's a self-contained test that proves the endpoint is
transactional and surfaces errors. Run it on a non-production project.
