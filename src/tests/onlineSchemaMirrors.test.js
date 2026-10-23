import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const strip = (sql) => sql.replace(/\s+/g, ' ').trim();
const functionSql = (source, name, signature) => {
  const start = source.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = source.indexOf(`GRANT EXECUTE ON FUNCTION public.${name}${signature} TO `, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return strip(source.slice(start, source.indexOf(';', end) + 1));
};

describe('online order RPCs in the baseline', () => {
  const baseline = read('db/migrations/000_baseline.sql');

  it('match the latest archived migration that defined them', () => {
    for (const [name, signature, file] of [
      ['online_polygon_contains', '(jsonb,double precision,double precision)', '049_online_delivery_areas'],
      ['online_delivery_area', '(double precision,double precision)', '049_online_delivery_areas'],
      ['get_delivery_quote', '(double precision,double precision)', '049_online_delivery_areas'],
      ['set_shipping_quote', '(bigint,int,boolean)', '049_online_delivery_areas'],
      ['public_place_order', '(jsonb)', '054_cashier_only_modifiers'],
      ['get_order_status', '(text)', '068_order_tracking_cfdi_links'],
      ['get_order_menu', '()', '050_public_delivery_coverage'],
    ]) {
      const expected = functionSql(read(`db/migrations/archive/${file}.sql`), name, signature);
      expect(functionSql(baseline, name, signature)).toBe(expected);
    }
  });

  it('keeps the quote guard and the coverage whitelist', () => {
    const place = functionSql(baseline, 'public_place_order', '(jsonb)');
    expect(place).toContain("payload->>'expected_quote_kind' IS DISTINCT FROM v_quote->>'kind'");
    expect(place).toContain("payload->>'expected_fee_cents' IS DISTINCT FROM v_quote->>'fee_cents'");
    expect(place).toContain("payload->>'expected_area_id' IS DISTINCT FROM v_quote->'area'->>'id'");
    expect(place).toContain("RAISE EXCEPTION 'quote_changed'");
    expect(functionSql(baseline, 'get_order_menu', '()')).toContain("'{shop,deliveryAreas}'");
  });
});
