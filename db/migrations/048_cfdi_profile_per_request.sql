-- 048: one fiscal_profiles row per CFDI request.
-- cfdi_request_invoice used ON CONFLICT (rfc), so a second submission with an
-- existing RFC rewrote that shared profile for every ticket linked to it.
-- Drop the UNIQUE on rfc and give each request its own row.

ALTER TABLE public.fiscal_profiles DROP CONSTRAINT IF EXISTS fiscal_profiles_rfc_key;

CREATE OR REPLACE FUNCTION public.cfdi_request_invoice(
  p_ref text,
  p_rfc text,
  p_razon_social text,
  p_regimen_fiscal text,
  p_uso_cfdi text,
  p_cp text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint; v_is_paid boolean; v_row jsonb;
  v_status text; v_period text; v_closed boolean;
  v_rfc text := upper(btrim(COALESCE(p_rfc, '')));
  v_profile_id uuid;
BEGIN
  SELECT o_id, o_is_paid, o_row INTO v_id, v_is_paid, v_row
  FROM public.cfdi_resolve_ticket(p_ref);

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF NOT v_is_paid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_paid');
  END IF;

  v_status := COALESCE(v_row->>'cfdi_status', 'none');
  IF v_status NOT IN ('none', 'reopened') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_editable', 'cfdi_status', v_status);
  END IF;

  v_period := to_char(
    ((v_row->>'created_at')::timestamptz AT TIME ZONE public.shop_timezone()), 'YYYY-MM');
  SELECT EXISTS (SELECT 1 FROM public.cfdi_global_periods g WHERE g.period = v_period)
  INTO v_closed;
  -- A reopened request is an explicit admin override, so it survives the close.
  IF v_closed AND v_status = 'none' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'global_closed', 'period', v_period);
  END IF;

  -- Same validation the form does, enforced where it counts.
  IF v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A]$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_rfc');
  END IF;
  IF btrim(COALESCE(p_razon_social, '')) = ''
     OR btrim(COALESCE(p_regimen_fiscal, '')) = ''
     OR btrim(COALESCE(p_uso_cfdi, '')) = ''
     OR COALESCE(p_cp, '') !~ '^[0-9]{5}$'
     OR COALESCE(p_email, '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  END IF;

  -- One profile row per request: a shared row keyed by RFC let any submission
  -- rewrite the email/razon social of every other ticket linked to it. A
  -- reopened sale edits its own row; anything else gets a fresh one.
  v_profile_id := NULLIF(v_row->>'fiscal_profile_id', '')::uuid;
  IF v_profile_id IS NOT NULL THEN
    UPDATE public.fiscal_profiles
    SET rfc = v_rfc, razon_social = btrim(p_razon_social),
        regimen_fiscal = btrim(p_regimen_fiscal), uso_cfdi = btrim(p_uso_cfdi),
        cp = btrim(p_cp), email = btrim(p_email), updated_at = now()
    WHERE id = v_profile_id;
  END IF;
  IF v_profile_id IS NULL OR NOT FOUND THEN
    INSERT INTO public.fiscal_profiles (rfc, razon_social, regimen_fiscal, uso_cfdi, cp, email)
    VALUES (v_rfc, btrim(p_razon_social), btrim(p_regimen_fiscal), btrim(p_uso_cfdi),
            btrim(p_cp), btrim(p_email))
    RETURNING id INTO v_profile_id;
  END IF;

  UPDATE public.sales
  SET fiscal_profile_id = v_profile_id,
      cfdi_status = 'requested'
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cfdi_status', 'requested',
    'fiscal_profile_id', v_profile_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cfdi_request_invoice(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_request_invoice(text, text, text, text, text, text, text) TO anon, authenticated;
