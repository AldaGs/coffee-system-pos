-- 5.7: restore_menu_version clears the menu tables with `WHERE true`.
-- Supabase's pg_safeupdate rejects a DELETE with no WHERE clause on API calls,
-- so "Restaurar" in the menu history failed with "DELETE requires a WHERE clause".
CREATE OR REPLACE FUNCTION public.restore_menu_version(p_version_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_snap jsonb; v_pre bigint; v_cats int := 0; v_items int := 0;
BEGIN
  SELECT snapshot INTO v_snap FROM public.menu_versions WHERE id = p_version_id;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'menu_versions row % not found', p_version_id; END IF;
  v_pre := public.snapshot_menu('restore-target', 'before-restore-of-' || p_version_id);

  DELETE FROM public.menu_item_modifier_groups WHERE true;
  DELETE FROM public.menu_modifier_options WHERE true;
  DELETE FROM public.menu_modifier_groups WHERE true;
  DELETE FROM public.menu_items WHERE true;
  DELETE FROM public.menu_categories WHERE true;
  DELETE FROM public.menu_discount_rules WHERE true;

  WITH ordered AS (
    SELECT key, ord FROM jsonb_array_elements_text(COALESCE(v_snap->'categoryOrder','[]'::jsonb))
      WITH ORDINALITY AS o(key, ord)
  )
  INSERT INTO public.menu_categories (name, sort_order, is_hidden, public_hidden)
  SELECT k, COALESCE((SELECT ord FROM ordered WHERE key=k)::int, 1000),
         (COALESCE(v_snap->'hiddenCategories','[]'::jsonb) ? k),
         (COALESCE(v_snap->'publicHiddenCategories','[]'::jsonb) ? k)
  FROM jsonb_object_keys(COALESCE(v_snap->'categories','{}'::jsonb)) AS k;
  GET DIAGNOSTICS v_cats = ROW_COUNT;

  INSERT INTO public.menu_items
    (id, category_id, name, base_price_cents, price_type, emoji, image_url, sort_order, is_hidden, data)
  SELECT
    item->>'id', mc.id,
    COALESCE(item->>'name',''),
    COALESCE((item->>'basePrice')::int, 0),
    COALESCE(item->>'priceType','fixed'),
    COALESCE(item->>'emoji',''),
    NULLIF(item->>'imageUrl',''),
    (it.ord - 1)::int, COALESCE((item->>'isHidden')::bool, false),
    (item - 'id' - 'name' - 'basePrice' - 'priceType' - 'emoji' - 'imageUrl' - 'isHidden' - 'allowedModifiers' - 'category')
  FROM jsonb_each(COALESCE(v_snap->'categories','{}'::jsonb)) AS cat(key, value)
  JOIN public.menu_categories mc ON mc.name = cat.key
  CROSS JOIN LATERAL jsonb_array_elements(cat.value) WITH ORDINALITY AS it(item, ord)
  WHERE item->>'id' IS NOT NULL;
  GET DIAGNOSTICS v_items = ROW_COUNT;

  INSERT INTO public.menu_modifier_groups (id, name, allow_multiple, is_hidden, sort_order)
  SELECT key, key,
         COALESCE((v_snap->'modifierGroupSettings'->key->>'allowMultiple')::bool, false),
         COALESCE((v_snap->'modifierGroupSettings'->key->>'isHidden')::bool, false),
         ((row_number() OVER (ORDER BY key)) - 1)::int
  FROM jsonb_object_keys(COALESCE(v_snap->'modifierGroups','{}'::jsonb)) AS key;

  INSERT INTO public.menu_modifier_options (id, group_id, name, price_delta_cents, sort_order, data)
  SELECT opt->>'id', grp.key, COALESCE(opt->>'name',''),
         COALESCE((opt->>'price')::int, (opt->>'price_delta_cents')::int, 0),
         (o.ord - 1)::int,
         (opt - 'id' - 'name' - 'price' - 'price_delta_cents')
  FROM jsonb_each(COALESCE(v_snap->'modifierGroups','{}'::jsonb)) AS grp(key, value)
  CROSS JOIN LATERAL jsonb_array_elements(grp.value) WITH ORDINALITY AS o(opt, ord)
  WHERE opt->>'id' IS NOT NULL;

  INSERT INTO public.menu_item_modifier_groups (item_id, group_id, sort_order)
  SELECT item->>'id', m.mod_key, (m.ord - 1)::int
  FROM jsonb_each(COALESCE(v_snap->'categories','{}'::jsonb)) AS cat(key, value)
  CROSS JOIN LATERAL jsonb_array_elements(cat.value) AS item
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(item->'allowedModifiers','[]'::jsonb))
                     WITH ORDINALITY AS m(mod_key, ord)
  WHERE EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = item->>'id')
    AND EXISTS (SELECT 1 FROM public.menu_modifier_groups mg WHERE mg.id = m.mod_key);

  INSERT INTO public.menu_discount_rules (name, rule_type, payload, is_active, sort_order)
  SELECT COALESCE(rule->>'name',''), COALESCE(rule->>'type',''), rule,
         COALESCE((rule->>'isActive')::bool, true), (r.ord - 1)::int
  FROM jsonb_array_elements(COALESCE(v_snap->'discountRules','[]'::jsonb))
       WITH ORDINALITY AS r(rule, ord);

  RETURN jsonb_build_object('restored_from', p_version_id, 'previous_snapshot_id', v_pre,
                            'inserted_categories', v_cats, 'inserted_items', v_items);
END $$;
REVOKE ALL ON FUNCTION public.restore_menu_version(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_menu_version(bigint) TO authenticated;
