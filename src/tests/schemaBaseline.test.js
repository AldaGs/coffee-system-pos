import { describe, expect, it } from 'vitest';
import { APP_SCHEMA_VERSION } from '../utils/schemaVersion';
import { listMigrations } from '../../api/_migrations.js';
import { migratedDb } from './pgliteDb';

const tables = (db) => db.query(`
  SELECT table_name, column_name, data_type FROM information_schema.columns
  WHERE table_schema = 'public' ORDER BY 1, 2`).then((r) => r.rows);

describe('schema baseline', () => {
  it('migration files are numbered without gaps and the app version is current', () => {
    const names = listMigrations().map((m) => m.id);
    expect(names[0]).toBe('000_baseline');
    // After the baseline, numbering continues where the archive (001–068) stopped.
    names.slice(1).forEach((n, i) => expect(n.slice(0, 3)).toBe(String(69 + i).padStart(3, '0')));
    expect(APP_SCHEMA_VERSION).toBe('5.6');
  });

  it('applies on an empty Supabase-like database and re-applies as a no-op', async () => {
    const db = await migratedDb();
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

    // POS-only shop: a delivery order's status must not need order_fulfillment.
    await db.exec(`INSERT INTO public.online_orders (token, customer_name, phone, items, total_cents, status, order_type, active_ticket_id)
      VALUES (repeat('a', 32), 'x', '1', '[]', 100, 'accepted', 'delivery', 1)`);
    const status = await db.query(`SELECT public.get_order_status(repeat('a', 32)) AS s`);
    expect(status.rows[0].s).toMatchObject({ found: true, status: 'accepted' });
    await db.close();
  }, 120_000);
});
