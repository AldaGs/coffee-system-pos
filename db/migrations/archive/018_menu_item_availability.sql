-- =============================================================================
-- 018_menu_item_availability.sql
--
-- Phase 4c.4 — expose per-item availability in the public menu RPCs so
-- renderers can hide or strikethrough out-of-stock items.
--
-- Inventory model in tinypos:
--   menu_items.data.inventoryMode is 'none' | 'warehouse' | 'recipe'.
--   - 'warehouse': data.linkedWarehouseId points to inventory.id; item is
--                  available iff inventory.current_stock > 0.
--   - 'recipe':    data.linkedRecipeId points to recipes.id (uuid). The
--                  recipe carries ingredients[{id, name, qty}] where id is
--                  the inventory row id. Item is available iff every
--                  ingredient has inv.current_stock >= ing.qty.
--   - 'none':      always available.
--
-- The helper menu_item_available() is added once; both get_active_menu()
-- and get_menu_by_id() are rewritten to include `"available": bool` per
-- item. The envelope is otherwise unchanged.
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper — pure read, safe to call from STABLE callers. Tolerates malformed
-- references (NULL ids, missing recipes, missing inventory rows) by
-- returning TRUE — better to show an item than to hide it on bad data.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.menu_item_available(p_item_id text)
RETURNS bool LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb;
  v_mode text;
  v_short_id bigint;
BEGIN
  SELECT data INTO v_data FROM public.menu_items WHERE id = p_item_id;
  IF v_data IS NULL THEN RETURN true; END IF;

  v_mode := COALESCE(v_data->>'inventoryMode', 'none');

  IF v_mode = 'warehouse' THEN
    BEGIN
      v_short_id := NULLIF(v_data->>'linkedWarehouseId','')::bigint;
    EXCEPTION WHEN OTHERS THEN
      RETURN true;
    END;
    IF v_short_id IS NULL THEN RETURN true; END IF;
    RETURN COALESCE(
      (SELECT current_stock > 0 FROM public.inventory WHERE id = v_short_id),
      true
    );
  END IF;

  IF v_mode = 'recipe' THEN
    DECLARE v_rid uuid;
    BEGIN
      BEGIN
        v_rid := NULLIF(v_data->>'linkedRecipeId','')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RETURN true;
      END;
      IF v_rid IS NULL THEN RETURN true; END IF;
      -- Available iff no ingredient is short. Treat malformed qty/id as 0,
      -- missing inventory row as 0 stock — both bias toward "out of stock"
      -- because the recipe explicitly opted into tracking.
      RETURN NOT EXISTS (
        SELECT 1
        FROM public.recipes r,
             LATERAL jsonb_array_elements(COALESCE(r.ingredients,'[]'::jsonb)) AS ing(val)
        WHERE r.id = v_rid
          AND COALESCE(
                (SELECT current_stock FROM public.inventory
                  WHERE id = (CASE
                    WHEN (ing.val->>'id') ~ '^[0-9]+$' THEN (ing.val->>'id')::bigint
                    ELSE NULL
                  END)),
                0
              )
              < COALESCE((ing.val->>'qty')::numeric, 0)
      );
    END;
  END IF;

  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.menu_item_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.menu_item_available(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replace get_active_menu — adds `available` to each item.
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
      'categories', '[]'::jsonb, 'modifier_groups', '[]'::jsonb
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Replace get_menu_by_id — same `available` addition.
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
      'categories', '[]'::jsonb, 'modifier_groups', '[]'::jsonb
    );
  END IF;
END $$;
