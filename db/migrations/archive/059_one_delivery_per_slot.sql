-- 4.4: optional "one local delivery per time slot" (onlineOrders.slots.oneDeliveryPerSlot,
-- only with slots.enabled) so far-apart deliveries can't pile onto the same slot.
-- Enforced by a trigger so public_place_order is untouched; rejected orders free the slot.
CREATE OR REPLACE FUNCTION public.delivery_slot_cap_on()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE((menu_data->'posSettings'->'onlineOrders'->'slots'->>'enabled')::boolean, false)
     AND COALESCE((menu_data->'posSettings'->'onlineOrders'->'slots'->>'oneDeliveryPerSlot')::boolean, false)
  FROM public.shop_settings WHERE id = 1;
$$;
REVOKE ALL ON FUNCTION public.delivery_slot_cap_on() FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.enforce_delivery_slot_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_type <> 'delivery' OR NOT COALESCE(public.delivery_slot_cap_on(), false) THEN RETURN NEW; END IF;
  -- With the cap on, a delivery needs a concrete slot (no open-ended ASAP).
  IF NEW.pickup_at IS NULL THEN RAISE EXCEPTION 'pickup_required'; END IF;
  -- Serialize concurrent checkouts for the same slot.
  PERFORM pg_advisory_xact_lock(hashtext('delivery_slot'), hashtext(NEW.pickup_at::text));
  IF EXISTS (SELECT 1 FROM public.online_orders o
             WHERE o.order_type = 'delivery' AND o.pickup_at = NEW.pickup_at
               AND o.status <> 'rejected' AND o.id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'slot_taken';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS online_orders_delivery_slot_cap ON public.online_orders;
CREATE TRIGGER online_orders_delivery_slot_cap BEFORE INSERT ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_slot_cap();
-- Upcoming taken delivery slots (times only, no order data) so checkout can hide them.
CREATE OR REPLACE FUNCTION public.get_taken_delivery_slots()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE WHEN COALESCE(public.delivery_slot_cap_on(), false) THEN COALESCE((
    SELECT jsonb_agg(DISTINCT pickup_at) FROM public.online_orders
    WHERE order_type = 'delivery' AND status <> 'rejected'
      AND pickup_at > now() - interval '1 hour' AND pickup_at < now() + interval '15 days'), '[]'::jsonb)
  ELSE '[]'::jsonb END;
$$;
REVOKE ALL ON FUNCTION public.get_taken_delivery_slots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_taken_delivery_slots() TO anon, authenticated;
