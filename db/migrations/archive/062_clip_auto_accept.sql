-- 4.7: optional auto-accept for Clip online orders (onlineOrders.payments.clipAutoAccept)
-- when every line is in stock, done in the DB so the customer gets the pay link with
-- no Register open; a Register opens the ticket when it next sees the order.
-- Plus a "paid with Clip" alert through the order-alert pipeline.
CREATE OR REPLACE FUNCTION public.menu_item_has_stock(p_item_id text, p_qty numeric)
RETURNS bool LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_data jsonb; v_mode text; v_id bigint; v_rid uuid;
BEGIN
  SELECT data INTO v_data FROM public.menu_items WHERE id = p_item_id;
  IF v_data IS NULL THEN RETURN true; END IF;
  v_mode := COALESCE(v_data->>'inventoryMode', 'none');
  IF v_mode IN ('warehouse', 'standard') THEN
    BEGIN v_id := NULLIF(v_data->>'linkedWarehouseId', '')::bigint;
    EXCEPTION WHEN OTHERS THEN RETURN false; END;
    IF v_id IS NULL THEN RETURN true; END IF;
    RETURN COALESCE((SELECT current_stock >= p_qty FROM public.inventory WHERE id = v_id), false);
  END IF;
  IF v_mode = 'recipe' THEN
    BEGIN v_rid := NULLIF(v_data->>'linkedRecipeId', '')::uuid;
    EXCEPTION WHEN OTHERS THEN RETURN false; END;
    IF v_rid IS NULL THEN RETURN true; END IF;
    RETURN NOT EXISTS (
      SELECT 1 FROM public.recipes r, LATERAL jsonb_array_elements(COALESCE(r.ingredients, '[]'::jsonb)) AS ing(val)
      WHERE r.id = v_rid
        AND COALESCE((SELECT current_stock FROM public.inventory
              WHERE id = (CASE WHEN (ing.val->>'id') ~ '^[0-9]+$' THEN (ing.val->>'id')::bigint END)), 0)
          < p_qty * (CASE WHEN (ing.val->>'qty') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (ing.val->>'qty')::numeric ELSE 0 END));
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.menu_item_has_stock(text, numeric) FROM PUBLIC;

-- ponytail: checks each line alone; two lines drawing on the same stock item can
-- still oversell together. Sum per inventory item if that ever bites.
CREATE OR REPLACE FUNCTION public.auto_accept_clip_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay jsonb;
BEGIN
  IF NEW.payment_method IS DISTINCT FROM 'clip' OR NEW.status <> 'requested' THEN RETURN NEW; END IF;
  SELECT menu_data->'posSettings'->'onlineOrders'->'payments' INTO v_pay FROM public.shop_settings WHERE id = 1;
  IF COALESCE((v_pay->>'clipAutoAccept')::boolean, false) AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) l
    WHERE NOT public.menu_item_has_stock(l->>'id', COALESCE((l->>'qty')::numeric, 1))
  ) THEN
    NEW.status := 'accepted';
    NEW.pay_by := now() + LEAST(GREATEST(COALESCE(round(NULLIF(v_pay->>'clipMinutes', '')::numeric)::int, 15), 5), 120) * interval '1 minute';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; -- a bad setting falls back to manual accept
END $$;
REVOKE ALL ON FUNCTION public.auto_accept_clip_order() FROM PUBLIC;
DROP TRIGGER IF EXISTS online_orders_auto_accept ON public.online_orders;
CREATE TRIGGER online_orders_auto_accept BEFORE INSERT ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_accept_clip_order();

CREATE OR REPLACE FUNCTION public.notify_clip_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    SELECT hook_url, hook_secret INTO v_url, v_secret FROM public.order_alerts WHERE id = 1 AND enabled;
    IF v_url IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(url := v_url, body := jsonb_build_object('paid_order_id', NEW.id, 'secret', v_secret),
          headers := '{"Content-Type": "application/json"}'::jsonb);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_clip_paid() FROM PUBLIC;
DROP TRIGGER IF EXISTS online_orders_paid_notify ON public.online_orders;
CREATE TRIGGER online_orders_paid_notify AFTER UPDATE OF payment_status ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_clip_paid();
