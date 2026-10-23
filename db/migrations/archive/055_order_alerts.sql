-- 4.0: new-online-order alerts that work with no TinyPOS open anywhere.
-- An AFTER INSERT trigger on online_orders calls this project's own
-- "order-alert" Edge Function through pg_net; the function sends Telegram
-- (the shop's own bot) and Web Push (VAPID keys the shop generated itself).
-- order_alerts / push_subscriptions are service-role only, like
-- clip_credentials: staff go through the SECURITY DEFINER RPCs below.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_net unavailable: order alerts disabled (%)', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS public.order_alerts (
  id                int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled           boolean NOT NULL DEFAULT false,
  hook_url          text,
  hook_secret       text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  telegram_token    text,
  telegram_chat_ids text[] NOT NULL DEFAULT '{}',
  vapid_public      text,
  vapid_private     text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_alerts FROM anon, authenticated;
GRANT ALL ON TABLE public.order_alerts TO service_role;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint   text PRIMARY KEY,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  label      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

-- Flags only; the bot token and VAPID private key never leave the database.
CREATE OR REPLACE FUNCTION public.order_alerts_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_app_user((select auth.uid())) THEN jsonb_build_object(
    'enabled', coalesce(a.enabled, false),
    'telegram', coalesce(a.telegram_token <> '', false),
    'chats', coalesce(cardinality(a.telegram_chat_ids), 0),
    'vapid_public', a.vapid_public,
    'devices', (SELECT count(*) FROM public.push_subscriptions),
    'pg_net', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net'))
  ELSE NULL END
  FROM (SELECT 1) one LEFT JOIN public.order_alerts a ON a.id = 1;
$$;
REVOKE ALL ON FUNCTION public.order_alerts_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_alerts_status() TO authenticated;

-- Blank token keeps the stored one; a new token (or p_clear_chats) unlinks chats.
CREATE OR REPLACE FUNCTION public.set_order_alerts(p_enabled boolean, p_hook_url text, p_telegram_token text, p_clear_chats boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text := nullif(trim(p_telegram_token), '');
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_hook_url IS NOT NULL AND p_hook_url !~ '^https://[^/]+/functions/v1/order-alert$' THEN RAISE EXCEPTION 'invalid_hook_url'; END IF;
  INSERT INTO public.order_alerts (id, enabled, hook_url, telegram_token)
  VALUES (1, p_enabled, p_hook_url, v_token)
  ON CONFLICT (id) DO UPDATE SET
    enabled = p_enabled,
    hook_url = coalesce(p_hook_url, public.order_alerts.hook_url),
    telegram_chat_ids = CASE WHEN p_clear_chats OR (v_token IS NOT NULL AND v_token IS DISTINCT FROM public.order_alerts.telegram_token)
      THEN '{}' ELSE public.order_alerts.telegram_chat_ids END,
    telegram_token = coalesce(v_token, public.order_alerts.telegram_token),
    updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.set_order_alerts(boolean, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_alerts(boolean, text, text, boolean) TO authenticated;

-- First device to enable push generates the shop's VAPID pair; later callers
-- get the stored public key back (existing subscriptions stay valid).
CREATE OR REPLACE FUNCTION public.init_vapid_keys(p_public text, p_private text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text;
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.order_alerts (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  UPDATE public.order_alerts SET vapid_public = p_public, vapid_private = p_private, updated_at = now()
  WHERE id = 1 AND vapid_public IS NULL;
  SELECT vapid_public INTO v FROM public.order_alerts WHERE id = 1;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.init_vapid_keys(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.init_vapid_keys(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_label text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_endpoint !~ '^https://' THEN RAISE EXCEPTION 'invalid_endpoint'; END IF;
  INSERT INTO public.push_subscriptions (endpoint, p256dh, auth, label) VALUES (p_endpoint, p_p256dh, p_auth, left(p_label, 80))
  ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, label = EXCLUDED.label;
END $$;
REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint;
END $$;
REVOKE ALL ON FUNCTION public.delete_push_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO authenticated;

-- Fire-and-forget (pg_net is async); any failure is swallowed so an alert
-- problem can never block a customer's order.
CREATE OR REPLACE FUNCTION public.notify_online_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text; v_secret text;
BEGIN
  SELECT hook_url, hook_secret INTO v_url, v_secret FROM public.order_alerts WHERE id = 1 AND enabled;
  IF v_url IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(url := v_url, body := jsonb_build_object('order_id', NEW.id, 'secret', v_secret),
        headers := '{"Content-Type": "application/json"}'::jsonb);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_online_order() FROM PUBLIC;
DROP TRIGGER IF EXISTS online_orders_notify ON public.online_orders;
CREATE TRIGGER online_orders_notify AFTER INSERT ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_online_order();
