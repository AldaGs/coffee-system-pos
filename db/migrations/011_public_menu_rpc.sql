-- =============================================================================
-- 011_public_menu_rpc.sql
--
-- Adds get_public_menu(): a SECURITY DEFINER RPC that returns a sanitized,
-- read-only view of the menu for the customer-facing live menu page. Granted
-- EXECUTE to the anon role so visitors can fetch it with just the anon key.
--
-- Why an RPC and not anon SELECT policies on the tables:
--   - One server-side function controls exactly what fields leak.
--   - Internal/operational fields (data jsonb on items, inventoryMode, cost,
--     linkedWarehouseId, linkedRecipeId, group sort_order metadata) never
--     reach the client.
--   - Easier to evolve later (add availability flags, prices in different
--     currencies, etc.) without re-checking RLS surface area.
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.
-- =============================================================================

-- Self-healing prerequisite: an earlier draft of migration 010 didn't include
-- allow_multiple on menu_modifier_groups. Re-applying that ALTER here so this
-- migration is safe to run even if a stale 010 was used.
ALTER TABLE public.menu_modifier_groups ADD COLUMN IF NOT EXISTS allow_multiple bool NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_public_menu()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'shop', jsonb_build_object(
      'name',        COALESCE((SELECT menu_data->'posSettings'->>'name'       FROM public.shop_settings WHERE id = 1), 'Menu'),
      'brand_color', COALESCE((SELECT menu_data->'posSettings'->>'brandColor' FROM public.shop_settings WHERE id = 1), '#f28b05'),
      'language',    COALESCE((SELECT menu_data->'posSettings'->>'language'   FROM public.shop_settings WHERE id = 1), 'es')
    ),
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
                'sort_order',         i.sort_order,
                'modifier_group_ids', COALESCE((
                  SELECT jsonb_agg(l.group_id ORDER BY l.sort_order)
                  FROM public.menu_item_modifier_groups l
                  WHERE l.item_id = i.id
                ), '[]'::jsonb)
              ) ORDER BY i.sort_order
            )
            FROM public.menu_items i
            WHERE i.category_id = c.id
              AND i.is_hidden = false
          ), '[]'::jsonb)
        ) ORDER BY c.sort_order
      )
      FROM public.menu_categories c
      WHERE c.is_hidden = false
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
            FROM public.menu_modifier_options o
            WHERE o.group_id = g.id
          ), '[]'::jsonb)
        ) ORDER BY g.sort_order
      )
      FROM public.menu_modifier_groups g
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_public_menu() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_menu() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_menu() TO authenticated;
