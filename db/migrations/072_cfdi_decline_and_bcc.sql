-- 5.9: staff can decline a CFDI request (cfdi_status 'declined'), and invoice
-- emails can BCC an extra address (e.g. the accountant) via cfdi_email_settings.bcc.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_cfdi_status_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_cfdi_status_check
  CHECK (cfdi_status IN ('none', 'requested', 'issued', 'reopened', 'canceled', 'declined'));
ALTER TABLE public.active_tickets DROP CONSTRAINT IF EXISTS active_tickets_cfdi_status_check;
ALTER TABLE public.active_tickets ADD CONSTRAINT active_tickets_cfdi_status_check
  CHECK (cfdi_status IN ('none', 'requested', 'issued', 'reopened', 'canceled', 'declined'));

-- Comma-separated list; NULL = no BCC. Only invoice emails use it, not tests.
ALTER TABLE public.cfdi_email_settings ADD COLUMN IF NOT EXISTS bcc text;

CREATE OR REPLACE FUNCTION public.cfdi_email_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_app_user((select auth.uid()))
    THEN coalesce((SELECT jsonb_build_object(
      'provider', provider, 'from_address', from_address, 'reply_to', reply_to, 'bcc', bcc,
      'email_message', email_message, 'email_footer', email_footer,
      'enabled', enabled, 'configured', coalesce(api_key <> '', false))
      FROM public.cfdi_email_settings WHERE id = 1),
      jsonb_build_object('provider', 'resend', 'enabled', false, 'configured', false))
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.cfdi_email_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_email_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_cfdi_email_bcc(p_bcc text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.cfdi_email_settings SET bcc = left(nullif(trim(p_bcc), ''), 500), updated_at = now()
  WHERE id = 1;
END $$;
REVOKE ALL ON FUNCTION public.set_cfdi_email_bcc(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_cfdi_email_bcc(text) TO authenticated;
