// db/migrations/NNN_*.sql is the only schema source. Old files live in
// db/migrations/archive/ for reference and are never run.
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('../db/migrations/', import.meta.url);

// Installs stamped with this version already have everything in 000_baseline.
export const BASELINE_VERSION = '5.5';

export function listMigrations() {
  return readdirSync(DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort()
    .map((f) => ({ id: f.slice(0, -4), sql: readFileSync(new URL(f, DIR), 'utf8') }));
}

// Creates the ledger and, on an install that predates it, records the baseline
// as applied when schema_version says it is already there.
export const LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF to_regclass('public.schema_meta') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.schema_migrations (id)
      SELECT '000_baseline' FROM public.schema_meta
      WHERE key = 'schema_version' AND value = '${BASELINE_VERSION}'
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;
`;

export const appliedSql = 'SELECT id FROM public.schema_migrations;';

export const recordSql = (id) =>
  `INSERT INTO public.schema_migrations (id) VALUES ('${id}') ON CONFLICT DO NOTHING;`;

// Sibling apps and cached PWA clients still read schema_version.
export const stampSql = (version) => `
INSERT INTO public.schema_meta (key, value, updated_at)
VALUES ('schema_version', '${version}', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
`;
