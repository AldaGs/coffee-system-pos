// Forward-only schema deltas for the in-app "Update Schema" button.
//
// WHY THIS EXISTS
// The full install script (api/install.js `schemaQuery`) recreates every
// table/policy/function AND re-runs every data backfill on each click. On a
// live DB under Vercel Hobby's ~10s function cap that reliably times out with
// a 500 ("came back but nothing updated"). A version bump should only run the
// SQL that version introduced — not the whole schema.
//
// HOW IT WORKS
// The client sends its currently-installed `fromVersion`. `deltasFrom()`
// returns the ordered SQL to apply to reach the latest version — but ONLY when
// every intervening version has a registered delta here. If there's a gap
// (unknown/old install, or a version we never registered a delta for), it
// returns null and install.js falls back to the full from-scratch script. So
// first installs and big jumps stay correct; the common "one version behind"
// case becomes a tiny, fast, timeout-proof apply.
//
// SYNC INVARIANT (extends the existing 3-place rule in schemaVersion.js):
// When you bump APP_SCHEMA_VERSION and add install SQL, ALSO:
//   1. Append the new version to VERSION_ORDER (in order).
//   2. Append a { version, sql } entry to SCHEMA_DELTAS whose SQL is that
//      version's migration, ending with stamp(version).
// The full install.js / SetupScreen.jsx blocks remain the fallback + first
// install path and must still be updated as before.

// Every schema version the app has ever shipped, oldest → newest. Used only to
// order versions and detect gaps; mirrors the changelog in
// src/utils/schemaVersion.js.
export const VERSION_ORDER = ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6'];

// Stamps schema_meta so a (partial) apply is detectable and the banner clears.
const stamp = (v) => `
INSERT INTO public.schema_meta (key, value, updated_at)
VALUES ('schema_version', '${v}', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
`;

