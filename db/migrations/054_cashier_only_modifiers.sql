-- 3.9: cashier-only modifier groups (public_hidden) + text-input options stay off the
-- public menu and online ordering (the order already has a notes field).
ALTER TABLE public.menu_modifier_groups ADD COLUMN IF NOT EXISTS public_hidden bool NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.build_menu_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_object_agg(c.name, COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', i.id, 'name', i.name, 'basePrice', i.base_price_cents,
          'priceType', i.price_type, 'emoji', i.emoji, 'imageUrl', i.image_url,
          'isHidden', i.is_hidden,
          'allowedModifiers', COALESCE((
            SELECT jsonb_agg(l.group_id ORDER BY l.sort_order)
            FROM public.menu_item_modifier_groups l WHERE l.item_id = i.id
          ), '[]'::jsonb)
        ) || COALESCE(i.data, '{}'::jsonb) ORDER BY i.sort_order)
        FROM public.menu_items i WHERE i.category_id = c.id
      ), '[]'::jsonb)) FROM public.menu_categories c
    ), '{}'::jsonb),
    'categoryOrder', COALESCE((SELECT jsonb_agg(c.name ORDER BY c.sort_order) FROM public.menu_categories c), '[]'::jsonb),
    'hiddenCategories', COALESCE((SELECT jsonb_agg(c.name) FROM public.menu_categories c WHERE c.is_hidden), '[]'::jsonb),
    'publicHiddenCategories', COALESCE((SELECT jsonb_agg(c.name) FROM public.menu_categories c WHERE c.public_hidden), '[]'::jsonb),
    'modifierGroups', COALESCE((
      SELECT jsonb_object_agg(g.id, COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'price', o.price_delta_cents) || COALESCE(o.data, '{}'::jsonb) ORDER BY o.sort_order)
        FROM public.menu_modifier_options o WHERE o.group_id = g.id
      ), '[]'::jsonb)) FROM public.menu_modifier_groups g
    ), '{}'::jsonb),
    'modifierGroupSettings', COALESCE((
      SELECT jsonb_object_agg(g.id, jsonb_build_object('allowMultiple', g.allow_multiple, 'isHidden', g.is_hidden, 'publicHidden', g.public_hidden)) FROM public.menu_modifier_groups g
    ), '{}'::jsonb),
    'discountRules', COALESCE((SELECT jsonb_agg(r.payload ORDER BY r.sort_order) FROM public.menu_discount_rules r), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.build_menu_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.build_menu_snapshot() TO authenticated;

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
    'name',        COALESCE((SELECT menu_data->'posSettings'->>'name'       FROM public.shop_settings WHERE id = 1), 'Menu'),
    'brand_color', COALESCE((SELECT menu_data->'posSettings'->>'brandColor' FROM public.shop_settings WHERE id = 1), '#f28b05'),
    'language',    COALESCE((SELECT menu_data->'posSettings'->>'language'   FROM public.shop_settings WHERE id = 1), 'es'),
    'timezone',    v_tz,
    'showcase',    (SELECT menu_data->'posSettings'->'onlineOrders'->'trackShowcase' FROM public.shop_settings WHERE id = 1),
    'slots',       (SELECT menu_data->'posSettings'->'onlineOrders'->'slots' FROM public.shop_settings WHERE id = 1),
    'payments',   (SELECT menu_data->'posSettings'->'onlineOrders'->'payments' FROM public.shop_settings WHERE id = 1),
    'schedule',    (SELECT menu_data->'posSettings'->'onlineOrders'->'schedule' FROM public.shop_settings WHERE id = 1),
    'open_hours',  (SELECT menu_data->'posSettings'->'onlineOrders'->'openHours' FROM public.shop_settings WHERE id = 1),
    'logo', COALESCE(NULLIF((SELECT menu_data->'posSettings'->>'appBootLogo' FROM public.shop_settings WHERE id = 1), ''), (SELECT menu_data->'receiptSettings'->>'logo' FROM public.shop_settings WHERE id = 1))
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
                WHERE l.item_id = i.id AND g.is_hidden = false AND g.public_hidden = false
              ), '[]'::jsonb)
            ) ORDER BY i.sort_order)
            FROM public.menu_items i WHERE i.category_id = c.id
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
            FROM public.menu_modifier_options o WHERE o.group_id = g.id AND COALESCE((o.data->>'isTextInput')::boolean, false) = false
          ), '[]'::jsonb)
        ) ORDER BY g.sort_order)
        FROM public.menu_modifier_groups g WHERE g.is_hidden = false AND g.public_hidden = false
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
REVOKE ALL ON FUNCTION public.get_active_menu(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_menu(timestamptz) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_menu()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT public.get_active_menu(now());
$$;
REVOKE ALL ON FUNCTION public.get_public_menu() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_menu() TO anon, authenticated;

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
    'timezone', v_tz,
    'logo', COALESCE(NULLIF((SELECT menu_data->'posSettings'->>'appBootLogo' FROM public.shop_settings WHERE id = 1), ''), (SELECT menu_data->'receiptSettings'->>'logo' FROM public.shop_settings WHERE id = 1))
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
                WHERE l.item_id = i.id AND g.is_hidden = false AND g.public_hidden = false
              ), '[]'::jsonb)
            ) ORDER BY i.sort_order)
            FROM public.menu_items i WHERE i.category_id = c.id
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
            FROM public.menu_modifier_options o WHERE o.group_id = g.id AND COALESCE((o.data->>'isTextInput')::boolean, false) = false
          ), '[]'::jsonb)
        ) ORDER BY g.sort_order)
        FROM public.menu_modifier_groups g WHERE g.is_hidden = false AND g.public_hidden = false
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
REVOKE ALL ON FUNCTION public.get_menu_by_id(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_menu_by_id(bigint) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_place_order(payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg jsonb;
  v_sched jsonb;
  v_local timestamp;
  v_phone text := regexp_replace(COALESCE(payload->>'phone', ''), '[^0-9]', '', 'g');
  v_name text := btrim(COALESCE(payload->>'name', ''));
  v_notes text := NULLIF(btrim(COALESCE(payload->>'notes', '')), '');
  v_pickup timestamptz := NULL;
  v_sl jsonb; v_hrs jsonb; v_iv int; v_lead int; v_ahead int; v_ploc timestamp;
  v_in jsonb;
  v_it record;
  v_item public.menu_items%ROWTYPE;
  v_qty int;
  v_mods jsonb;
  v_mod_ids jsonb;
  v_opt record;
  v_unit int;
  v_out jsonb := '[]'::jsonb;
  v_total int := 0;
  v_token text;
  v_type text := COALESCE(NULLIF(payload->>'order_type', ''), 'pickup');
  v_addr text := NULLIF(btrim(COALESCE(payload->>'address', '')), '');
  v_deliv boolean;
  v_fee int := 0;
  v_area jsonb;
  v_quote jsonb;
  v_status text := 'requested';
  v_lat double precision;
  v_lng double precision;
  v_cats jsonb;
  v_pay text := payload->>'payment_method';
  v_pays jsonb;
  v_cash int;
BEGIN
  -- 1. Feature gate: opt-in, not paused, inside the schedule (shop timezone).
  SELECT menu_data->'posSettings'->'onlineOrders' INTO v_cfg FROM public.shop_settings WHERE id = 1;
  IF COALESCE((v_cfg->>'enabled')::boolean, false) = false THEN
    RAISE EXCEPTION 'online_orders_disabled';
  END IF;
  IF COALESCE((v_cfg->>'paused')::boolean, false) THEN
    RAISE EXCEPTION 'online_orders_paused';
  END IF;
  -- Store hours (openHours): open when 'always' or any rule matches now in shop tz.
  -- Absent openHours = always open. (onlineOrders.schedule is delivery/pickup hours only.)
  v_sched := v_cfg->'openHours';
  IF v_sched IS NOT NULL AND jsonb_typeof(v_sched) = 'object'
     AND COALESCE((v_sched->>'always')::boolean, false) = false THEN
    v_local := (now() AT TIME ZONE public.shop_timezone())::timestamp;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_sched->'rules') = 'array' THEN v_sched->'rules' ELSE '[]'::jsonb END
      ) r
      WHERE public.schedule_matches(
        COALESCE((r->>'days')::int, 0),
        NULLIF(r->>'start', '')::time,
        NULLIF(r->>'end', '')::time,
        NULL, NULL, v_local
      )
    ) THEN
      RAISE EXCEPTION 'online_orders_closed';
    END IF;
  END IF;
  -- From here on v_sched is the delivery/pickup schedule (slot hours fallback).
  v_sched := v_cfg->'schedule';

  -- Availability probe for the page: {"check":true} runs only the gate above.

  v_deliv := COALESCE((v_cfg->'delivery'->>'enabled')::boolean, false) AND EXISTS (
SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_cfg->'delivery'->'areas')='array'
  THEN v_cfg->'delivery'->'areas' ELSE '[]'::jsonb END) a
