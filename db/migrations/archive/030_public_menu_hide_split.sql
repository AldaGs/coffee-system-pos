-- =============================================================================
-- 030_public_menu_hide_split.sql
--
-- Decouple "hidden from the public menu" from "hidden from the Register (POS)".
--
-- Until now a single flag hid an item/category from *both* surfaces:
--   * menu_items.is_hidden        → hidden in Register AND public menu
--   * menu_categories.is_hidden   → hidden in Register AND public menu
-- Shops asked for independent control: e.g. keep a seasonal item on the
-- customer-facing QR menu while pulling it from the cashier grid, or vice
-- versa. So we split the concern:
--
--   is_hidden       stays the REGISTER (POS) visibility flag  — unchanged.
--   public hide     becomes its own flag, read only by the public-menu RPCs:
--     * items      → menu_items.data->>'publicHidden'  (jsonb, no column;
--                    round-trips through the menuLocal/menuCloud residual spread)
--     * categories → menu_categories.public_hidden      (new bool column)
--
-- The public-menu RPCs (get_active_menu / get_menu_by_id) now filter on the
-- public flag instead of is_hidden. To preserve today's behavior at the moment
-- of the split, we backfill the public flag from is_hidden ONCE (guarded on the
-- column not yet existing) so anything currently hidden stays hidden in both
-- places until an owner explicitly changes it.
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Column + one-time backfill. Guarded on the column's first creation so
-- re-applying this block (Update Schema) never re-hides an item/category the
-- owner has since chosen to show publicly.
-- ---------------------------------------------------------------------------
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

    -- Preserve current behavior: whatever was hidden (from both) stays hidden
    -- from the public menu too.
    UPDATE public.menu_categories SET public_hidden = true WHERE is_hidden = true;
    UPDATE public.menu_items
      SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{publicHidden}', 'true'::jsonb, true)
      WHERE is_hidden = true
        AND NOT (COALESCE(data, '{}'::jsonb) ? 'publicHidden');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Replace get_active_menu — public visibility now keys off public_hidden
-- (categories) and data->>'publicHidden' (items) instead of is_hidden.
-- Verbatim from migration 029 with only the two WHERE filters changed.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Replace get_menu_by_id — same two filter changes.
-- ---------------------------------------------------------------------------
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
