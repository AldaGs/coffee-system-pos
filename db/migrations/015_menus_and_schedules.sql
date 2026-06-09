-- =============================================================================
-- 015_menus_and_schedules.sql
--
-- Phase 1 of the multi-menu roadmap (see project_tinymenu memory).
--
-- Introduces `menus` and `menu_schedules` so shops can have several menus
-- (live catalog, uploaded PDF/image, future designer output) and switch
-- between them automatically by clock and date.
--
-- The existing single catalog becomes an implicit `kind='live'` row at
-- priority=0 with no schedules — always-on fallback when nothing else matches.
--
-- get_public_menu() is replaced by get_active_menu(now) which resolves the
-- right menu server-side (so TV mode + customer phone always agree). The
-- output envelope adds a `menu` block; for kind='live' the rest of the
-- payload matches the old shape so PublicMenu.jsx only needs minimal changes.
--
-- Schedule matching rules:
--   - date range: NULL bounds = open-ended on that side
--   - days_of_week: bitmask Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64.
--     0 or NULL = every day.
--   - time window: NULL bounds = open-ended; if start > end the window crosses
--     midnight (22:00..02:00 matches 23:30 and 01:00 but not 04:00).
--   - A menu with zero schedule rows is always-on (matches any time).
--   - Active menu = highest priority among matching `is_active=true` menus;
--     ties broken by created_at DESC. Fallback is the catalog 'live' row.
--
-- All shop-local time math uses posSettings.timezone (default 'UTC') so
-- "brunch 9-13 Sat/Sun" means 9am in the shop's wall clock, not UTC.
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.
-- =============================================================================

-- 1. menus -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menus (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'live'
              CHECK (kind IN ('live','pdf','image','designed')),
  priority    int  NOT NULL DEFAULT 0,
  is_active   bool NOT NULL DEFAULT true,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Only one 'live' menu — the catalog itself. Other kinds can be any count.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_menus_live
  ON public.menus ((1)) WHERE kind = 'live';

ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "menus auth all" ON public.menus;
CREATE POLICY "menus auth all" ON public.menus
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Backfill: insert the implicit catalog row if missing. Priority 0 so any
-- user-created menu (priority >= 1 by convention) wins when scheduled.
INSERT INTO public.menus (name, kind, priority, is_active)
SELECT 'Menú principal', 'live', 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.menus WHERE kind = 'live');

-- 2. menu_schedules ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_schedules (
  id             bigserial PRIMARY KEY,
  menu_id        bigint NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  days_of_week   int  NOT NULL DEFAULT 0,
  start_time     time,
  end_time       time,
  start_date     date,
  end_date       date,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_menu_schedules_menu ON public.menu_schedules (menu_id);

ALTER TABLE public.menu_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "menu_schedules auth all" ON public.menu_schedules;
CREATE POLICY "menu_schedules auth all" ON public.menu_schedules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Resolver helpers --------------------------------------------------------

-- Returns the shop's IANA timezone from posSettings.timezone, or 'UTC'.
CREATE OR REPLACE FUNCTION public.shop_timezone()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT menu_data->'posSettings'->>'timezone' FROM public.shop_settings WHERE id = 1),
    'UTC'
  );
$$;
REVOKE ALL ON FUNCTION public.shop_timezone() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shop_timezone() TO anon, authenticated;

-- True iff the given schedule row matches the given shop-local timestamp.
-- Pure function of inputs, no table reads — safe to inline in WHERE clauses.
CREATE OR REPLACE FUNCTION public.schedule_matches(
  p_days       int,
  p_start_time time,
  p_end_time   time,
  p_start_date date,
  p_end_date   date,
  p_local      timestamp
) RETURNS bool LANGUAGE sql IMMUTABLE AS $$
  SELECT
    -- Date range (NULL = open-ended).
    (p_start_date IS NULL OR p_local::date >= p_start_date)
    AND (p_end_date IS NULL OR p_local::date <= p_end_date)
    -- Day-of-week bitmask (0/NULL = every day). EXTRACT(isodow) is Mon=1..Sun=7.
    AND (
      COALESCE(p_days, 0) = 0
      OR (COALESCE(p_days, 0) & (1 << (EXTRACT(isodow FROM p_local)::int - 1))) <> 0
    )
    -- Time window. Both NULL = all day. Start > end crosses midnight.
    AND (
      (p_start_time IS NULL AND p_end_time IS NULL)
      OR (p_start_time IS NOT NULL AND p_end_time IS NOT NULL AND p_start_time <= p_end_time
          AND p_local::time >= p_start_time AND p_local::time < p_end_time)
      OR (p_start_time IS NOT NULL AND p_end_time IS NOT NULL AND p_start_time > p_end_time
          AND (p_local::time >= p_start_time OR p_local::time < p_end_time))
      OR (p_start_time IS NOT NULL AND p_end_time IS NULL AND p_local::time >= p_start_time)
      OR (p_start_time IS NULL AND p_end_time IS NOT NULL AND p_local::time < p_end_time)
    );
