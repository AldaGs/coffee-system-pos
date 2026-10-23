-- 5.6: get_order_status no longer errors for delivery orders when tinylogistics'
-- order_fulfillment table doesn't exist (POS-only shops).
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
  v_track text;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 32 THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT * INTO v_row FROM public.online_orders WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  -- Delivery orders: logistics drives the last steps, so derive them from the
  -- linked order_fulfillment here (works with the Register closed). That table
  -- belongs to tinylogistics and is missing on POS-only shops.
  v_status := v_row.status;
  IF v_row.order_type = 'delivery' AND v_row.active_ticket_id IS NOT NULL
     AND v_status IN ('accepted', 'preparing', 'ready', 'on_delivery') THEN
    BEGIN
      SELECT status INTO v_ful FROM public.order_fulfillment
       WHERE active_ticket_id = v_row.active_ticket_id ORDER BY created_at DESC LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
      v_ful := NULL;
    END;
    IF v_ful = 'in_transit' THEN v_status := 'on_delivery';
    ELSIF v_ful = 'completed' THEN v_status := 'completed'; END IF;
  END IF;
  -- Tracking link; same caveat.
  IF v_row.active_ticket_id IS NOT NULL THEN
    BEGIN
      SELECT tracking_token INTO v_track FROM public.order_fulfillment
       WHERE active_ticket_id = v_row.active_ticket_id ORDER BY created_at DESC LIMIT 1;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      v_track := NULL;
    END;
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
    'created_at', v_row.created_at,
    'tracking_token', CASE WHEN v_status <> 'rejected' THEN v_track END,
    'cfdi_ref', CASE WHEN v_status = 'completed' THEN v_row.active_ticket_id::text END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_order_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_status(text) TO anon, authenticated;
