-- 5.3: email the customer their CFDI when a sale is marked issued. Each tenant
-- brings its own provider account (cfdi_email_settings, service-role only, like
-- clip_credentials); staff write via set_cfdi_email() and read flags via
-- cfdi_email_status(). A pg_net trigger calls the "cfdi-email" Edge Function,
-- which records cfdi_emailed_at / cfdi_email_error on the sale.
CREATE TABLE IF NOT EXISTS public.cfdi_email_settings (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider      text NOT NULL DEFAULT 'resend',
  api_key       text,
  from_address  text,
  reply_to      text,
  business_name text,
  link_template text,
  hook_url      text,
  hook_secret   text NOT NULL DEFAULT gen_random_uuid()::text,
  enabled       boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cfdi_email_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cfdi_email_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.cfdi_email_settings TO service_role;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cfdi_emailed_at timestamptz;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cfdi_email_error text;

CREATE OR REPLACE FUNCTION public.cfdi_email_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_app_user((select auth.uid()))
    THEN coalesce((SELECT jsonb_build_object(
      'provider', provider, 'from_address', from_address, 'reply_to', reply_to,
      'enabled', enabled, 'configured', coalesce(api_key <> '', false))
      FROM public.cfdi_email_settings WHERE id = 1),
      jsonb_build_object('provider', 'resend', 'enabled', false, 'configured', false))
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.cfdi_email_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_email_status() TO authenticated;

-- Blank api key keeps the stored one, so other fields save without retyping it.
CREATE OR REPLACE FUNCTION public.set_cfdi_email(p_provider text, p_api_key text, p_from text, p_reply_to text,
  p_business_name text, p_link_template text, p_hook_url text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_provider NOT IN ('resend') THEN RAISE EXCEPTION 'invalid_provider'; END IF;
  IF p_hook_url IS NOT NULL AND p_hook_url !~ '^https://[^/]+/functions/v1/cfdi-email$' THEN RAISE EXCEPTION 'invalid_hook_url'; END IF;
  IF p_link_template IS NOT NULL AND p_link_template !~ '^https?://' THEN RAISE EXCEPTION 'invalid_link'; END IF;
  INSERT INTO public.cfdi_email_settings (id, provider, api_key, from_address, reply_to, business_name, link_template, hook_url, enabled, updated_at)
  VALUES (1, p_provider, nullif(trim(p_api_key), ''), nullif(trim(p_from), ''), nullif(trim(p_reply_to), ''),
    nullif(trim(p_business_name), ''), p_link_template, p_hook_url, p_enabled, now())
  ON CONFLICT (id) DO UPDATE SET
    provider = p_provider,
    api_key = coalesce(nullif(trim(p_api_key), ''), public.cfdi_email_settings.api_key),
    from_address = nullif(trim(p_from), ''), reply_to = nullif(trim(p_reply_to), ''),
    business_name = nullif(trim(p_business_name), ''), link_template = p_link_template,
    hook_url = p_hook_url, enabled = p_enabled, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.set_cfdi_email(text, text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_cfdi_email(text, text, text, text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_cfdi_issued()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NEW.cfdi_status = 'issued' AND OLD.cfdi_status IS DISTINCT FROM 'issued' THEN
    SELECT hook_url, hook_secret INTO v_url, v_secret FROM public.cfdi_email_settings WHERE id = 1 AND enabled;
    IF v_url IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(url := v_url, body := jsonb_build_object('sale_id', NEW.id, 'secret', v_secret),
          headers := '{"Content-Type": "application/json"}'::jsonb);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_cfdi_issued() FROM PUBLIC;
DROP TRIGGER IF EXISTS sales_cfdi_email ON public.sales;
CREATE TRIGGER sales_cfdi_email AFTER UPDATE OF cfdi_status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.notify_cfdi_issued();
