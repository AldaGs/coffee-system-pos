-- 3.4: Clip online card payments. clip_credentials holds the business's own
-- Clip API key/secret. No policies and no grants for anon/authenticated: only
-- the service role (edge functions) reads it; staff write via
-- set_clip_credentials() and read only the flags via clip_status().
CREATE TABLE IF NOT EXISTS public.clip_credentials (
  id         int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_key    text,
  api_secret text,
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clip_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clip_credentials FROM anon, authenticated;
GRANT ALL ON TABLE public.clip_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.clip_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_app_user((select auth.uid()))
    THEN jsonb_build_object(
      'enabled', coalesce((SELECT enabled FROM public.clip_credentials WHERE id = 1), false),
      'configured', coalesce((SELECT api_key <> '' AND api_secret <> '' FROM public.clip_credentials WHERE id = 1), false))
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.clip_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clip_status() TO authenticated;

-- Blank key/secret keep the stored value, so the toggle works without retyping.
CREATE OR REPLACE FUNCTION public.set_clip_credentials(p_key text, p_secret text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.clip_credentials (id, api_key, api_secret, enabled, updated_at)
  VALUES (1, nullif(trim(p_key), ''), nullif(trim(p_secret), ''), p_enabled, now())
  ON CONFLICT (id) DO UPDATE SET
    api_key = coalesce(nullif(trim(p_key), ''), public.clip_credentials.api_key),
    api_secret = coalesce(nullif(trim(p_secret), ''), public.clip_credentials.api_secret),
    enabled = p_enabled, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.set_clip_credentials(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_clip_credentials(text, text, boolean) TO authenticated;

ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS clip_payment_id text;
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS clip_link_url text;
ALTER TABLE public.online_orders DROP CONSTRAINT IF EXISTS online_orders_payment_method_check;
ALTER TABLE public.online_orders ADD CONSTRAINT online_orders_payment_method_check
  CHECK (payment_method IN ('cash','card','transfer','clip'));
