-- Schema 3.3: publish only the local delivery areas needed for the customer map.
-- The server still selects the winning area and final price in get_delivery_quote.
CREATE OR REPLACE FUNCTION public.get_order_menu()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE v jsonb; v_id bigint; v_delivery jsonb; v_areas jsonb := '[]'::jsonb;
BEGIN
  v := public.get_active_menu(now());
  SELECT menu_data->'posSettings'->'onlineOrders'->'delivery',
         CASE WHEN jsonb_typeof(menu_data->'posSettings'->'onlineOrders'->'menuId') = 'number'
              THEN (menu_data->'posSettings'->'onlineOrders'->>'menuId')::bigint END
    INTO v_delivery, v_id FROM public.shop_settings WHERE id = 1;
  IF v_delivery->>'enabled' = 'true' AND jsonb_typeof(v_delivery->'areas') = 'array' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', area->'id', 'name', area->'name', 'enabled', true,
      'kind', area->'kind', 'center', area->'center', 'radiusKm', area->'radiusKm',
      'points', area->'points', 'feeCents', area->'feeCents', 'priority', area->'priority'
    ) ORDER BY position), '[]'::jsonb) INTO v_areas
    FROM jsonb_array_elements(v_delivery->'areas') WITH ORDINALITY AS x(area, position)
    WHERE area->>'enabled' = 'true'
      AND NULLIF(btrim(area->>'name'), '') IS NOT NULL
      AND area->>'kind' IN ('radius', 'polygon')
      AND jsonb_typeof(area->'feeCents') = 'number'
      AND CASE WHEN area->>'feeCents' ~ '^[0-9]{1,9}$'
               THEN (area->>'feeCents')::numeric <= 100000000 ELSE false END;
  END IF;
  v := jsonb_set(v, '{shop,deliveryAreas}', v_areas, true);
  IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.menus WHERE id = v_id AND is_active) THEN
    RETURN public.get_menu_by_id(v_id) || jsonb_build_object('shop', v->'shop');
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.get_order_menu() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_menu() TO anon, authenticated;

INSERT INTO public.schema_meta (key, value, updated_at)
VALUES ('schema_version', '3.3', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
