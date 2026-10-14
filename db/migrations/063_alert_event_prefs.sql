-- 4.8: per-destination alert choices. Each push device keeps its own event list;
-- Telegram (all linked chats) has one. NULL = every event (what existed before).
-- Events: new_order, clip_paid, cfdi_request.
ALTER TABLE public.order_alert_devices ADD COLUMN IF NOT EXISTS events text[];
ALTER TABLE public.order_alerts ADD COLUMN IF NOT EXISTS telegram_events text[];

CREATE OR REPLACE FUNCTION public.get_alert_prefs(p_endpoint text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'device', (SELECT to_jsonb(events) FROM public.order_alert_devices WHERE endpoint = p_endpoint),
    'telegram', (SELECT to_jsonb(telegram_events) FROM public.order_alerts WHERE id = 1));
END $$;
REVOKE ALL ON FUNCTION public.get_alert_prefs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_alert_prefs(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_alert_prefs(p_endpoint text, p_device text[], p_telegram text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_endpoint IS NOT NULL THEN
    UPDATE public.order_alert_devices SET events = p_device WHERE endpoint = p_endpoint;
  END IF;
  INSERT INTO public.order_alerts (id, telegram_events) VALUES (1, p_telegram)
  ON CONFLICT (id) DO UPDATE SET telegram_events = p_telegram, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.set_alert_prefs(text, text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_alert_prefs(text, text[], text[]) TO authenticated;