$$;

-- 4. get_active_menu(now) ----------------------------------------------------
-- Replaces get_public_menu(). For kind='live' the categories/modifier_groups
-- blocks match the old shape so PublicMenu can keep its renderer for now.
-- For other kinds, those blocks are empty and the menu.data block carries the
-- renderer-specific payload (storage paths, document tree, etc.).
CREATE OR REPLACE FUNCTION public.get_active_menu(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_tz      text;
  v_local   timestamp;
  v_menu_id bigint;
  v_kind    text;
  v_name    text;
  v_data    jsonb;
  v_shop    jsonb;
BEGIN
  v_tz    := public.shop_timezone();
  v_local := (p_now AT TIME ZONE v_tz)::timestamp;

  -- Pick: highest-priority active menu that either has no schedule rows
  -- (always-on) or has at least one matching schedule row.
  SELECT m.id, m.kind, m.name, m.data
    INTO v_menu_id, v_kind, v_name, v_data
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
  ORDER BY m.priority DESC, m.created_at DESC
  LIMIT 1;

  -- Fallback: the catalog live menu (priority 0, always-on) should always
  -- match the query above, but guard anyway.
  IF v_menu_id IS NULL THEN
    SELECT m.id, m.kind, m.name, m.data
      INTO v_menu_id, v_kind, v_name, v_data
    FROM public.menus m WHERE m.kind = 'live' LIMIT 1;
  END IF;

  v_shop := jsonb_build_object(
    'name',        COALESCE((SELECT menu_data->'posSettings'->>'name'       FROM public.shop_settings WHERE id = 1), 'Menu'),
    'brand_color', COALESCE((SELECT menu_data->'posSettings'->>'brandColor' FROM public.shop_settings WHERE id = 1), '#f28b05'),
    'language',    COALESCE((SELECT menu_data->'posSettings'->>'language'   FROM public.shop_settings WHERE id = 1), 'es'),
    'timezone',    v_tz
  );

  -- For kind='live' build the catalog payload. Other kinds get an empty
  -- catalog payload; their renderer reads from menu.data instead.
  IF v_kind = 'live' THEN
    RETURN jsonb_build_object(
      'menu', jsonb_build_object(
        'id',   v_menu_id,
        'kind', v_kind,
        'name', v_name,
        'data', v_data
      ),
      'shop', v_shop,
      'categories', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',         c.id,
            'name',       c.name,
            'sort_order', c.sort_order,
            'items', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id',                 i.id,
                  'name',               i.name,
                  'price_cents',        i.base_price_cents,
                  'price_type',         i.price_type,
                  'emoji',              i.emoji,
                  'image_url',          i.image_url,
                  'sort_order',         i.sort_order,
                  'modifier_group_ids', COALESCE((
                    SELECT jsonb_agg(l.group_id ORDER BY l.sort_order)
                    FROM public.menu_item_modifier_groups l
                    WHERE l.item_id = i.id
                  ), '[]'::jsonb)
                ) ORDER BY i.sort_order
              )
              FROM public.menu_items i
              WHERE i.category_id = c.id AND i.is_hidden = false
            ), '[]'::jsonb)
          ) ORDER BY c.sort_order
        )
        FROM public.menu_categories c WHERE c.is_hidden = false
      ), '[]'::jsonb),
      'modifier_groups', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',             g.id,
            'name',           g.name,
            'allow_multiple', g.allow_multiple,
            'options', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id',                o.id,
                  'name',              o.name,
                  'price_delta_cents', o.price_delta_cents
                ) ORDER BY o.sort_order
              )
              FROM public.menu_modifier_options o WHERE o.group_id = g.id
            ), '[]'::jsonb)
          ) ORDER BY g.sort_order
        )
        FROM public.menu_modifier_groups g
      ), '[]'::jsonb)
    );
  ELSE
    -- Non-live kinds: caller renders from menu.data.
    RETURN jsonb_build_object(
      'menu', jsonb_build_object(
        'id',   v_menu_id,
        'kind', v_kind,
        'name', v_name,
        'data', v_data
      ),
      'shop', v_shop,
      'categories', '[]'::jsonb,
      'modifier_groups', '[]'::jsonb
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.get_active_menu(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_menu(timestamptz) TO anon, authenticated;

-- 5. Keep get_public_menu() as a thin alias so existing clients don't break
-- between deploys. Returns whatever get_active_menu(now()) returns.
CREATE OR REPLACE FUNCTION public.get_public_menu()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT public.get_active_menu(now());
$$;
REVOKE ALL ON FUNCTION public.get_public_menu() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_menu() TO anon, authenticated;
