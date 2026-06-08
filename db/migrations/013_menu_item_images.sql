-- =============================================================================
-- 013_menu_item_images.sql
--
-- Adds optional photos to menu items, served from a public Supabase Storage
-- bucket and surfaced through the existing get_public_menu() RPC.
--
-- 1. menu_items.image_url: full public URL with ?v=<ts> baked in at upload
--    time. No separate version column — bumping ?v on overwrite is what
--    busts CDN caches.
-- 2. Storage bucket "menu-assets": public read, authenticated write/update/
--    delete. The bucket itself is shared with any future menu media (logos,
--    PDF pages, etc.); items live under items/<item_id>.webp.
-- 3. get_public_menu(): drop+recreate so the items shape includes image_url.
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.
-- =============================================================================

-- 1. Column on menu_items
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Storage bucket + policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-assets', 'menu-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "menu-assets public read"   ON storage.objects;
DROP POLICY IF EXISTS "menu-assets auth insert"   ON storage.objects;
DROP POLICY IF EXISTS "menu-assets auth update"   ON storage.objects;
DROP POLICY IF EXISTS "menu-assets auth delete"   ON storage.objects;

CREATE POLICY "menu-assets public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'menu-assets');

CREATE POLICY "menu-assets auth insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'menu-assets');

CREATE POLICY "menu-assets auth update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'menu-assets')
  WITH CHECK (bucket_id = 'menu-assets');

CREATE POLICY "menu-assets auth delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'menu-assets');

-- 3. RPC: include image_url in the items shape
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
