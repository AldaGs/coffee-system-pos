// End-to-end smoke checks of the three money paths against the real schema:
// ring + sync a sale, place a public order, request a CFDI.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migratedDb } from './pgliteDb';

let db;
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
// Public pages call these RPCs with the anon key.
const asAnon = async (sql, params) => {
  await db.exec('SET ROLE anon');
  try { return await one(sql, params); } finally { await db.exec('RESET ROLE'); }
};

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    UPDATE public.shop_settings SET menu_data = jsonb_set(menu_data, '{posSettings,onlineOrders}',
      '{"enabled": true, "payments": {"methods": ["cash"]}}') WHERE id = 1;
    INSERT INTO public.menu_categories (name) VALUES ('Café') ON CONFLICT (name) DO NOTHING;
    INSERT INTO public.menu_items (id, category_id, name, base_price_cents)
      SELECT 'latte', id, 'Latte', 5500 FROM public.menu_categories WHERE name = 'Café';
  `);
}, 120_000);

afterAll(() => db?.close());

describe('smoke', () => {
  it('syncs a sale once even when the device retries', async () => {
    const sale = [
      'a0000000-0000-4000-8000-000000000001', 'T-1', 'Ana', 11000, 'cash',
      JSON.stringify([{ id: 'latte', name: 'Latte', qty: 2, price: 5500 }]),
    ];
    const upsert = `INSERT INTO public.sales (local_id, ticket_id, cashier_name, total_amount, payment_method, items)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (local_id) DO UPDATE SET total_amount = EXCLUDED.total_amount`;
    await db.query(upsert, sale);
    await db.query(upsert, sale);
    expect(await one(`SELECT count(*)::int AS n, sum(total_amount)::int AS total FROM public.sales WHERE ticket_id = 'T-1'`))
      .toEqual({ n: 1, total: 11000 });
  });

  it('places a public order and reports its status', async () => {
    const payload = {
      name: 'Luis', phone: '5512345678', order_type: 'pickup', payment_method: 'cash',
      items: [{ id: 'latte', qty: 2, modifiers: [] }],
    };
    const { token } = await asAnon('SELECT public.public_place_order($1) AS token', [payload]);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const order = await one('SELECT total_cents, status FROM public.online_orders WHERE token = $1', [token]);
    expect(order).toEqual({ total_cents: 11000, status: 'requested' });
    const { s } = await asAnon('SELECT public.get_order_status($1) AS s', [token]);
    expect(s).toMatchObject({ found: true, status: 'requested', total_cents: 11000 });
  });

  it('requests a CFDI for a paid ticket', async () => {
    const { r } = await asAnon(`SELECT public.cfdi_request_invoice('T-1', 'XAXX010101000', 'PUBLICO EN GENERAL',
      '616', 'S01', '06000', 'luis@example.com') AS r`);
    expect(r).toMatchObject({ ok: true });
    const sale = await one(`SELECT cfdi_status, fiscal_profile_id IS NOT NULL AS has_profile FROM public.sales WHERE ticket_id = 'T-1'`);
    expect(sale).toEqual({ cfdi_status: 'requested', has_profile: true });
  });

  it('keeps anon out of the tables behind those RPCs', async () => {
    await expect(asAnon('SELECT count(*) FROM public.sales')).rejects.toThrow(/permission denied/);
  });
});