WHERE COALESCE((a->>'enabled')::boolean,false)
  );
  -- A probe only says whether address service is offered; a separate quote
  -- resolves the confirmed pin against the current server settings.
  IF COALESCE((payload->>'check')::boolean, false) THEN
    RETURN CASE WHEN v_deliv OR COALESCE((v_cfg->'delivery'->>'shippingEnabled')::boolean, false)
      THEN 'open:delivery' ELSE 'open' END;
  END IF;


  -- 2. Input validation (the page enforces the same; this is the real check).
  IF length(v_name) < 1 OR length(v_name) > 80 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF length(v_phone) < 7 OR length(v_phone) > 15 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 300 THEN RAISE EXCEPTION 'invalid_notes'; END IF;
  IF v_type NOT IN ('pickup', 'delivery') THEN RAISE EXCEPTION 'invalid_type'; END IF;
  v_pays := v_cfg->'payments'->'methods';
  IF v_pays IS NULL OR jsonb_typeof(v_pays) <> 'array' OR jsonb_array_length(v_pays) = 0 THEN v_pays := '["cash","card","transfer"]'::jsonb; END IF;
  IF v_pay IS NULL OR v_pay NOT IN ('cash','card','transfer','clip') OR NOT (v_pays @> to_jsonb(v_pay))
 OR (v_pay = 'clip' AND NOT COALESCE((SELECT enabled FROM public.clip_credentials WHERE id = 1), false)) THEN RAISE EXCEPTION 'invalid_payment'; END IF;
  IF v_type = 'delivery' THEN
    IF NOT v_deliv AND NOT COALESCE((v_cfg->'delivery'->>'shippingEnabled')::boolean, false) THEN RAISE EXCEPTION 'delivery_disabled'; END IF;
    IF v_addr IS NULL OR length(v_addr) < 5 OR length(v_addr) > 250 THEN RAISE EXCEPTION 'invalid_address'; END IF;
    BEGIN
      v_lat := (payload->>'lat')::double precision;
      v_lng := (payload->>'lng')::double precision;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'pin_required'; END;
    IF v_lat IS NULL OR v_lng IS NULL OR v_lat NOT BETWEEN -90 AND 90 OR v_lng NOT BETWEEN -180 AND 180 THEN
      RAISE EXCEPTION 'pin_required';
    END IF;
    v_quote := public.get_delivery_quote(v_lat,v_lng);
