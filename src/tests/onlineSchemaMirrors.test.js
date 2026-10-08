import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { APP_SCHEMA_VERSION } from '../utils/schemaVersion';
import { VERSION_ORDER } from '../../api/_schemaDeltas';

const read = (path) => readFileSync(path, 'utf8');
const strip = (sql) => sql.replace(/\s+/g, ' ').trim();
const functionSql = (source, name, signature) => {
  const start = source.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = source.indexOf(`GRANT EXECUTE ON FUNCTION public.${name}${signature} TO `, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return strip(source.slice(start, source.indexOf(';', end) + 1));
};

describe('online order schema mirrors', () => {
  it('keeps the version and latest full schema synchronized', () => {
    expect(APP_SCHEMA_VERSION).toBe('3.5');
    expect(VERSION_ORDER.at(-1)).toBe(APP_SCHEMA_VERSION);
    const install = read('api/install.js');
    const start = install.indexOf('  const schemaQuery = `') + '  const schemaQuery = `'.length;
    const end = install.indexOf('\n  `;', start);
    const mirror = read('db/schema-latest.sql').replace(/^--[^\n]*\n--[^\n]*\n/, '');
    expect(strip(mirror)).toBe(strip(install.slice(start, end)));
    expect(install).toContain("VALUES ('schema_version', '3.5', now())");
    expect(read('src/components/SetupScreen.jsx')).toContain("VALUES ('schema_version', '3.5', now())");
  });

  it('keeps area, quote and place/status RPCs identical in the migration and both install paths', () => {
    const sources = [
      read('db/migrations/049_online_delivery_areas.sql'),
      read('api/_schemaDeltas.js'),
      read('api/install.js'),
      read('src/components/SetupScreen.jsx'),
    ];
    for (const [name, signature] of [
      ['online_polygon_contains', '(jsonb,double precision,double precision)'],
      ['online_delivery_area', '(double precision,double precision)'],
      ['get_delivery_quote', '(double precision,double precision)'],
      ['set_shipping_quote', '(bigint,int,boolean)'],
      ['public_place_order', '(jsonb)'],
      ['get_order_status', '(text)'],
    ]) {
      // 3.5 (migration 052) redefined the place/status RPCs for Clip.
      const ref = ['public_place_order', 'get_order_status'].includes(name) ? read('db/migrations/052_clip_pay_window.sql') : sources[0];
      const expected = functionSql(ref, name, signature);
      sources.slice(1).forEach((source) => expect(functionSql(source, name, signature)).toBe(expected));
    }
    const place = functionSql(read('db/migrations/052_clip_pay_window.sql'), 'public_place_order', '(jsonb)');
    expect(place).toContain("payload->>'expected_quote_kind' IS DISTINCT FROM v_quote->>'kind'");
    expect(place).toContain("payload->>'expected_fee_cents' IS DISTINCT FROM v_quote->>'fee_cents'");
    expect(place).toContain("payload->>'expected_area_id' IS DISTINCT FROM v_quote->'area'->>'id'");
    expect(place).toContain("RAISE EXCEPTION 'quote_changed'");
  });

  it('keeps the public coverage whitelist identical in migration, delta and full installs', () => {
    const sources = [
      read('db/migrations/050_public_delivery_coverage.sql'),
      read('api/_schemaDeltas.js'),
      read('api/install.js'),
      read('src/components/SetupScreen.jsx'),
    ];
    const expected = functionSql(sources[0], 'get_order_menu', '()');
    sources.slice(1).forEach((source) => expect(functionSql(source, 'get_order_menu', '()')).toBe(expected));
    expect(expected).toContain("'{shop,deliveryAreas}'");
  });
});