// Ordered deltas. Each upgrades FROM the previous version TO `version`.
export const SCHEMA_DELTAS = [
  {
    // 0.7 — public-menu item extras: get_active_menu / get_menu_by_id now emit
    // per-item roast_date + whatsapp_url (migration 029). Idempotent RPC
    // rewrite; no table change (both fields live in menu_items.data jsonb).
    version: '0.7',
    sql: `
CREATE OR REPLACE FUNCTION public.get_active_menu(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_tz text; v_local timestamp;
  v_menu_id bigint; v_kind text; v_name text; v_data jsonb; v_shop jsonb;
BEGIN
  v_tz := public.shop_timezone();
  v_local := (p_now AT TIME ZONE v_tz)::timestamp;
  SELECT m.id, m.kind, m.name, m.data INTO v_menu_id, v_kind, v_name, v_data
  FROM public.menus m
  WHERE m.is_active = true
    AND (
      NOT EXISTS (SELECT 1 FROM public.menu_schedules s WHERE s.menu_id = m.id)
      OR EXISTS (
        SELECT 1 FROM public.menu_schedules s
        WHERE s.menu_id = m.id
          AND public.schedule_matches(s.days_of_week, s.start_time, s.end_time,
                                      s.start_date, s.end_date, v_local)
      )
    )
  ORDER BY m.priority DESC, m.created_at DESC LIMIT 1;
  IF v_menu_id IS NULL THEN
    SELECT m.id, m.kind, m.name, m.data INTO v_menu_id, v_kind, v_name, v_data
    FROM public.menus m WHERE m.kind = 'live' LIMIT 1;
  END IF;
  v_shop := jsonb_build_object(
    'name', COALESCE((SELECT menu_data->'posSettings'->>'name' FROM public.shop_settings WHERE id = 1), 'Menu'),
    'brand_color', COALESCE((SELECT menu_data->'posSettings'->>'brandColor' FROM public.shop_settings WHERE id = 1), '#f28b05'),
    'language', COALESCE((SELECT menu_data->'posSettings'->>'language' FROM public.shop_settings WHERE id = 1), 'es'),
    'timezone', v_tz
  );

  IF v_kind = 'live' OR v_kind = 'designed' THEN
    RETURN jsonb_build_object(
      'menu', jsonb_build_object('id', v_menu_id, 'kind', v_kind, 'name', v_name, 'data', v_data),
      'shop', v_shop,
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'sort_order', c.sort_order,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', i.id, 'name', i.name, 'price_cents', i.base_price_cents,
              'price_type', i.price_type, 'emoji', i.emoji, 'image_url', i.image_url,
              'sort_order', i.sort_order,
              'available', public.menu_item_available(i.id),
              'roast_date', i.data->>'roastDate', 'whatsapp_url', i.data->>'whatsappUrl',
              'modifier_group_ids', COALESCE((
                SELECT jsonb_agg(l.group_id ORDER BY l.sort_order)
                FROM public.menu_item_modifier_groups l
                JOIN public.menu_modifier_groups g ON g.id = l.group_id
                WHERE l.item_id = i.id AND g.is_hidden = false
              ), '[]'::jsonb)
            ) ORDER BY i.sort_order)
            FROM public.menu_items i WHERE i.category_id = c.id AND i.is_hidden = false
          ), '[]'::jsonb)
        ) ORDER BY c.sort_order)
        FROM public.menu_categories c WHERE c.is_hidden = false
      ), '[]'::jsonb),
      'modifier_groups', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', g.id, 'name', g.name, 'allow_multiple', g.allow_multiple,
          'options', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', o.id, 'name', o.name, 'price_delta_cents', o.price_delta_cents
            ) ORDER BY o.sort_order)
            FROM public.menu_modifier_options o WHERE o.group_id = g.id
          ), '[]'::jsonb)
        ) ORDER BY g.sort_order)
        FROM public.menu_modifier_groups g WHERE g.is_hidden = false
      ), '[]'::jsonb)
    );
  ELSE
    RETURN jsonb_build_object(
      'menu', jsonb_build_object('id', v_menu_id, 'kind', v_kind, 'name', v_name, 'data', v_data),
      'shop', v_shop,
      'categories', '[]'::jsonb, 'modifier_groups', '[]'::jsonb
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_menu_by_id(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_tz text;
  v_menu_id bigint; v_kind text; v_name text; v_data jsonb; v_shop jsonb;
BEGIN
  v_tz := public.shop_timezone();
  SELECT m.id, m.kind, m.name, m.data INTO v_menu_id, v_kind, v_name, v_data
  FROM public.menus m WHERE m.id = p_id AND m.is_active = true LIMIT 1;
  IF v_menu_id IS NULL THEN
    SELECT m.id, m.kind, m.name, m.data INTO v_menu_id, v_kind, v_name, v_data
    FROM public.menus m WHERE m.kind = 'live' LIMIT 1;
  END IF;
  v_shop := jsonb_build_object(
    'name', COALESCE((SELECT menu_data->'posSettings'->>'name' FROM public.shop_settings WHERE id = 1), 'Menu'),
    'brand_color', COALESCE((SELECT menu_data->'posSettings'->>'brandColor' FROM public.shop_settings WHERE id = 1), '#f28b05'),
    'language', COALESCE((SELECT menu_data->'posSettings'->>'language' FROM public.shop_settings WHERE id = 1), 'es'),
    'timezone', v_tz
  );
  IF v_kind = 'live' OR v_kind = 'designed' THEN
    RETURN jsonb_build_object(
      'menu', jsonb_build_object('id', v_menu_id, 'kind', v_kind, 'name', v_name, 'data', v_data),
      'shop', v_shop,
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'sort_order', c.sort_order,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', i.id, 'name', i.name, 'price_cents', i.base_price_cents,
              'price_type', i.price_type, 'emoji', i.emoji, 'image_url', i.image_url,
              'sort_order', i.sort_order,
              'available', public.menu_item_available(i.id),
              'roast_date', i.data->>'roastDate', 'whatsapp_url', i.data->>'whatsappUrl',
              'modifier_group_ids', COALESCE((
                SELECT jsonb_agg(l.group_id ORDER BY l.sort_order)
                FROM public.menu_item_modifier_groups l
                JOIN public.menu_modifier_groups g ON g.id = l.group_id
                WHERE l.item_id = i.id AND g.is_hidden = false
              ), '[]'::jsonb)
            ) ORDER BY i.sort_order)
            FROM public.menu_items i WHERE i.category_id = c.id AND i.is_hidden = false
          ), '[]'::jsonb)
        ) ORDER BY c.sort_order)
        FROM public.menu_categories c WHERE c.is_hidden = false
      ), '[]'::jsonb),
      'modifier_groups', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', g.id, 'name', g.name, 'allow_multiple', g.allow_multiple,
          'options', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', o.id, 'name', o.name, 'price_delta_cents', o.price_delta_cents
            ) ORDER BY o.sort_order)
            FROM public.menu_modifier_options o WHERE o.group_id = g.id
          ), '[]'::jsonb)
        ) ORDER BY g.sort_order)
        FROM public.menu_modifier_groups g WHERE g.is_hidden = false
      ), '[]'::jsonb)
    );
  ELSE
    RETURN jsonb_build_object(
      'menu', jsonb_build_object('id', v_menu_id, 'kind', v_kind, 'name', v_name, 'data', v_data),
      'shop', v_shop,
      'categories', '[]'::jsonb, 'modifier_groups', '[]'::jsonb
    );
  END IF;
END $$;
${stamp('0.7')}`,
  },
  {
    // 0.8 — public vs register hide split (migration 030): add
    // menu_categories.public_hidden, backfill the public flag from is_hidden
    // ONCE (guarded on first creation), and rewrite get_active_menu /
    // get_menu_by_id to filter the public menu on public_hidden (categories)
    // and menu_items.data->>'publicHidden' (items) instead of is_hidden.
    version: '0.8',
    sql: `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'menu_categories'
      AND column_name = 'public_hidden'
  ) THEN
    ALTER TABLE public.menu_categories
      ADD COLUMN public_hidden bool NOT NULL DEFAULT false;
    UPDATE public.menu_categories SET public_hidden = true WHERE is_hidden = true;
    UPDATE public.menu_items
      SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{publicHidden}', 'true'::jsonb, true)
      WHERE is_hidden = true
        AND NOT (COALESCE(data, '{}'::jsonb) ? 'publicHidden');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_active_menu(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_tz text; v_local timestamp;
  v_menu_id bigint; v_kind text; v_name text; v_data jsonb; v_shop jsonb;
BEGIN
  v_tz := public.shop_timezone();
  v_local := (p_now AT TIME ZONE v_tz)::timestamp;
  SELECT m.id, m.kind, m.name, m.data INTO v_menu_id, v_kind, v_name, v_data
  FROM public.menus m
  WHERE m.is_active = true
    AND (
      NOT EXISTS (SELECT 1 FROM public.menu_schedules s WHERE s.menu_id = m.id)
      OR EXISTS (
        SELECT 1 FROM public.menu_schedules s
        WHERE s.menu_id = m.id
          AND public.schedule_matches(s.days_of_week, s.start_time, s.end_time,
                                      s.start_date, s.end_date, v_local)
      )
    )
  ORDER BY m.priority DESC, m.created_at DESC LIMIT 1;
  IF v_menu_id IS NULL THEN
    SELECT m.id, m.kind, m.name, m.data INTO v_menu_id, v_kind, v_name, v_data
    FROM public.menus m WHERE m.kind = 'live' LIMIT 1;
  END IF;
  v_shop := jsonb_build_object(
    'name', COALESCE((SELECT menu_data->'posSettings'->>'name' FROM public.shop_settings WHERE id = 1), 'Menu'),
    'brand_color', COALESCE((SELECT menu_data->'posSettings'->>'brandColor' FROM public.shop_settings WHERE id = 1), '#f28b05'),
    'language', COALESCE((SELECT menu_data->'posSettings'->>'language' FROM public.shop_settings WHERE id = 1), 'es'),
    'timezone', v_tz
  );

  IF v_kind = 'live' OR v_kind = 'designed' THEN
    RETURN jsonb_build_object(
      'menu', jsonb_build_object('id', v_menu_id, 'kind', v_kind, 'name', v_name, 'data', v_data),
      'shop', v_shop,
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'sort_order', c.sort_order,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', i.id, 'name', i.name, 'price_cents', i.base_price_cents,
              'price_type', i.price_type, 'emoji', i.emoji, 'image_url', i.image_url,
              'sort_order', i.sort_order,
              'available', public.menu_item_available(i.id),
              'roast_date', i.data->>'roastDate', 'whatsapp_url', i.data->>'whatsappUrl',
              'modifier_group_ids', COALESCE((
                SELECT jsonb_agg(l.group_id ORDER BY l.sort_order)
                FROM public.menu_item_modifier_groups l
                JOIN public.menu_modifier_groups g ON g.id = l.group_id
                WHERE l.item_id = i.id AND g.is_hidden = false
              ), '[]'::jsonb)
            ) ORDER BY i.sort_order)
            FROM public.menu_items i
            WHERE i.category_id = c.id
              AND COALESCE((i.data->>'publicHidden')::boolean, false) = false
          ), '[]'::jsonb)
        ) ORDER BY c.sort_order)
        FROM public.menu_categories c WHERE c.public_hidden = false
      ), '[]'::jsonb),
      'modifier_groups', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', g.id, 'name', g.name, 'allow_multiple', g.allow_multiple,
          'options', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', o.id, 'name', o.name, 'price_delta_cents', o.price_delta_cents
            ) ORDER BY o.sort_order)
            FROM public.menu_modifier_options o WHERE o.group_id = g.id
          ), '[]'::jsonb)
        ) ORDER BY g.sort_order)
        FROM public.menu_modifier_groups g WHERE g.is_hidden = false
      ), '[]'::jsonb)
    );
  ELSE
    RETURN jsonb_build_object(
      'menu', jsonb_build_object('id', v_menu_id, 'kind', v_kind, 'name', v_name, 'data', v_data),
      'shop', v_shop,
      'categories', '[]'::jsonb, 'modifier_groups', '[]'::jsonb
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_menu_by_id(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_tz text;
  v_menu_id bigint; v_kind text; v_name text; v_data jsonb; v_shop jsonb;
BEGIN
  v_tz := public.shop_timezone();
  SELECT m.id, m.kind, m.name, m.data INTO v_menu_id, v_kind, v_name, v_data
  FROM public.menus m WHERE m.id = p_id AND m.is_active = true LIMIT 1;
  IF v_menu_id IS NULL THEN
    SELECT m.id, m.kind, m.name, m.data INTO v_menu_id, v_kind, v_name, v_data
    FROM public.menus m WHERE m.kind = 'live' LIMIT 1;
  END IF;
  v_shop := jsonb_build_object(
    'name', COALESCE((SELECT menu_data->'posSettings'->>'name' FROM public.shop_settings WHERE id = 1), 'Menu'),
    'brand_color', COALESCE((SELECT menu_data->'posSettings'->>'brandColor' FROM public.shop_settings WHERE id = 1), '#f28b05'),
    'language', COALESCE((SELECT menu_data->'posSettings'->>'language' FROM public.shop_settings WHERE id = 1), 'es'),
    'timezone', v_tz
  );
  IF v_kind = 'live' OR v_kind = 'designed' THEN
    RETURN jsonb_build_object(
      'menu', jsonb_build_object('id', v_menu_id, 'kind', v_kind, 'name', v_name, 'data', v_data),
      'shop', v_shop,
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'sort_order', c.sort_order,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', i.id, 'name', i.name, 'price_cents', i.base_price_cents,
              'price_type', i.price_type, 'emoji', i.emoji, 'image_url', i.image_url,
              'sort_order', i.sort_order,
              'available', public.menu_item_available(i.id),
              'roast_date', i.data->>'roastDate', 'whatsapp_url', i.data->>'whatsappUrl',
              'modifier_group_ids', COALESCE((
                SELECT jsonb_agg(l.group_id ORDER BY l.sort_order)
                FROM public.menu_item_modifier_groups l
                JOIN public.menu_modifier_groups g ON g.id = l.group_id
                WHERE l.item_id = i.id AND g.is_hidden = false
              ), '[]'::jsonb)
            ) ORDER BY i.sort_order)
            FROM public.menu_items i
            WHERE i.category_id = c.id
              AND COALESCE((i.data->>'publicHidden')::boolean, false) = false
          ), '[]'::jsonb)
        ) ORDER BY c.sort_order)
        FROM public.menu_categories c WHERE c.public_hidden = false
      ), '[]'::jsonb),
      'modifier_groups', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', g.id, 'name', g.name, 'allow_multiple', g.allow_multiple,
          'options', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', o.id, 'name', o.name, 'price_delta_cents', o.price_delta_cents
            ) ORDER BY o.sort_order)
            FROM public.menu_modifier_options o WHERE o.group_id = g.id
          ), '[]'::jsonb)
        ) ORDER BY g.sort_order)
        FROM public.menu_modifier_groups g WHERE g.is_hidden = false
      ), '[]'::jsonb)
    );
  ELSE
    RETURN jsonb_build_object(
      'menu', jsonb_build_object('id', v_menu_id, 'kind', v_kind, 'name', v_name, 'data', v_data),
      'shop', v_shop,
      'categories', '[]'::jsonb, 'modifier_groups', '[]'::jsonb
    );
  END IF;
END $$;
${stamp('0.8')}`,
  },
  {
    // 0.9 — CFDI support: fiscal_profiles table, CFDI columns on sales and
    // active_tickets, anon RLS policies for the public portal, and performance
    // indexes on cfdi_status to prevent timeouts on the Admin panel.
    version: '0.9',
    sql: `
-- Create fiscal_profiles table
CREATE TABLE IF NOT EXISTS public.fiscal_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rfc text NOT NULL UNIQUE,
  razon_social text NOT NULL,
  regimen_fiscal text NOT NULL,
  uso_cfdi text NOT NULL,
  cp text NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fiscal_profiles ENABLE ROW LEVEL SECURITY;

-- Allow read/write for authenticated users (the POS clients).
-- DROP-then-CREATE (Postgres has no CREATE POLICY IF NOT EXISTS) so re-running
-- this delta on a DB where fiscal_profiles was already partially applied does
-- not abort with "policy ... already exists".
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.fiscal_profiles;
CREATE POLICY "Enable all for authenticated users" ON public.fiscal_profiles
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Allow public inserts and selects for the CFDI web portal
-- We restrict select by ID or RFC to prevent dumping the whole table
DROP POLICY IF EXISTS "Enable insert for anon" ON public.fiscal_profiles;
CREATE POLICY "Enable insert for anon" ON public.fiscal_profiles
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable select for anon by rfc or id" ON public.fiscal_profiles;
CREATE POLICY "Enable select for anon by rfc or id" ON public.fiscal_profiles
  FOR SELECT USING (true);

-- Update sales table
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS cfdi_status text DEFAULT 'none' CHECK (cfdi_status IN ('none', 'requested', 'issued', 'reopened', 'canceled')),
ADD COLUMN IF NOT EXISTS cfdi_folio text,
ADD COLUMN IF NOT EXISTS fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id);

-- Update active_tickets to allow tracking CFDI requests before checkout
ALTER TABLE public.active_tickets
ADD COLUMN IF NOT EXISTS cfdi_status text DEFAULT 'none' CHECK (cfdi_status IN ('none', 'requested', 'issued', 'reopened', 'canceled')),
ADD COLUMN IF NOT EXISTS cfdi_folio text,
ADD COLUMN IF NOT EXISTS fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id);

-- ==========================================================================
-- ANON POLICIES: allow the public CFDI portal to read tickets and write CFDI
-- status. The portal connects with the anon key (no sign-in).
-- ==========================================================================

-- Sales: anon can SELECT (to find the sale) and UPDATE (to set cfdi_status)
DROP POLICY IF EXISTS "CFDI portal can read sales" ON public.sales;
CREATE POLICY "CFDI portal can read sales" ON public.sales
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "CFDI portal can update cfdi on sales" ON public.sales;
CREATE POLICY "CFDI portal can update cfdi on sales" ON public.sales
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Active tickets: anon can SELECT (to show unpaid ticket status)
DROP POLICY IF EXISTS "CFDI portal can read active_tickets" ON public.active_tickets;
CREATE POLICY "CFDI portal can read active_tickets" ON public.active_tickets
  FOR SELECT TO anon USING (true);

-- Fiscal profiles: anon can also UPDATE (to refresh an existing RFC's details)
DROP POLICY IF EXISTS "CFDI portal can update fiscal_profiles" ON public.fiscal_profiles;
CREATE POLICY "CFDI portal can update fiscal_profiles" ON public.fiscal_profiles
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Add indexes for cfdi_status to prevent timeouts on the Admin CFDI tab
-- when querying tickets with active CFDI requests on large tables.
CREATE INDEX IF NOT EXISTS idx_sales_cfdi_status ON public.sales(cfdi_status) WHERE cfdi_status != 'none';
CREATE INDEX IF NOT EXISTS idx_active_tickets_cfdi_status ON public.active_tickets(cfdi_status) WHERE cfdi_status != 'none';

${stamp('0.9')}`,
  },
  {
    // 1.0 — CFDI Factura Global periods (migration 033): a cfdi_global_periods
    // table recording which months have had their monthly global invoice
    // issued. The public portal reads it (anon SELECT) to block requests for a
    // closed month and show the "incluido en la Factura Global" legend; the
    // admin CFDI tab closes/reopens periods (authenticated full access).
    version: '1.0',
    sql: `
CREATE TABLE IF NOT EXISTS public.cfdi_global_periods (
  period text PRIMARY KEY,
  business_name text,
  summary jsonb,
  closed_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.cfdi_global_periods ADD COLUMN IF NOT EXISTS summary jsonb;

ALTER TABLE public.cfdi_global_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.cfdi_global_periods;
CREATE POLICY "Enable all for authenticated users" ON public.cfdi_global_periods
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "CFDI portal can read global periods" ON public.cfdi_global_periods;
CREATE POLICY "CFDI portal can read global periods" ON public.cfdi_global_periods
  FOR SELECT TO anon USING (true);

${stamp('1.0')}`,
  },
  {
    // 1.1 — idempotent inventory deduction: dedup table + deduct_inventory_log,
    // keyed on inventory_logs.local_id so a slow-link retry (replay, or a
    // checkout that committed then timed out and was requeued) can't double-count
    // stock (migration 034). The old deduct_inventory is left in place for
    // backward compatibility with app versions that still call it.
    version: '1.1',
    sql: `
CREATE TABLE IF NOT EXISTS public.inventory_deductions_applied (
  local_id uuid PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_deductions_applied ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can access inventory_deductions_applied" ON public.inventory_deductions_applied;
CREATE POLICY "Authenticated can access inventory_deductions_applied" ON public.inventory_deductions_applied
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.deduct_inventory_log(p_local_id uuid, p_item_id bigint, p_qty numeric)
RETURNS TABLE (
  out_id bigint,
  out_name text,
  out_current_stock numeric,
  out_applied boolean
) AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.inventory_deductions_applied (local_id)
  VALUES (p_local_id)
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN QUERY
      SELECT inv.id, inv.name, inv.current_stock, false
      FROM public.inventory AS inv
      WHERE inv.id = p_item_id;
    RETURN;
  END IF;

  RETURN QUERY
    UPDATE public.inventory AS inv
    SET current_stock = inv.current_stock - p_qty
    WHERE inv.id = p_item_id AND inv.current_stock >= p_qty
    RETURNING inv.id, inv.name, inv.current_stock, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

${stamp('1.1')}`,
  },
  {
    // 1.2 — roast / production lot traceability (migration 035): the
    // inventory_lots registry plus inventory.track_lots. Each lot is one
    // received/produced batch carrying a made_date (roast/production) and a
    // received_date (arrival), which differ when roasting is outsourced.
    // track_lots flags participating items; set true when an item is a
    // Transform target. Additive — no change to stock/deduction logic.
    version: '1.2',
    sql: `
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS track_lots boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name     text NOT NULL,
  lot_code      text,
  made_date     date,
  received_date date,
  qty_received  numeric NOT NULL DEFAULT 0,
  qty_remaining numeric NOT NULL DEFAULT 0,
  unit          text,
  unit_cost     numeric DEFAULT 0,
  source_name   text,
  notes         text,
  local_id      uuid UNIQUE,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_lots_item_made_idx
  ON public.inventory_lots (item_name, made_date);
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can access inventory_lots" ON public.inventory_lots;
CREATE POLICY "Authenticated can access inventory_lots" ON public.inventory_lots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

${stamp('1.2')}`,
  },
  {
    // 1.3 — FIFO lot draw-down (migration 036): the lot_consumptions table
    // recording which lot each sale drew from (lot_id -> sales, ticket_id ->
    // lots). Checkout consumes the oldest roast lot first and decrements
    // inventory_lots.qty_remaining. Additive — stock stays owned by
    // inventory.current_stock / deduct_inventory_log.
    version: '1.3',
    sql: `
CREATE TABLE IF NOT EXISTS public.lot_consumptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id             uuid,
  lot_code           text,
  item_name          text,
  qty                numeric NOT NULL DEFAULT 0,
  ticket_id          text,
  deduction_local_id uuid,
  created_at         timestamptz DEFAULT now(),
  local_id           uuid UNIQUE
);
CREATE INDEX IF NOT EXISTS lot_consumptions_lot_idx    ON public.lot_consumptions (lot_id);
CREATE INDEX IF NOT EXISTS lot_consumptions_ticket_idx ON public.lot_consumptions (ticket_id);
ALTER TABLE public.lot_consumptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can access lot_consumptions" ON public.lot_consumptions;
CREATE POLICY "Authenticated can access lot_consumptions" ON public.lot_consumptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

${stamp('1.3')}`,
  },
  {
    // 1.4 — stock returns + the availability check that never fired (migration
    // 037): menu_item_available now accepts inventoryMode 'standard' (the only
    // value the app writes — the 'warehouse' branch was dead, so stock-linked
    // items stayed available at zero stock); restock_inventory_log adds the
    // idempotent mirror of deduct_inventory_log for refund returns and rolled
    // back checkouts; deduct_inventory_log gains out_found so a missing item id
    // stops being reported as "insufficient stock".
    version: '1.4',
    sql: `
-- 1. Availability: accept the mode string the app actually writes ---------------
CREATE OR REPLACE FUNCTION public.menu_item_available(p_item_id text)
RETURNS bool LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb; v_mode text; v_short_id bigint;
BEGIN
  SELECT data INTO v_data FROM public.menu_items WHERE id = p_item_id;
  IF v_data IS NULL THEN RETURN true; END IF;
  v_mode := COALESCE(v_data->>'inventoryMode', 'none');

  IF v_mode IN ('warehouse', 'standard') THEN
    BEGIN v_short_id := NULLIF(v_data->>'linkedWarehouseId','')::bigint;
    EXCEPTION WHEN OTHERS THEN RETURN true; END;
    IF v_short_id IS NULL THEN RETURN true; END IF;
    RETURN COALESCE(
      (SELECT current_stock > 0 FROM public.inventory WHERE id = v_short_id),
      true
    );
  END IF;

  IF v_mode = 'recipe' THEN
    DECLARE v_rid uuid;
    BEGIN
      BEGIN v_rid := NULLIF(v_data->>'linkedRecipeId','')::uuid;
      EXCEPTION WHEN OTHERS THEN RETURN true; END;
      IF v_rid IS NULL THEN RETURN true; END IF;
      RETURN NOT EXISTS (
        SELECT 1
        FROM public.recipes r,
             LATERAL jsonb_array_elements(COALESCE(r.ingredients,'[]'::jsonb)) AS ing(val)
        WHERE r.id = v_rid
          AND COALESCE((ing.val->>'isManual')::bool, false) = false
          AND COALESCE(
                (SELECT current_stock FROM public.inventory
                  WHERE name = (ing.val->>'name') LIMIT 1),
                0
              )
              < (CASE WHEN (ing.val->>'qty') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                      THEN (ing.val->>'qty')::numeric ELSE 0 END)
      );
    END;
  END IF;

  RETURN true;
END $$;

-- 2. Idempotent stock RETURN ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.restock_inventory_log(p_local_id uuid, p_item_id bigint, p_qty numeric)
RETURNS TABLE (
  out_id bigint,
  out_name text,
  out_current_stock numeric,
  out_applied boolean,
  out_found boolean
) AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.inventory_deductions_applied (local_id)
  VALUES (p_local_id)
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Already applied by an earlier (possibly timed-out-but-committed) call.
    RETURN QUERY
      SELECT inv.id, inv.name, inv.current_stock, false, true
      FROM public.inventory AS inv
      WHERE inv.id = p_item_id;
    RETURN;
  END IF;

  RETURN QUERY
    UPDATE public.inventory AS inv
    SET current_stock = inv.current_stock + p_qty
    WHERE inv.id = p_item_id
    RETURNING inv.id, inv.name, inv.current_stock, true, true;

  -- No such item: report it instead of silently succeeding.
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_item_id, NULL::text, NULL::numeric, false, false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Deduction: tell "missing item" apart from "insufficient stock" ------------
DROP FUNCTION IF EXISTS public.deduct_inventory_log(uuid, bigint, numeric);

CREATE OR REPLACE FUNCTION public.deduct_inventory_log(p_local_id uuid, p_item_id bigint, p_qty numeric)
RETURNS TABLE (
  out_id bigint,
  out_name text,
  out_current_stock numeric,
  out_applied boolean,
  out_found boolean
) AS $$
DECLARE
  v_rows integer;
  v_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.inventory WHERE id = p_item_id) INTO v_exists;
  IF NOT v_exists THEN
    -- One row with out_found = false. Callers that only count rows (older app
    -- bundles) see a success and move on; the item doesn't exist, so there is
    -- no stock to move either way.
    RETURN QUERY SELECT p_item_id, NULL::text, NULL::numeric, false, false;
    RETURN;
  END IF;

  INSERT INTO public.inventory_deductions_applied (local_id)
  VALUES (p_local_id)
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN QUERY
      SELECT inv.id, inv.name, inv.current_stock, false, true
      FROM public.inventory AS inv
      WHERE inv.id = p_item_id;
    RETURN;
  END IF;

  -- Guarded so stock never goes negative. An empty result now means exactly one
  -- thing: insufficient stock.
  RETURN QUERY
    UPDATE public.inventory AS inv
    SET current_stock = inv.current_stock - p_qty
    WHERE inv.id = p_item_id AND inv.current_stock >= p_qty
    RETURNING inv.id, inv.name, inv.current_stock, true, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

${stamp('1.4')}`,
  },
  {
    // 1.5 — deduct_inventory_log releases its dedup claim when stock is short
    // (migration 038). Before, the claim committed even though nothing was
    // deducted, so a replayed offline sale was dropped for good.
    version: '1.5',
    sql: `
-- Same signature and return shape as 1.4, so CREATE OR REPLACE is enough.
CREATE OR REPLACE FUNCTION public.deduct_inventory_log(p_local_id uuid, p_item_id bigint, p_qty numeric)
RETURNS TABLE (
  out_id bigint,
  out_name text,
  out_current_stock numeric,
  out_applied boolean,
  out_found boolean
) AS $$
DECLARE
  v_rows integer;
  v_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.inventory WHERE id = p_item_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN QUERY SELECT p_item_id, NULL::text, NULL::numeric, false, false;
    RETURN;
  END IF;

  INSERT INTO public.inventory_deductions_applied (local_id)
  VALUES (p_local_id)
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN QUERY
      SELECT inv.id, inv.name, inv.current_stock, false, true
      FROM public.inventory AS inv
      WHERE inv.id = p_item_id;
    RETURN;
  END IF;

  RETURN QUERY
    UPDATE public.inventory AS inv
    SET current_stock = inv.current_stock - p_qty
    WHERE inv.id = p_item_id AND inv.current_stock >= p_qty
    RETURNING inv.id, inv.name, inv.current_stock, true, true;
  -- Insufficient stock: release the claim so a later replay (after a
  -- restock) can still apply this deduction instead of it being lost.
  IF NOT FOUND THEN
    DELETE FROM public.inventory_deductions_applied WHERE local_id = p_local_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

${stamp('1.5')}`,
  },
  {
    // 1.6 — security lockdown, step 1 (migration 039): the public CFDI portal
    // stops touching tables directly. cfdi_lookup_ticket / cfdi_request_invoice
    // give the anon key a two-function surface over its own ticket; the blanket
    // anon RLS policies from 0.9/1.0 are dropped in the next step, once this
    // version is live. Also carries the CFDI base schema that the from-scratch
    // install script never had.
    version: '1.6',
    sql: `
-- CFDI portal RPCs (schema 1.6, step 1 of the security lockdown).
--
-- WHY
-- Migrations 031/033 gave the \`anon\` role blanket RLS policies so the public
-- CFDI portal (PublicCFDI.jsx, opened from the QR code printed on every
-- receipt) could find a ticket and record a factura request:
--
--   sales                 SELECT + UPDATE  USING (true)
--   active_tickets        SELECT           USING (true)
--   fiscal_profiles       SELECT + INSERT + UPDATE  USING (true)
--   cfdi_global_periods   SELECT           USING (true)
--
-- The anon key is public by design (it ships inside the receipt QR and the
-- menu link), so those policies let anyone who has seen one receipt read the
-- whole sales history — totals, cashier names, loyalty phone numbers — read
-- and rewrite every customer's fiscal data (RFC, razón social, email: personal
-- data under the LFPDPPP), and UPDATE any column of any sale.
--
-- WHAT THIS DOES
-- Replaces that direct table access with two SECURITY DEFINER functions that
-- are the portal's entire surface:
--
--   cfdi_lookup_ticket(p_ref)    -- one ticket, only the fields the page shows
--   cfdi_request_invoice(p_ref, ...) -- upsert the fiscal profile + flag ONE sale
--
-- Both require the caller to already hold the ticket reference from their own
-- receipt. Neither can enumerate, and cfdi_request_invoice writes exactly two
-- columns (fiscal_profile_id, cfdi_status) on exactly one row.
--
-- The anon table policies themselves are dropped in the next migration (040),
-- once the portal shipped here is live — dropping them first would break the
-- portal for customers mid-deploy.

-- ---------------------------------------------------------------------------
-- Base CFDI schema guards.
-- The full from-scratch script in api/install.js never carried the CFDI
-- tables (they only ever shipped as deltas 0.9/1.0), so a brand-new install
-- has no fiscal_profiles at all and the functions below would have nothing to
-- run against. These are the same idempotent statements as deltas 0.9/1.0,
-- minus the anon policies, so first installs and upgrades converge.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rfc text NOT NULL UNIQUE,
  razon_social text NOT NULL,
  regimen_fiscal text NOT NULL,
  uso_cfdi text NOT NULL,
  cp text NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.fiscal_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.fiscal_profiles;
CREATE POLICY "Enable all for authenticated users" ON public.fiscal_profiles
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cfdi_status text DEFAULT 'none' CHECK (cfdi_status IN ('none', 'requested', 'issued', 'reopened', 'canceled')),
  ADD COLUMN IF NOT EXISTS cfdi_folio text,
  ADD COLUMN IF NOT EXISTS fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id);

ALTER TABLE public.active_tickets
  ADD COLUMN IF NOT EXISTS cfdi_status text DEFAULT 'none' CHECK (cfdi_status IN ('none', 'requested', 'issued', 'reopened', 'canceled')),
  ADD COLUMN IF NOT EXISTS cfdi_folio text,
  ADD COLUMN IF NOT EXISTS fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id);

CREATE INDEX IF NOT EXISTS idx_sales_cfdi_status ON public.sales(cfdi_status) WHERE cfdi_status != 'none';
CREATE INDEX IF NOT EXISTS idx_active_tickets_cfdi_status ON public.active_tickets(cfdi_status) WHERE cfdi_status != 'none';

CREATE TABLE IF NOT EXISTS public.cfdi_global_periods (
  period text PRIMARY KEY,
  business_name text,
  summary jsonb,
  closed_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.cfdi_global_periods ADD COLUMN IF NOT EXISTS summary jsonb;
ALTER TABLE public.cfdi_global_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.cfdi_global_periods;
CREATE POLICY "Enable all for authenticated users" ON public.cfdi_global_periods
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Shared resolver: ticket reference -> the one row it names.
-- Mirrors the three lookups PublicCFDI.jsx used to do client-side:
--   1. a uuid  -> sales.local_id   (links from OrdersTab / PNG receipts)
--   2. any ref -> sales.ticket_id  (the original activeTicket.id, as text)
--   3. digits  -> active_tickets.id (ticket still open at the register)
-- Returns the sale id (bigint), whether it is a paid sale, and the row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cfdi_resolve_ticket(
  p_ref text,
  OUT o_id bigint,
  OUT o_is_paid boolean,
  OUT o_row jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_uuid boolean := p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  o_id := NULL; o_is_paid := NULL; o_row := NULL;
  IF p_ref IS NULL OR length(p_ref) = 0 THEN
    RETURN;
  END IF;

  IF v_is_uuid THEN
    SELECT s.id, true, to_jsonb(s) INTO o_id, o_is_paid, o_row
    FROM public.sales s WHERE s.local_id = p_ref::uuid LIMIT 1;
  END IF;

  IF o_id IS NULL THEN
    SELECT s.id, true, to_jsonb(s) INTO o_id, o_is_paid, o_row
    FROM public.sales s WHERE s.ticket_id = p_ref LIMIT 1;
  END IF;

  IF o_id IS NULL AND p_ref ~ '^[0-9]{1,18}$' THEN
    SELECT t.id, false, to_jsonb(t) INTO o_id, o_is_paid, o_row
    FROM public.active_tickets t WHERE t.id = p_ref::bigint LIMIT 1;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- cfdi_lookup_ticket — everything the portal needs, in one call.
--
-- Returns ONLY the fields PublicCFDI.jsx renders. Deliberately withheld from
-- the anon caller: cashier_name, loyalty_phone / loyalty_* columns, splits,
-- payment_method, refund columns, local_id, and every other sale in the table.
-- The fiscal profile comes back only as a prefill for the profile already
-- attached to this very ticket — there is no lookup by RFC any more.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cfdi_lookup_ticket(p_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_id bigint; v_is_paid boolean; v_row jsonb;
  v_profile jsonb := NULL;
  v_global jsonb := NULL;
  v_period text;
BEGIN
  SELECT o_id, o_is_paid, o_row INTO v_id, v_is_paid, v_row
  FROM public.cfdi_resolve_ticket(p_ref);

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF (v_row->>'fiscal_profile_id') IS NOT NULL THEN
    SELECT to_jsonb(f) - 'created_at' - 'updated_at' INTO v_profile
    FROM public.fiscal_profiles f
    WHERE f.id = (v_row->>'fiscal_profile_id')::uuid;
  END IF;

  -- Factura Global block. The period is derived in the SHOP's timezone; the
  -- page used to derive it from the visitor's browser clock, which disagreed
  -- for customers abroad on the first/last day of a month.
  IF v_is_paid AND (v_row->>'created_at') IS NOT NULL THEN
    v_period := to_char(
      ((v_row->>'created_at')::timestamptz AT TIME ZONE public.shop_timezone()), 'YYYY-MM');
    SELECT jsonb_build_object('period', g.period, 'business_name', g.business_name)
    INTO v_global
    FROM public.cfdi_global_periods g WHERE g.period = v_period;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'ticket', jsonb_build_object(
      'id',                v_id,
      'is_paid',           v_is_paid,
      'created_at',        v_row->>'created_at',
      'cfdi_status',       COALESCE(v_row->>'cfdi_status', 'none'),
      'cfdi_folio',        v_row->>'cfdi_folio',
      'fiscal_profile_id', v_row->>'fiscal_profile_id',
      'order_name',        v_row->>'order_name',
      'ticket_id',         v_row->>'ticket_id',
      'items',             COALESCE(v_row->'items', '[]'::jsonb),
      'total_amount',      v_row->'total_amount'
    ),
    'profile', v_profile,
    'global_period', v_global
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- cfdi_request_invoice — record a factura request for ONE ticket.
--
-- Enforces server-side what the page enforced client-side (and what the anon
-- UPDATE policy enforced not at all):
--   * the ref must resolve to a PAID sale (an open ticket can't be invoiced)
--   * its month must not already be closed into a Factura Global
--   * its cfdi_status must be 'none' or 'reopened' (a requested/issued/
--     canceled ticket is read-only to the customer)
--   * only fiscal_profile_id and cfdi_status are ever written
-- Returns { ok, cfdi_status, fiscal_profile_id } or { ok:false, reason }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cfdi_request_invoice(
  p_ref text,
  p_rfc text,
  p_razon_social text,
  p_regimen_fiscal text,
  p_uso_cfdi text,
  p_cp text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint; v_is_paid boolean; v_row jsonb;
  v_status text; v_period text; v_closed boolean;
  v_rfc text := upper(btrim(COALESCE(p_rfc, '')));
  v_profile_id uuid;
BEGIN
  SELECT o_id, o_is_paid, o_row INTO v_id, v_is_paid, v_row
  FROM public.cfdi_resolve_ticket(p_ref);

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF NOT v_is_paid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_paid');
  END IF;

  v_status := COALESCE(v_row->>'cfdi_status', 'none');
  IF v_status NOT IN ('none', 'reopened') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_editable', 'cfdi_status', v_status);
  END IF;

  v_period := to_char(
    ((v_row->>'created_at')::timestamptz AT TIME ZONE public.shop_timezone()), 'YYYY-MM');
  SELECT EXISTS (SELECT 1 FROM public.cfdi_global_periods g WHERE g.period = v_period)
  INTO v_closed;
  -- A reopened request is an explicit admin override, so it survives the close.
  IF v_closed AND v_status = 'none' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'global_closed', 'period', v_period);
  END IF;

  -- Same validation the form does, enforced where it counts.
  IF v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A]$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_rfc');
  END IF;
  IF btrim(COALESCE(p_razon_social, '')) = ''
     OR btrim(COALESCE(p_regimen_fiscal, '')) = ''
     OR btrim(COALESCE(p_uso_cfdi, '')) = ''
     OR COALESCE(p_cp, '') !~ '^[0-9]{5}$'
     OR COALESCE(p_email, '') !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  END IF;

  INSERT INTO public.fiscal_profiles (rfc, razon_social, regimen_fiscal, uso_cfdi, cp, email)
  VALUES (v_rfc, btrim(p_razon_social), btrim(p_regimen_fiscal), btrim(p_uso_cfdi),
          btrim(p_cp), btrim(p_email))
  ON CONFLICT (rfc) DO UPDATE SET
    razon_social   = EXCLUDED.razon_social,
    regimen_fiscal = EXCLUDED.regimen_fiscal,
    uso_cfdi       = EXCLUDED.uso_cfdi,
    cp             = EXCLUDED.cp,
    email          = EXCLUDED.email,
    updated_at     = now()
  RETURNING id INTO v_profile_id;

  UPDATE public.sales
  SET fiscal_profile_id = v_profile_id,
      cfdi_status = 'requested'
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cfdi_status', 'requested',
    'fiscal_profile_id', v_profile_id
  );
END;
$$;

-- The portal is the only anon caller; the POS itself (authenticated) keeps its
-- direct table access. cfdi_resolve_ticket is an internal helper — the two
-- public entry points call it as their definer-owner, so anon needs no grant
-- on it. (Migration 041 revokes the implicit anon/authenticated grants that
-- Supabase adds to every new function; these explicit ones are what survive.)
REVOKE ALL ON FUNCTION public.cfdi_resolve_ticket(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cfdi_lookup_ticket(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cfdi_request_invoice(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_lookup_ticket(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cfdi_request_invoice(text, text, text, text, text, text, text) TO anon, authenticated;

-- Close the anon key's direct table access (schema 1.6, step 2).
--
-- Step 1 (migration 039) gave the public CFDI portal cfdi_lookup_ticket and
-- cfdi_request_invoice. With the portal on those RPCs, the blanket anon
-- policies from migrations 031/033 have no caller left, and every one of them
-- was a hole: the anon key is printed inside the QR code on every receipt, so
-- "anon can SELECT sales USING (true)" meant anyone holding a receipt could
-- read the whole sales history (totals, cashier names, loyalty phone numbers),
-- UPDATE any column of any sale, and read or rewrite every customer's fiscal
-- data — RFC, razón social, email: personal data under the LFPDPPP.
--
-- Two of the fiscal_profiles policies were written without TO anon, so they
-- applied to PUBLIC (every role). Dropping them costs the POS nothing: the
-- "Enable all for authenticated users" policy on that table is untouched.
--
-- ORDER MATTERS: this must not reach a project whose deployed frontend still
-- queries these tables with the anon key, or the portal dies for customers
-- mid-deploy. It ships in the same 1.6 release as the RPCs and the rewritten
-- PublicCFDI.jsx.

-- Sales: the portal's read + "set cfdi_status" write.
DROP POLICY IF EXISTS "CFDI portal can read sales" ON public.sales;
DROP POLICY IF EXISTS "CFDI portal can update cfdi on sales" ON public.sales;

-- Active tickets: the portal's "is this ticket still open?" read.
DROP POLICY IF EXISTS "CFDI portal can read active_tickets" ON public.active_tickets;

-- Fiscal profiles: lookup by RFC, insert, and refresh of an existing RFC.
DROP POLICY IF EXISTS "CFDI portal can update fiscal_profiles" ON public.fiscal_profiles;
DROP POLICY IF EXISTS "Enable insert for anon" ON public.fiscal_profiles;
DROP POLICY IF EXISTS "Enable select for anon by rfc or id" ON public.fiscal_profiles;

-- Global periods: the "already in the Factura Global" legend, now returned by
-- cfdi_lookup_ticket.
DROP POLICY IF EXISTS "CFDI portal can read global periods" ON public.cfdi_global_periods;

-- Policies are only half of it. Supabase grants anon table privileges up front,
-- and RLS then decides which rows those privileges reach — so leaving the GRANT
-- in place would keep the door on its hinges for any future policy that says
-- USING (true) by accident. The portal needs no table privilege at all: its two
-- functions are SECURITY DEFINER and run as their owner.
REVOKE ALL ON TABLE public.sales               FROM anon;
REVOKE ALL ON TABLE public.active_tickets      FROM anon;
REVOKE ALL ON TABLE public.fiscal_profiles     FROM anon;
REVOKE ALL ON TABLE public.cfdi_global_periods FROM anon;

-- NOTE (not fixed here): order_fulfillment carries "KDS anon read" and
-- "KDS anon update" policies, both USING (true). They are not created by this
-- repo's install script — they belong to the kitchen-display app sharing this
-- project — so removing them here would break that app. Same exposure, same
-- anon key; it needs the same RPC treatment on the KDS side.

-- Lock down EXECUTE on this app's functions (schema 1.6, step 3).
--
-- WHY THE EXISTING REVOKES DIDN'T WORK
-- install.js already carries lines like
--     REVOKE ALL ON FUNCTION public.restore_menu_version(bigint) FROM PUBLIC;
-- and they do nothing useful, because Supabase ALSO grants EXECUTE to \`anon\`
-- and \`authenticated\` directly on every function in \`public\` (a default
-- privilege on the schema). Revoking from PUBLIC leaves that direct grant
-- untouched. Checked on the live project: all 32 functions in \`public\` were
-- executable by anon -- the key printed inside every receipt QR code.
--
-- That meant an unauthenticated caller could, among other things:
--   set_cashier_pin / delete_cashier_pin  -- overwrite or wipe any cashier PIN
--   verify_pin                            -- guess 4-digit PINs, unlimited
--   deduct_inventory_log / restock_inventory_log -- move stock
--   restore_menu_version / snapshot_menu  -- roll the live menu back
--   award_loyalty_visits                  -- hand out loyalty visits
--
-- WHAT THIS DOES
-- Revokes EXECUTE from PUBLIC, anon and authenticated on every function this
-- app owns, then grants back exactly what each role needs:
--
--   anon          the public menu (get_active_menu, get_menu_by_id,
--                 get_public_menu, menu_item_available, shop_timezone) and
--                 the two CFDI portal entry points from migration 039
--   authenticated everything the signed-in POS actually calls
--
-- cfdi_resolve_ticket is granted to nobody: it is an internal helper, reached
-- only from inside the two SECURITY DEFINER functions that call it.
--
-- is_app_admin and is_app_user MUST stay granted to authenticated: RLS
-- policies call them, and a policy's function runs as the querying role, not
-- as the policy's owner. Revoking those would lock every signed-in user out
-- of app_users (and, after step 4, out of every table).
--
-- SCOPE: this project is shared with sibling apps (kitchen display, delivery
-- tracking, calendar sync). Their functions -- get_tracking,
-- get_tracking_private, set_tracking_pin, gen_tracking_token,
-- create_fulfillment_ticket, create_fulfillment_from_active_ticket,
-- check_requires_logistics, verify_admin_pin, google_calendar_resync_all,
-- trigger_google_calendar_sync, provision_schema -- are deliberately NOT
-- touched here: this repo does not know which of them their own public pages
-- call, and a blanket revoke would break those apps silently. They carry the
-- same exposure (provision_schema and set_tracking_pin in particular are
-- callable by anyone today) and need the same treatment in their own repos.

DO $do$
DECLARE
  r record;
  -- Functions this repo creates. Matched by name, so every overload is
  -- covered (deduct_inventory ships in two legacy signatures), and missing
  -- ones are simply skipped -- a fresh install has no legacy overloads.
  v_owned text[] := ARRAY[
    'award_loyalty_visits', 'build_menu_snapshot', 'cfdi_lookup_ticket',
    'cfdi_request_invoice', 'cfdi_resolve_ticket', 'claim_or_bootstrap_app_user',
    'deduct_inventory', 'deduct_inventory_log', 'delete_cashier_pin',
    'get_active_menu', 'get_menu_by_id', 'get_public_menu', 'is_app_admin',
    'is_app_user', 'menu_item_available', 'prune_menu_versions',
    'restock_inventory_log', 'restore_menu_version', 'schedule_matches',
    'set_cashier_pin', 'shop_timezone', 'snapshot_menu', 'verify_pin'
  ];
  -- Reachable without signing in (public menu + CFDI portal).
  v_anon text[] := ARRAY[
    'get_active_menu', 'get_menu_by_id', 'get_public_menu',
    'menu_item_available', 'shop_timezone',
    'cfdi_lookup_ticket', 'cfdi_request_invoice'
  ];
  -- Reachable by a signed-in POS client. Everything owned except the internal
  -- resolver and schedule_matches, which is only called from inside
  -- get_active_menu (SECURITY DEFINER, so it runs as the owner).
  v_auth text[] := ARRAY[
    'award_loyalty_visits', 'build_menu_snapshot', 'cfdi_lookup_ticket',
    'cfdi_request_invoice', 'claim_or_bootstrap_app_user', 'deduct_inventory',
    'deduct_inventory_log', 'delete_cashier_pin', 'get_active_menu',
    'get_menu_by_id', 'get_public_menu', 'is_app_admin', 'is_app_user',
    'menu_item_available', 'prune_menu_versions', 'restock_inventory_log',
    'restore_menu_version', 'set_cashier_pin', 'shop_timezone',
    'snapshot_menu', 'verify_pin'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (v_owned)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    IF r.proname = ANY (v_anon) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    END IF;
    IF r.proname = ANY (v_auth) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END
$do$;

-- Stop the bleeding at the source: without this, the next function anyone adds
-- to \`public\` is executable by anon the moment it is created, and we are back
-- to auditing 32 functions by hand. Applies only to functions created AFTER
-- this runs, by the role that runs it (the same role the install script and
-- every migration here use), so existing sibling-app functions are unaffected
-- -- but a sibling app that later adds a public function must GRANT EXECUTE
-- to anon explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Defence in depth on the two PIN-management functions: a grant is one
-- ALTER DEFAULT PRIVILEGES away from being handed back by accident, so the
-- functions check for themselves. Bodies are otherwise unchanged from
-- install.js. Every account on this project is role='admin'; a device account
-- has never managed cashier PINs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_cashier_pin(p_cashier_id BIGINT, p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'set_cashier_pin: admin privileges required';
  END IF;
  IF p_pin IS NULL OR length(p_pin) = 0 THEN
    RAISE EXCEPTION 'PIN cannot be empty';
  END IF;
  INSERT INTO public.cashier_pins (cashier_id, pin_hash)
  VALUES (p_cashier_id, crypt(p_pin, gen_salt('bf')))
  ON CONFLICT (cashier_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_cashier_pin(p_cashier_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'delete_cashier_pin: admin privileges required';
  END IF;
  DELETE FROM public.cashier_pins WHERE cashier_id = p_cashier_id;
END;
$$;

-- CREATE OR REPLACE resets the two functions' privileges to the schema
-- default, so re-apply their grants after redefining them.
REVOKE ALL ON FUNCTION public.set_cashier_pin(bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_cashier_pin(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_cashier_pin(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cashier_pin(bigint) TO authenticated;

-- Enforce the app_users allowlist in the database (schema 1.6, step 4).
--
-- WHY
-- Every POS table carried a policy of the shape
--     FOR ALL TO authenticated USING (true) WITH CHECK (true)
-- (or the equivalent auth.role() = 'authenticated'), so ANY account that can
-- sign in to the Supabase project could read and write every table: sales,
-- expenses, payroll-adjacent vendor payouts, customers, the menu, the lot
-- ledger. The app_users allowlist that is supposed to gate this was only ever
-- checked client-side, in App.jsx after sign-in -- a check that a REST call
-- with a valid JWT never goes near. The only thing standing between a stranger
-- and the whole database was whether the project happened to have public
-- sign-ups disabled, which the setup flow never turned off and which Supabase
-- leaves ON by default.
--
-- WHAT THIS DOES
-- Replaces those blanket policies with is_app_user(auth.uid()): the same
-- allowlist, enforced where it cannot be bypassed. A signed-in account that is
-- not on the list (or is disabled) now sees nothing.
--
-- SAFE TO APPLY: checked on the live project first -- 3 auth users, 3 linked
-- app_users rows, 0 accounts that would lose access.
--
-- SCOPE: only tables this repo creates. The book_* tables (tinybooks), the
-- logistics and fulfillment tables (tinykds / tinylogistics) and the
-- notification/push/calendar tables are left alone -- they have the same
-- blanket-authenticated shape and need the same fix in their own repos.

-- The allowlist predicate. is_app_admin already shipped with install.js;
-- is_app_user did not (it exists on the live project but was never in the
-- install script), so define it here and keep both in one place.
-- SECURITY DEFINER so the policies below can consult app_users without the
-- caller needing to read that table -- and STABLE so the planner calls it
-- once per statement rather than once per row.
CREATE OR REPLACE FUNCTION public.is_app_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE auth_user_id = p_user_id
      AND disabled_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_app_user(uuid) FROM PUBLIC, anon;
-- Policies call it as the querying role, so authenticated MUST keep EXECUTE.
GRANT EXECUTE ON FUNCTION public.is_app_user(uuid) TO authenticated;

DO $do$
DECLARE
  r record;
  t text;
  -- Tables owned by this repo. Each gets exactly one policy: full access for
  -- an account on the allowlist, nothing for anyone else.
  v_tables text[] := ARRAY[
    'active_tickets', 'activity_logs', 'cashier_pins', 'customers', 'expenses',
    'floor_plan', 'inventory', 'inventory_deductions_applied', 'inventory_logs',
    'inventory_lots', 'lot_consumptions', 'menu_categories',
    'menu_discount_rules', 'menu_item_modifier_groups', 'menu_items',
    'menu_modifier_groups', 'menu_modifier_options', 'menu_schedules',
    'menu_versions', 'menus', 'recipes', 'sales', 'shop_settings',
    'tip_events', 'tip_payouts', 'vendor_payouts', 'vendors',
    'fiscal_profiles', 'cfdi_global_periods'
  ];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Drop whatever is on the table today. Every policy on these tables is
    -- this repo's own (the anon ones went in migration 040), and the names
    -- have drifted across versions -- "Hardware can access x", "x auth all",
    -- "Enable all for authenticated users", "Authenticated can access x" --
    -- so match by table, not by name.
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.is_app_user(auth.uid())) '
      'WITH CHECK (public.is_app_user(auth.uid()))',
      t || '_app_users_rw', t);
  END LOOP;
END
$do$;

-- schema_meta stays read-only for clients: the version banner reads it, and
-- only the install script (service role, which bypasses RLS) writes it.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='schema_meta') THEN
    DROP POLICY IF EXISTS "Authenticated can read schema_meta" ON public.schema_meta;
    DROP POLICY IF EXISTS "schema_meta_app_users_read" ON public.schema_meta;
    CREATE POLICY "schema_meta_app_users_read" ON public.schema_meta
      FOR SELECT TO authenticated USING (public.is_app_user(auth.uid()));
  END IF;
END
$do$;

-- Take cashier_pins out of reach entirely (schema 1.6, step 5).
--
-- WHY
-- The table holds one bcrypt hash per cashier, and a cashier PIN is four
-- digits. Ten thousand candidates is seconds of offline work once the hash is
-- in hand, whatever the cost factor -- so the hash is nearly as good as the
-- PIN itself. Until now every signed-in account could SELECT the whole table
-- (and before migration 042, so could every account that merely existed).
--
-- WHAT THIS DOES
-- Removes the last policy on the table and revokes the table privileges.
-- Postgres denies everything on an RLS-enabled table with no policy, and with
-- no GRANT there is nothing to deny in the first place -- belt and braces, for
-- the same reason as migration 040.
--
-- Nothing in the app reads this table directly: PINs go in through
-- set_cashier_pin, out through delete_cashier_pin, and are checked by
-- verify_pin -- all SECURITY DEFINER, so they keep working as the function
-- owner. Confirmed by grep across src/ and api/ before writing this.
--
-- No replacement read RPC is added. The admin UI never asks "which cashiers
-- have a PIN", so exposing that would be new surface for no caller.

DROP POLICY IF EXISTS "Hardware can access cashier_pins" ON public.cashier_pins;
DROP POLICY IF EXISTS "cashier_pins_app_users_rw"        ON public.cashier_pins;

ALTER TABLE public.cashier_pins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cashier_pins FROM anon, authenticated;

-- Rate limiting for the two guessable endpoints (schema 1.6, step 6).
--
-- WHY
-- Two things stay guessable no matter who can call them:
--   * a cashier PIN is four digits -- 10,000 candidates, and verify_pin is a
--     direct oracle. Step 3 shut anon out of it, but a signed-in device (or
--     anyone with a device's session) could still walk the space in seconds.
--   * a CFDI ticket reference can be an active_tickets id, which is a
--     Date.now() millisecond value. Narrow, ordered, and guessable by anyone
--     who has seen one receipt -- and cfdi_lookup_ticket is public by design.
--
-- Supabase's free tier gives no request-level rate limiting, so this is a
-- counter in Postgres: free, and it cannot be bypassed by calling the RPC
-- from somewhere else, because the check lives inside the function.
--
-- WHAT COUNTS
-- verify_pin counts per cashier, and a correct PIN clears the counter, so
-- normal shift use never accumulates. cfdi_lookup_ticket counts MISSES only,
-- globally: a customer scanning their own receipt hits a real ticket and is
-- never counted, while enumeration is nothing but misses. That keeps the
-- limit off legitimate traffic without needing a client IP, which PostgREST
-- does not hand to Postgres anyway.

CREATE TABLE IF NOT EXISTS public.auth_attempts (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts     integer      NOT NULL DEFAULT 0
);

-- No policy and no grant: only the SECURITY DEFINER functions below touch it,
-- and they run as the owner. Same reasoning as cashier_pins in migration 043.
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_attempts FROM anon, authenticated;

-- Count one attempt against \`p_key\`. Returns true when the caller is still
-- under the limit, false once it is exhausted. The window is a fixed bucket
-- that resets on first use after it expires -- not a sliding window, which
-- would cost an index scan per call for no security gain at this scale.
--
-- The INSERT ... ON CONFLICT DO UPDATE is a single statement, so two
-- concurrent callers cannot both read a stale count: the second one blocks on
-- the row lock and sees the first one's increment.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key text, p_limit integer, p_window interval
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts integer;
BEGIN
  INSERT INTO public.auth_attempts (key, window_start, attempts)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    -- Expired bucket: start a fresh one. Live bucket: add to it.
    window_start = CASE WHEN public.auth_attempts.window_start < now() - p_window
                        THEN now() ELSE public.auth_attempts.window_start END,
    attempts     = CASE WHEN public.auth_attempts.window_start < now() - p_window
                        THEN 1 ELSE public.auth_attempts.attempts + 1 END
  RETURNING attempts INTO v_attempts;

  RETURN v_attempts <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, interval) FROM PUBLIC, anon, authenticated;

-- Clear a counter after a legitimate success.
CREATE OR REPLACE FUNCTION public.rate_limit_clear(p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_attempts WHERE key = p_key;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_clear(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- verify_pin: 10 wrong PINs per cashier per 15 minutes.
--
-- Generous for a real cashier fumbling at the register, useless for walking
-- 10,000 candidates. A correct PIN clears the counter. Over the limit the
-- function returns false -- the same answer as a wrong PIN, so it leaks
-- nothing about whether the account exists, and the client already renders it
-- as "wrong PIN" with no change needed.
--
-- Also adds the SET search_path this function never had (advisor warning).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_pin(p_cashier_id BIGINT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
  v_key  text := 'pin:' || p_cashier_id::text;
BEGIN
  IF NOT public.rate_limit_hit(v_key, 10, interval '15 minutes') THEN
    RETURN FALSE;
  END IF;

  SELECT pin_hash INTO v_hash FROM public.cashier_pins WHERE cashier_id = p_cashier_id;
  IF v_hash IS NULL THEN RETURN FALSE; END IF;

  IF v_hash = crypt(p_pin, v_hash) THEN
    PERFORM public.rate_limit_clear(v_key);
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_pin(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pin(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- cfdi_lookup_ticket: 30 MISSES per minute, project-wide.
--
-- Same body as migration 039 plus the counter. A real customer's scan resolves
-- and is never counted; sweeping Date.now() values produces nothing but
-- misses. At 30/minute, walking even one hour of millisecond timestamps would
-- take longer than the business will exist.
--
-- Rate-limited callers get the same {found:false} a bad reference gets, with
-- rate_limited:true alongside so the page can say "try again in a moment"
-- rather than "ticket not found" if it ever wants to.
--
-- NOTE: this function is no longer STABLE -- it writes the counter -- so it
-- must be called as an RPC, not from inside a read-only statement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cfdi_lookup_ticket(p_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint; v_is_paid boolean; v_row jsonb;
  v_profile jsonb := NULL;
  v_global jsonb := NULL;
  v_period text;
BEGIN
  SELECT o_id, o_is_paid, o_row INTO v_id, v_is_paid, v_row
  FROM public.cfdi_resolve_ticket(p_ref);

  IF v_id IS NULL THEN
    IF NOT public.rate_limit_hit('cfdi:miss', 30, interval '1 minute') THEN
      RETURN jsonb_build_object('found', false, 'rate_limited', true);
    END IF;
    RETURN jsonb_build_object('found', false);
  END IF;

  IF (v_row->>'fiscal_profile_id') IS NOT NULL THEN
    SELECT to_jsonb(f) - 'created_at' - 'updated_at' INTO v_profile
    FROM public.fiscal_profiles f
    WHERE f.id = (v_row->>'fiscal_profile_id')::uuid;
  END IF;

  IF v_is_paid AND (v_row->>'created_at') IS NOT NULL THEN
    v_period := to_char(
      ((v_row->>'created_at')::timestamptz AT TIME ZONE public.shop_timezone()), 'YYYY-MM');
    SELECT jsonb_build_object('period', g.period, 'business_name', g.business_name)
    INTO v_global
    FROM public.cfdi_global_periods g WHERE g.period = v_period;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'ticket', jsonb_build_object(
      'id',                v_id,
      'is_paid',           v_is_paid,
      'created_at',        v_row->>'created_at',
      'cfdi_status',       COALESCE(v_row->>'cfdi_status', 'none'),
      'cfdi_folio',        v_row->>'cfdi_folio',
      'fiscal_profile_id', v_row->>'fiscal_profile_id',
      'order_name',        v_row->>'order_name',
      'ticket_id',         v_row->>'ticket_id',
      'items',             COALESCE(v_row->'items', '[]'::jsonb),
      'total_amount',      v_row->'total_amount'
    ),
    'profile', v_profile,
    'global_period', v_global
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cfdi_lookup_ticket(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_lookup_ticket(text) TO anon, authenticated;

-- Tell the caller WHY it was refused, and for how long (schema 1.6, step 6b).
--
-- Migration 044 made the two guessable endpoints fail closed, but silently:
-- a locked-out cashier saw "wrong PIN" and kept trying a PIN that was right,
-- and the portal could say "too many queries" without saying for how long.
-- Silence is the wrong trade here. Knowing that a lockout is running, and
-- when it lifts, tells an attacker nothing they cannot measure by trying
-- again -- and it is the difference between a cashier waiting 90 seconds and
-- a cashier phoning the owner convinced the till is broken.

-- Seconds left in the current window for a key, or 0 when nothing is running.
CREATE OR REPLACE FUNCTION public.rate_limit_retry_after(p_key text, p_window interval)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT GREATEST(0, ceil(extract(epoch FROM (a.window_start + p_window - now()))))::integer
  FROM public.auth_attempts a
  WHERE a.key = p_key;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_retry_after(text, interval) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- verify_pin_status — same check as verify_pin, but it says what happened:
--   { ok: bool, locked: bool, retry_after: int }
-- \`locked\` is only ever true when the limiter refused the call, so a plain
-- wrong PIN still returns { ok:false, locked:false } and leaks nothing extra.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_pin_status(p_cashier_id BIGINT, p_pin TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
  v_key  text := 'pin:' || p_cashier_id::text;
  v_window constant interval := interval '15 minutes';
BEGIN
  IF NOT public.rate_limit_hit(v_key, 10, v_window) THEN
    RETURN jsonb_build_object(
      'ok', false, 'locked', true,
      'retry_after', public.rate_limit_retry_after(v_key, v_window));
  END IF;

  SELECT pin_hash INTO v_hash FROM public.cashier_pins WHERE cashier_id = p_cashier_id;

  IF v_hash IS NOT NULL AND v_hash = crypt(p_pin, v_hash) THEN
    PERFORM public.rate_limit_clear(v_key);
    RETURN jsonb_build_object('ok', true, 'locked', false, 'retry_after', 0);
  END IF;

  RETURN jsonb_build_object('ok', false, 'locked', false, 'retry_after', 0);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_pin_status(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pin_status(bigint, text) TO authenticated;

-- verify_pin stays a boolean, delegating to the same body, so an app version
-- that predates this migration keeps working unchanged -- and, importantly,
-- so one PIN entry is counted once no matter which of the two a client calls.
CREATE OR REPLACE FUNCTION public.verify_pin(p_cashier_id BIGINT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE((public.verify_pin_status(p_cashier_id, p_pin) ->> 'ok')::boolean, false);
$$;
REVOKE ALL ON FUNCTION public.verify_pin(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pin(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- cfdi_lookup_ticket: carry the same retry_after on a throttled miss, so the
-- portal can count down instead of guessing. Identical to migration 044
-- otherwise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cfdi_lookup_ticket(p_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint; v_is_paid boolean; v_row jsonb;
  v_profile jsonb := NULL;
  v_global jsonb := NULL;
  v_period text;
  v_window constant interval := interval '1 minute';
BEGIN
  SELECT o_id, o_is_paid, o_row INTO v_id, v_is_paid, v_row
  FROM public.cfdi_resolve_ticket(p_ref);

  IF v_id IS NULL THEN
    IF NOT public.rate_limit_hit('cfdi:miss', 30, v_window) THEN
      RETURN jsonb_build_object(
        'found', false, 'rate_limited', true,
        'retry_after', public.rate_limit_retry_after('cfdi:miss', v_window));
    END IF;
    RETURN jsonb_build_object('found', false);
  END IF;

  IF (v_row->>'fiscal_profile_id') IS NOT NULL THEN
    SELECT to_jsonb(f) - 'created_at' - 'updated_at' INTO v_profile
    FROM public.fiscal_profiles f
    WHERE f.id = (v_row->>'fiscal_profile_id')::uuid;
  END IF;

  IF v_is_paid AND (v_row->>'created_at') IS NOT NULL THEN
    v_period := to_char(
      ((v_row->>'created_at')::timestamptz AT TIME ZONE public.shop_timezone()), 'YYYY-MM');
    SELECT jsonb_build_object('period', g.period, 'business_name', g.business_name)
    INTO v_global
    FROM public.cfdi_global_periods g WHERE g.period = v_period;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'ticket', jsonb_build_object(
      'id',                v_id,
      'is_paid',           v_is_paid,
      'created_at',        v_row->>'created_at',
      'cfdi_status',       COALESCE(v_row->>'cfdi_status', 'none'),
      'cfdi_folio',        v_row->>'cfdi_folio',
      'fiscal_profile_id', v_row->>'fiscal_profile_id',
      'order_name',        v_row->>'order_name',
      'ticket_id',         v_row->>'ticket_id',
      'items',             COALESCE(v_row->'items', '[]'::jsonb),
      'total_amount',      v_row->'total_amount'
    ),
    'profile', v_profile,
    'global_period', v_global
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cfdi_lookup_ticket(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_lookup_ticket(text) TO anon, authenticated;

-- Pin search_path on the functions that still lack it (schema 1.6, step 8).
--
-- WHY
-- A SECURITY DEFINER function without a pinned search_path resolves unqualified
-- names using the CALLER's search_path. Anyone who can create objects in a
-- schema that lands earlier on that path can shadow a table or an operator the
-- function relies on and have their version run with the definer's privileges.
-- Supabase's own advisor flags every one of these.
--
-- Most of this app's functions already pin it. These were the stragglers:
-- award_loyalty_visits, deduct_inventory (both legacy overloads),
-- deduct_inventory_log, restock_inventory_log and schedule_matches.
-- (verify_pin got its own in migration 044.)
--
-- ALTER FUNCTION rather than CREATE OR REPLACE: the bodies do not change, so
-- there is no reason to restate them here and risk drift between this file and
-- install.js. It also leaves the grants from migration 041 alone -- CREATE OR
-- REPLACE would reset them.
--
-- \`extensions\` is included because Supabase installs pgcrypto there; it costs
-- nothing for the functions that do not use it, and prevents the next function
-- that reaches for crypt() from failing mysteriously.
--
-- SCOPE: only this repo's functions. The advisor also flags several belonging
-- to the sibling apps sharing this project -- check_requires_logistics,
-- create_fulfillment_ticket, create_fulfillment_from_active_ticket,
-- gen_tracking_token, verify_admin_pin, provision_schema,
-- google_calendar_resync_all, trigger_google_calendar_sync -- which are left
-- for their own repos.

DO $do$
DECLARE
  r record;
  v_owned text[] := ARRAY[
    'award_loyalty_visits', 'build_menu_snapshot', 'cfdi_lookup_ticket',
    'cfdi_request_invoice', 'cfdi_resolve_ticket', 'claim_or_bootstrap_app_user',
    'deduct_inventory', 'deduct_inventory_log', 'delete_cashier_pin',
    'get_active_menu', 'get_menu_by_id', 'get_public_menu', 'is_app_admin',
    'is_app_user', 'menu_item_available', 'prune_menu_versions',
    'rate_limit_clear', 'rate_limit_hit', 'rate_limit_retry_after',
    'restock_inventory_log', 'restore_menu_version', 'schedule_matches',
    'set_cashier_pin', 'shop_timezone', 'snapshot_menu', 'verify_pin',
    'verify_pin_status'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (v_owned)
      -- Only the ones missing it; the rest already pin their own path and
      -- some of them deliberately differ (public, extensions).
      AND (p.proconfig IS NULL
           OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.sig);
  END LOOP;
END
$do$;

${stamp('1.6')}`,
  },
];

// Returns the concatenated delta SQL to move `fromVersion` up to the latest
// registered version, or null when the caller should run the full script:
//   - null  → unknown version, or a gap (some intervening version has no delta)
//   - ''    → already at the latest version (nothing to do)
//   - SQL   → the minimal delta to apply
export function deltasFrom(fromVersion) {
  const idx = VERSION_ORDER.indexOf(fromVersion);
  if (idx === -1) return null;                 // unknown/old/local → full script
  const needed = VERSION_ORDER.slice(idx + 1); // versions still to apply
  if (needed.length === 0) return '';          // already current
  const byVersion = new Map(SCHEMA_DELTAS.map((d) => [d.version, d.sql]));
  const chunks = [];
  for (const v of needed) {
    if (!byVersion.has(v)) return null;         // gap → fall back to full script
    chunks.push(byVersion.get(v));
  }
  return chunks.join('\n');
}
