-- =============================================================================
-- 014_menu_versions.sql
--
-- Point-in-time menu snapshots + restore. Every meaningful menu write writes
-- a snapshot row to menu_versions; admins can browse history and roll back.
--
-- Snapshot shape mirrors what loadMenu() returns in JS so restore can replay
-- via the same logic the legacy-JSONB migrator already uses.
--
-- Retention (enforced on each insert by trigger):
--   - all snapshots from the last 7 days
--   - one per day for 30 days
--   - one per week for 1 year
--   - reason != 'auto' snapshots are kept forever (pre-migration, manual,
--     restore-target — the load-bearing ones)
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.menu_versions (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  snapshot    jsonb NOT NULL,
  reason      text NOT NULL DEFAULT 'auto',
  trigger_op  text
);
CREATE INDEX IF NOT EXISTS idx_menu_versions_created ON public.menu_versions (created_at DESC);

ALTER TABLE public.menu_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "menu_versions auth all" ON public.menu_versions;
CREATE POLICY "menu_versions auth all" ON public.menu_versions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- build_menu_snapshot() — pure read of the live menu tables, returns the
-- legacy in-memory shape (categories map, modifierGroups map, etc.) so
-- restore_menu_version() can replay it without a separate format.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.build_menu_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_object_agg(c.name, COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id',        i.id,
          'name',      i.name,
          'basePrice', i.base_price_cents,
          'priceType', i.price_type,
          'emoji',     i.emoji,
          'imageUrl',  i.image_url,
          'allowedModifiers', COALESCE((
            SELECT jsonb_agg(l.group_id ORDER BY l.sort_order)
            FROM public.menu_item_modifier_groups l WHERE l.item_id = i.id
          ), '[]'::jsonb)
        ) || COALESCE(i.data, '{}'::jsonb) ORDER BY i.sort_order)
        FROM public.menu_items i WHERE i.category_id = c.id
      ), '[]'::jsonb)) FROM public.menu_categories c
    ), '{}'::jsonb),

    'categoryOrder', COALESCE((
      SELECT jsonb_agg(c.name ORDER BY c.sort_order) FROM public.menu_categories c
    ), '[]'::jsonb),

    'hiddenCategories', COALESCE((
      SELECT jsonb_agg(c.name) FROM public.menu_categories c WHERE c.is_hidden
    ), '[]'::jsonb),

    'modifierGroups', COALESCE((
      SELECT jsonb_object_agg(g.id, COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id',    o.id,
          'name',  o.name,
          'price', o.price_delta_cents
        ) || COALESCE(o.data, '{}'::jsonb) ORDER BY o.sort_order)
        FROM public.menu_modifier_options o WHERE o.group_id = g.id
      ), '[]'::jsonb)) FROM public.menu_modifier_groups g
    ), '{}'::jsonb),

    'modifierGroupSettings', COALESCE((
      SELECT jsonb_object_agg(g.id, jsonb_build_object('allowMultiple', g.allow_multiple))
      FROM public.menu_modifier_groups g
    ), '{}'::jsonb),

    'discountRules', COALESCE((
      SELECT jsonb_agg(r.payload ORDER BY r.sort_order) FROM public.menu_discount_rules r
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.build_menu_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.build_menu_snapshot() TO authenticated;

-- ----------------------------------------------------------------------------
-- snapshot_menu(reason, trigger_op) — writes the current menu state as a new
-- version row and triggers retention pruning. Skips writing if the snapshot
-- is byte-for-byte identical to the most recent row (avoids no-op rows from
-- debounced writes that didn't actually change anything).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_menu(p_reason text DEFAULT 'auto', p_trigger_op text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_snap   jsonb;
  v_last   jsonb;
  v_id     bigint;
BEGIN
  v_snap := public.build_menu_snapshot();

  SELECT snapshot INTO v_last
  FROM public.menu_versions ORDER BY id DESC LIMIT 1;

  IF v_last IS NOT NULL AND v_last = v_snap AND p_reason = 'auto' THEN
    RETURN NULL;  -- no-op; skip writing a duplicate
  END IF;

  INSERT INTO public.menu_versions (snapshot, reason, trigger_op)
    VALUES (v_snap, COALESCE(p_reason, 'auto'), p_trigger_op)
    RETURNING id INTO v_id;

  PERFORM public.prune_menu_versions();
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_menu(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snapshot_menu(text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- prune_menu_versions() — retention enforcement.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_menu_versions()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH
    keep_manual AS (
      SELECT id FROM public.menu_versions WHERE reason <> 'auto'
    ),
    keep_recent AS (
      SELECT id FROM public.menu_versions
      WHERE created_at > now() - interval '7 days'
    ),
    keep_daily AS (
      SELECT DISTINCT ON (date_trunc('day', created_at)) id
      FROM public.menu_versions
      WHERE created_at > now() - interval '30 days'
      ORDER BY date_trunc('day', created_at), created_at DESC
    ),
    keep_weekly AS (
      SELECT DISTINCT ON (date_trunc('week', created_at)) id
      FROM public.menu_versions
      WHERE created_at > now() - interval '1 year'
      ORDER BY date_trunc('week', created_at), created_at DESC
    ),
    keep AS (
      SELECT id FROM keep_manual UNION
      SELECT id FROM keep_recent UNION
      SELECT id FROM keep_daily  UNION
      SELECT id FROM keep_weekly
    )
  DELETE FROM public.menu_versions WHERE id NOT IN (SELECT id FROM keep);
$$;
REVOKE ALL ON FUNCTION public.prune_menu_versions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_menu_versions() TO authenticated;

-- ----------------------------------------------------------------------------
-- restore_menu_version(version_id) — atomic wipe + replay. Captures a
-- 'restore-target' snapshot of the CURRENT state first, so every restore is
-- itself reversible by restoring from the preceding row.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_menu_version(p_version_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_snap          jsonb;
  v_pre_restore   bigint;
  v_inserted_cats int := 0;
  v_inserted_items int := 0;
BEGIN
  SELECT snapshot INTO v_snap FROM public.menu_versions WHERE id = p_version_id;
  IF v_snap IS NULL THEN
    RAISE EXCEPTION 'menu_versions row % not found', p_version_id;
  END IF;

  -- Reversibility: snapshot the live state into a 'restore-target' row before
  -- destroying it.
  v_pre_restore := public.snapshot_menu('restore-target', 'before-restore-of-' || p_version_id);

  -- Wipe in FK-safe order. Children first.
  DELETE FROM public.menu_item_modifier_groups;
  DELETE FROM public.menu_modifier_options;
  DELETE FROM public.menu_modifier_groups;
  DELETE FROM public.menu_items;
  DELETE FROM public.menu_categories;
  DELETE FROM public.menu_discount_rules;

  -- categories
  WITH ordered AS (
    SELECT key, ord FROM jsonb_array_elements_text(COALESCE(v_snap->'categoryOrder','[]'::jsonb))
      WITH ORDINALITY AS o(key, ord)
  )
  INSERT INTO public.menu_categories (name, sort_order, is_hidden)
  SELECT k,
         COALESCE((SELECT ord FROM ordered WHERE key=k)::int, 1000),
         (COALESCE(v_snap->'hiddenCategories','[]'::jsonb) ? k)
  FROM jsonb_object_keys(COALESCE(v_snap->'categories','{}'::jsonb)) AS k;
  GET DIAGNOSTICS v_inserted_cats = ROW_COUNT;

  -- items
  INSERT INTO public.menu_items
    (id, category_id, name, base_price_cents, price_type, emoji, image_url, sort_order, is_hidden, data)
  SELECT
    item->>'id',
    mc.id,
    COALESCE(item->>'name', ''),
    COALESCE((item->>'basePrice')::int, 0),
    COALESCE(item->>'priceType', 'fixed'),
    COALESCE(item->>'emoji', ''),
    NULLIF(item->>'imageUrl', ''),
    (it.ord - 1)::int,
    false,
    (item - 'id' - 'name' - 'basePrice' - 'priceType' - 'emoji' - 'imageUrl' - 'allowedModifiers' - 'category')
  FROM jsonb_each(COALESCE(v_snap->'categories','{}'::jsonb)) AS cat(key, value)
  JOIN public.menu_categories mc ON mc.name = cat.key
  CROSS JOIN LATERAL jsonb_array_elements(cat.value) WITH ORDINALITY AS it(item, ord)
  WHERE item->>'id' IS NOT NULL;
  GET DIAGNOSTICS v_inserted_items = ROW_COUNT;

  -- modifier groups
  INSERT INTO public.menu_modifier_groups (id, name, allow_multiple, sort_order)
  SELECT key, key,
         COALESCE((v_snap->'modifierGroupSettings'->key->>'allowMultiple')::bool, false),
         ((row_number() OVER (ORDER BY key)) - 1)::int
  FROM jsonb_object_keys(COALESCE(v_snap->'modifierGroups','{}'::jsonb)) AS key;

  -- modifier options
  INSERT INTO public.menu_modifier_options (id, group_id, name, price_delta_cents, sort_order, data)
  SELECT
    opt->>'id',
    grp.key,
    COALESCE(opt->>'name', ''),
    COALESCE((opt->>'price')::int, (opt->>'price_delta_cents')::int, 0),
    (o.ord - 1)::int,
    (opt - 'id' - 'name' - 'price' - 'price_delta_cents')
  FROM jsonb_each(COALESCE(v_snap->'modifierGroups','{}'::jsonb)) AS grp(key, value)
  CROSS JOIN LATERAL jsonb_array_elements(grp.value) WITH ORDINALITY AS o(opt, ord)
  WHERE opt->>'id' IS NOT NULL;

  -- item ↔ modifier-group links (skip orphans)
  INSERT INTO public.menu_item_modifier_groups (item_id, group_id, sort_order)
  SELECT item->>'id', m.mod_key, (m.ord - 1)::int
  FROM jsonb_each(COALESCE(v_snap->'categories','{}'::jsonb)) AS cat(key, value)
  CROSS JOIN LATERAL jsonb_array_elements(cat.value) AS item
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(item->'allowedModifiers','[]'::jsonb))
                     WITH ORDINALITY AS m(mod_key, ord)
  WHERE EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = item->>'id')
    AND EXISTS (SELECT 1 FROM public.menu_modifier_groups mg WHERE mg.id = m.mod_key);

  -- discount rules
  INSERT INTO public.menu_discount_rules (name, rule_type, payload, is_active, sort_order)
  SELECT
    COALESCE(rule->>'name',''),
    COALESCE(rule->>'type',''),
    rule,
    COALESCE((rule->>'isActive')::bool, true),
    (r.ord - 1)::int
  FROM jsonb_array_elements(COALESCE(v_snap->'discountRules','[]'::jsonb))
       WITH ORDINALITY AS r(rule, ord);

  RETURN jsonb_build_object(
    'restored_from',         p_version_id,
    'previous_snapshot_id',  v_pre_restore,
    'inserted_categories',   v_inserted_cats,
    'inserted_items',        v_inserted_items
  );
END $$;
REVOKE ALL ON FUNCTION public.restore_menu_version(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_menu_version(bigint) TO authenticated;
