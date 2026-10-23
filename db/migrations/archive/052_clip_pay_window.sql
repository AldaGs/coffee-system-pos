-- 3.5: Clip pay window (set on accept); the Register voids unpaid orders past it.
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS pay_by timestamptz;

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
      LEFT JOIN public.menu_modifier_options o ON o.id = m.id
      LEFT JOIN public.menu_item_modifier_groups l ON l.group_id = o.group_id AND l.item_id = v_item.id
      LEFT JOIN public.menu_modifier_groups g ON g.id = l.group_id AND g.is_hidden = false
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

CREATE OR REPLACE FUNCTION public.get_order_status(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_row public.online_orders%ROWTYPE;
  v_status text;
  v_ful text;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 32 THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT * INTO v_row FROM public.online_orders WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  -- Delivery orders: logistics drives the last steps, so derive them from the
  -- linked order_fulfillment here (works with the Register closed).
  v_status := v_row.status;
  IF v_row.order_type = 'delivery' AND v_row.active_ticket_id IS NOT NULL
     AND v_status IN ('accepted', 'preparing', 'ready', 'on_delivery') THEN
    SELECT status INTO v_ful FROM public.order_fulfillment
     WHERE active_ticket_id = v_row.active_ticket_id ORDER BY created_at DESC LIMIT 1;
    IF v_ful = 'in_transit' THEN v_status := 'on_delivery';
    ELSIF v_ful = 'completed' THEN v_status := 'completed'; END IF;
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'status', v_status,
    'order_type', v_row.order_type,
    'payment_method', v_row.payment_method,
    'payment_status', v_row.payment_status,
    'pay_by', v_row.pay_by,
    'cash_amount_cents', v_row.cash_amount_cents,
    'order_num', v_row.order_num,
    'delivery_fee_cents', v_row.delivery_fee_cents,
    'delivery_area', v_row.delivery_area,
    'shipping_quote_cents', v_row.shipping_quote_cents,
    'reject_reason', v_row.reject_reason,
    'show_iva', COALESCE((SELECT (menu_data->'posSettings'->'onlineOrders'->'ticket'->>'showIva')::boolean FROM public.shop_settings WHERE id = 1), false),
    'tax_rate', COALESCE((SELECT (menu_data->'receiptSettings'->>'taxRate')::numeric FROM public.shop_settings WHERE id = 1), 16),
    'items', v_row.items,
    'total_cents', v_row.total_cents,
    'pickup_at', v_row.pickup_at,
    'created_at', v_row.created_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_order_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_status(text) TO anon, authenticated;
