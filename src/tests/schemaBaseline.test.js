import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { APP_SCHEMA_VERSION } from '../utils/schemaVersion';
import { listMigrations } from '../../api/_migrations.js';

// The pieces of a Supabase project the schema relies on.
const SUPABASE_STUB = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT NULL::text';
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb';
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid, bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE PUBLICATION supabase_realtime;
`;

const tables = (db) => db.query(`
  SELECT table_name, column_name, data_type FROM information_schema.columns
  WHERE table_schema = 'public' ORDER BY 1, 2`).then((r) => r.rows);

describe('schema baseline', () => {
  it('migration files are numbered without gaps and the app version is current', () => {
    const names = listMigrations().map((m) => m.id);
    expect(names[0]).toBe('000_baseline');
    names.forEach((n, i) => expect(n.slice(0, 3)).toBe(String(i).padStart(3, '0')));
    expect(APP_SCHEMA_VERSION).toBe('5.5');
  });

  it('applies on an empty Supabase-like database and re-applies as a no-op', async () => {
    const db = await PGlite.create({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUB);
    for (const m of listMigrations()) await db.exec(m.sql);
    const first = await tables(db);
    for (const m of listMigrations()) await db.exec(m.sql);
    expect(await tables(db)).toEqual(first);

    const names = new Set(first.map((r) => r.table_name));
    for (const t of ['sales', 'active_tickets', 'online_orders', 'floor_plan', 'order_alert_devices', 'cfdi_email_settings']) {
      expect(names.has(t)).toBe(true);
    }
    // tinylogistics owns these; the baseline must not create them.
    expect(names.has('order_fulfillment')).toBe(false);
    expect(names.has('push_subscriptions')).toBe(false);
    const cols = first.filter((r) => r.table_name === 'active_tickets').map((r) => r.column_name);
    expect(cols).toEqual(expect.arrayContaining(['kds_sent', 'table_id', 'seats', 'online_paid']));
    const trig = await db.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'sales_cfdi_notify'`);
    expect(trig.rows).toHaveLength(1);
    await db.close();
  }, 120_000);
});