-- A changed area or shipping switch must be reviewed by the customer;
-- do not silently turn a pending quote into a priced delivery or vice versa.
IF payload->>'expected_quote_kind' IS DISTINCT FROM v_quote->>'kind'
   OR (v_quote->>'kind' = 'delivery' AND (
     payload->>'expected_fee_cents' IS DISTINCT FROM v_quote->>'fee_cents'
     OR payload->>'expected_area_id' IS DISTINCT FROM v_quote->'area'->>'id')) THEN
  RAISE EXCEPTION 'quote_changed';
END IF;
    IF v_quote->>'kind' = 'delivery' THEN
      v_area := v_quote->'area';
      v_fee := (v_quote->>'fee_cents')::int;
    ELSIF v_quote->>'kind' = 'shipping' THEN
      v_type := 'shipping';
      v_status := 'quote_pending';
    ELSE
      RAISE EXCEPTION 'delivery_outside';
    END IF;
  ELSE
    v_addr := NULL;
  END IF;
  IF NULLIF(payload->>'pickup_at', '') IS NOT NULL THEN
    BEGIN v_pickup := (payload->>'pickup_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_pickup'; END;
    -- Pickup is always a real near-future time (schema 2.5); slot rules only when slots.enabled.
    IF v_pickup < now() - interval '5 minutes' OR v_pickup > now() + interval '14 days' THEN RAISE EXCEPTION 'invalid_pickup'; END IF;
    v_sl := COALESCE(v_cfg->'slots', '{}'::jsonb);
    IF COALESCE((v_sl->>'enabled')::boolean, false) THEN
      v_iv := CASE WHEN v_sl->>'interval' IN ('15','30','60') THEN (v_sl->>'interval')::int ELSE 30 END;
      v_lead := LEAST(GREATEST(COALESCE(NULLIF(v_sl->>'leadMinutes', '')::int, 30), 0), 1440);
      v_ahead := LEAST(GREATEST(COALESCE(NULLIF(v_sl->>'daysAhead', '')::int, 3), 0), 14);
      v_hrs := CASE WHEN jsonb_typeof(v_sl->'hours') = 'object' THEN v_sl->'hours'
                    WHEN jsonb_typeof(v_sched) = 'object' THEN v_sched ELSE '{}'::jsonb END;
      v_ploc := (v_pickup AT TIME ZONE public.shop_timezone())::timestamp;
      IF v_pickup < now() + (v_lead - 5) * interval '1 minute'
         OR v_pickup > now() + v_ahead * interval '1 day'
         OR NOT public.schedule_matches(
              COALESCE((v_hrs->>'days')::int, 0),
              COALESCE(NULLIF(v_hrs->>'start', ''), '09:00')::time,
              COALESCE(NULLIF(v_hrs->>'end', ''), '21:00')::time,
              NULL, NULL, v_ploc)
         OR EXTRACT(second FROM v_ploc) <> 0
         OR (EXTRACT(hour FROM v_ploc)::int * 60 + EXTRACT(minute FROM v_ploc)::int) % v_iv <> 0 THEN
        RAISE EXCEPTION 'invalid_pickup';
      END IF;
    END IF;
  END IF;
  -- ASAP is only allowed while the shop is inside its delivery/pickup hours (schema 2.7).
  IF v_pickup IS NULL AND COALESCE((v_cfg->'slots'->>'enabled')::boolean, false) THEN
    v_sl := v_cfg->'slots';
    v_hrs := CASE WHEN jsonb_typeof(v_sl->'hours') = 'object' THEN v_sl->'hours'
                  WHEN jsonb_typeof(v_sched) = 'object' THEN v_sched ELSE '{}'::jsonb END;
    IF NOT public.schedule_matches(
         COALESCE((v_hrs->>'days')::int, 0),
         COALESCE(NULLIF(v_hrs->>'start', ''), '09:00')::time,
         COALESCE(NULLIF(v_hrs->>'end', ''), '21:00')::time,
         NULL, NULL, (now() AT TIME ZONE public.shop_timezone())::timestamp) THEN
      RAISE EXCEPTION 'pickup_required';
    END IF;
  END IF;
  v_in := payload->'items';
  IF v_in IS NULL OR jsonb_typeof(v_in) <> 'array'
     OR jsonb_array_length(v_in) < 1 OR jsonb_array_length(v_in) > 50 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  -- 3. Abuse limits: per phone and shop-wide.
  IF NOT public.rate_limit_hit('order:' || v_phone, 5, interval '15 minutes')
     OR NOT public.rate_limit_hit('order:all', 120, interval '1 hour') THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- 4. Reprice every line from menu_items; client prices are never read.
  -- Categories the order menu (get_order_menu) hides (menu.data.category_names whitelist) are not orderable.
  v_cats := public.get_order_menu()->'menu'->'data'->'category_names';
  FOR v_it IN SELECT value AS j FROM jsonb_array_elements(v_in) LOOP
    BEGIN v_qty := (v_it.j->>'qty')::int;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_items'; END;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 99 THEN RAISE EXCEPTION 'invalid_items'; END IF;

    SELECT i.* INTO v_item
    FROM public.menu_items i
    JOIN public.menu_categories c ON c.id = i.category_id
    WHERE i.id = (v_it.j->>'id')
      AND c.public_hidden = false
      AND COALESCE((i.data->>'publicHidden')::boolean, false) = false;
    IF NOT FOUND OR v_item.price_type <> 'fixed' OR NOT public.menu_item_available(v_item.id) THEN
      RAISE EXCEPTION 'item_unavailable';
    END IF;
    IF v_cats IS NOT NULL AND jsonb_typeof(v_cats) = 'array' AND jsonb_array_length(v_cats) > 0
       AND NOT EXISTS (SELECT 1 FROM public.menu_categories c WHERE c.id = v_item.category_id AND v_cats @> to_jsonb(c.name)) THEN
      RAISE EXCEPTION 'item_unavailable';
    END IF;

    v_unit := v_item.base_price_cents;
    v_mods := '[]'::jsonb;
    v_mod_ids := CASE WHEN jsonb_typeof(v_it.j->'modifiers') = 'array' THEN v_it.j->'modifiers' ELSE '[]'::jsonb END;
    IF jsonb_array_length(v_mod_ids) > 20 THEN RAISE EXCEPTION 'invalid_items'; END IF;

    FOR v_opt IN
      SELECT o.id, o.name, o.price_delta_cents, g.id AS group_id
      FROM jsonb_array_elements_text(v_mod_ids) AS m(id)
      LEFT JOIN public.menu_modifier_options o ON o.id = m.id AND COALESCE((o.data->>'isTextInput')::boolean, false) = false
      LEFT JOIN public.menu_item_modifier_groups l ON l.group_id = o.group_id AND l.item_id = v_item.id
      LEFT JOIN public.menu_modifier_groups g ON g.id = l.group_id AND g.is_hidden = false AND g.public_hidden = false
    LOOP
      IF v_opt.id IS NULL OR v_opt.group_id IS NULL THEN RAISE EXCEPTION 'item_unavailable'; END IF;
      v_unit := v_unit + COALESCE(v_opt.price_delta_cents, 0);
      v_mods := v_mods || jsonb_build_object(
        'id', v_opt.id, 'name', v_opt.name, 'groupId', v_opt.group_id,
        'price_cents', COALESCE(v_opt.price_delta_cents, 0));
    END LOOP;
    -- Single-choice groups accept at most one option.
    IF EXISTS (
      SELECT 1 FROM jsonb_to_recordset(v_mods) AS x(id text, "groupId" text)
      JOIN public.menu_modifier_groups g ON g.id = x."groupId" AND g.allow_multiple = false
      GROUP BY x."groupId" HAVING count(*) > 1
    ) THEN RAISE EXCEPTION 'invalid_items'; END IF;

    v_total := v_total + v_unit * v_qty;
    v_out := v_out || jsonb_build_object(
      'id', v_item.id, 'name', v_item.name, 'qty', v_qty,
      'unit_cents', v_unit, 'base_cents', v_item.base_price_cents,
      'iva', v_item.data->>'ivaTreatment', 'modifiers', v_mods,
      'line_cents', v_unit * v_qty);
  END LOOP;

  -- Optional "pays with" amount (cash only): whole cents, >= the server total, at most $1000 over.
  IF v_type = 'shipping' AND NULLIF(payload->>'cash_amount_cents', '') IS NOT NULL THEN RAISE EXCEPTION 'invalid_cash'; END IF;
  IF v_pay = 'cash' AND NULLIF(payload->>'cash_amount_cents', '') IS NOT NULL THEN
    BEGIN v_cash := (payload->>'cash_amount_cents')::int;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_cash'; END;
    IF v_cash < v_total + v_fee OR v_cash > v_total + v_fee + 100000 THEN RAISE EXCEPTION 'invalid_cash'; END IF;
  END IF;
  INSERT INTO public.online_orders (customer_name, phone, notes, pickup_at, items, total_cents, order_type, delivery_address, delivery_fee_cents, delivery_lat, delivery_lng, payment_method, cash_amount_cents, delivery_area, status)
  VALUES (v_name, v_phone, v_notes, v_pickup, v_out, v_total + v_fee, v_type, v_addr, v_fee, v_lat, v_lng, v_pay, v_cash, v_area, v_status)
  RETURNING token INTO v_token;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.public_place_order(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_place_order(jsonb) TO anon, authenticated;
