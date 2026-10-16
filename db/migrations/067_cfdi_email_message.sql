-- 5.4: customizable CFDI email text. email_message / email_footer are plain
-- text with placeholders ({cliente}, {negocio}, {folio}, {rfc}, {ticket}); the
-- cfdi-email function keeps the folio, button and ZIP note around them.
-- NULL = the built-in default text.
ALTER TABLE public.cfdi_email_settings ADD COLUMN IF NOT EXISTS email_message text;
ALTER TABLE public.cfdi_email_settings ADD COLUMN IF NOT EXISTS email_footer text;

CREATE OR REPLACE FUNCTION public.cfdi_email_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_app_user((select auth.uid()))
    THEN coalesce((SELECT jsonb_build_object(
      'provider', provider, 'from_address', from_address, 'reply_to', reply_to,
      'email_message', email_message, 'email_footer', email_footer,
      'enabled', enabled, 'configured', coalesce(api_key <> '', false))
      FROM public.cfdi_email_settings WHERE id = 1),
      jsonb_build_object('provider', 'resend', 'enabled', false, 'configured', false))
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.cfdi_email_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_email_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_cfdi_email_message(p_message text, p_footer text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.cfdi_email_settings SET
    email_message = left(nullif(trim(p_message), ''), 2000),
    email_footer = left(nullif(trim(p_footer), ''), 500),
    updated_at = now()
  WHERE id = 1;
END $$;
REVOKE ALL ON FUNCTION public.set_cfdi_email_message(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_cfdi_email_message(text, text) TO authenticated;
