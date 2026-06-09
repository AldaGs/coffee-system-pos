-- =============================================================================
-- 017_get_menu_by_id.sql
--
-- Per-menu deep link. /menu?m=<id> bypasses the schedule resolver so the
-- shop can print a permanent QR per menu (brunch, vegan, special, etc.)
-- that always shows that menu regardless of the current time.
--
-- Returns the same envelope as get_active_menu (same client renderer).
-- Refuses inactive menus — pausing a menu hides it from override links too.
-- Refuses missing ids by falling back to the catalog (kind='live') so a
-- stale QR after a delete still shows *something*.
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_menu_by_id(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_tz      text;
  v_menu_id bigint;
  v_kind    text;
  v_name    text;
  v_data    jsonb;
  v_shop    jsonb;
BEGIN
  v_tz := public.shop_timezone();

  SELECT m.id, m.kind, m.name, m.data
    INTO v_menu_id, v_kind, v_name, v_data
  FROM public.menus m
  WHERE m.id = p_id AND m.is_active = true
  LIMIT 1;

  -- Inactive or unknown id → fallback to the catalog so a stale QR still
  -- renders something coherent. The client URL can be updated by re-printing.
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
              'modifier_group_ids', COALESCE((
                SELECT jsonb_agg(l.group_id ORDER BY l.sort_order)
                FROM public.menu_item_modifier_groups l WHERE l.item_id = i.id
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
        FROM public.menu_modifier_groups g
      ), '[]'::jsonb)
    );
  ELSE
    RETURN jsonb_build_object(
      'menu', jsonb_build_object('id', v_menu_id, 'kind', v_kind, 'name', v_name, 'data', v_data),
      'shop', v_shop,
      'categories', '[]'::jsonb,
      'modifier_groups', '[]'::jsonb
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.get_menu_by_id(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_menu_by_id(bigint) TO anon, authenticated;
