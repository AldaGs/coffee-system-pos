# Schema migrations — how they actually run

Three places hold the DDL for this app, and a contributor change is only
"live on an install" once that install pulls the new SQL through the right
trigger. Confusing the triggers is the #1 cause of schema drift bugs.

## The three DDL sources (keep in sync)

| File | When it runs | Audience |
|---|---|---|
| `src/components/SetupScreen.jsx` (`schemaQuery` ~line 104–846) | First-time install — user clicks "New install" or initial connect flow | Fresh Supabase project, no tables yet |
| `api/install.js` (`schemaQuery` ~line 15–871) | Existing install — Admin → Settings → "Update Schema" | Existing project, schema may be stale |
| `db/migrations/NNN_*.sql` | Manual one-off in Supabase SQL editor | Last resort / contributor reference |

When you add a column, table, RPC, constraint, etc., **edit all three.**
The migration file lets a contributor apply just that diff; the two embedded
copies let real users get the change without paste-and-pray.

## The two SQL endpoints (both safe)

| Endpoint | Caller | Behavior |
|---|---|---|
| `/api/run-sql` | SetupScreen install flow | Proxies to Management API `/database/query`. Propagates non-2xx as error. |
| `/api/install` | Admin "Update Schema" button | Same endpoint, wraps with `success: false` envelope. Propagates errors. |

Both wrap the full SQL string in a single transaction server-side
(Management API behavior). **One failed statement rolls back the whole
batch and surfaces an error to the user.** Silent failures don't happen
through these paths — if the user reports a missing column or function,
the schema simply wasn't re-applied, not partially applied.

## The gotcha that bit us twice

`SetupScreen.jsx` has TWO buttons that both touch the same project:

- **"New install" / `handleHolyGrailInstall`** — runs the full `schemaQuery`.
- **"Connect to existing" / `handleStandardConnect`** — re-fetches the anon
  key and stores it. **Does NOT run any SQL.**

A user who clicks "Connect to existing" expecting it to "refresh" the
schema gets the same DDL their project was created with, regardless of
what's been pushed to `main` since. The only way to apply new DDL to an
existing install is the **"Update Schema" button in Admin → Settings**
(which runs `/api/install`).

If you change the schema and want to verify it landed:

1. Push the code.
2. Have the user click Admin → Settings → "Update Schema".
3. Watch for the success toast.

NOT just "re-connect" in SetupScreen.

## Migration-authoring conventions

Schema 3.2 adds `049_online_delivery_areas.sql` for point-in-area delivery
pricing and optional shipping quotes. Schema 3.3 adds
`050_public_delivery_coverage.sql` for the customer map's whitelisted area
overlay. The current full schema is mirrored in
`db/schema-latest.sql`, `api/install.js` and `src/components/SetupScreen.jsx`;
the in-app upgrade path also includes the same SQL in `api/_schemaDeltas.js`.

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
