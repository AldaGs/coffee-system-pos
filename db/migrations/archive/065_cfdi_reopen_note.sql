-- 5.2: reopen note. When the owner reopens a CFDI request they can flag the
-- wrong fields and leave a message: {"fields": ["rfc", ...], "note": "..."}.
-- cfdi_lookup_ticket shows it to the customer only while status = 'reopened'.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cfdi_reopen_note jsonb;
ALTER TABLE public.active_tickets ADD COLUMN IF NOT EXISTS cfdi_reopen_note jsonb;

CREATE OR REPLACE FUNCTION public.cfdi_lookup_ticket(p_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint; v_is_paid boolean; v_row jsonb;
  v_profile jsonb := NULL;
  v_global jsonb := NULL;
  v_period text;
  v_zip boolean;
BEGIN
  SELECT o_id, o_is_paid, o_row INTO v_id, v_is_paid, v_row
  FROM public.cfdi_resolve_ticket(p_ref);

  IF v_id IS NULL THEN
    IF NOT public.rate_limit_hit('cfdi:miss', 30, interval '1 minute') THEN
      RETURN jsonb_build_object('found', false, 'rate_limited', true);
    END IF;
    RETURN jsonb_build_object('found', false);
  END IF;

  IF (v_row->>'fiscal_profile_id') IS NOT NULL THEN
    SELECT to_jsonb(f) - 'created_at' - 'updated_at' INTO v_profile
    FROM public.fiscal_profiles f
    WHERE f.id = (v_row->>'fiscal_profile_id')::uuid;
  END IF;

  IF v_is_paid AND (v_row->>'created_at') IS NOT NULL THEN
    v_period := to_char(
      ((v_row->>'created_at')::timestamptz AT TIME ZONE public.shop_timezone()), 'YYYY-MM');
    SELECT jsonb_build_object('period', g.period, 'business_name', g.business_name)
    INTO v_global
    FROM public.cfdi_global_periods g WHERE g.period = v_period;
  END IF;

  v_zip := v_row->>'cfdi_status' = 'issued' AND (v_row->>'cfdi_zip_path') IS NOT NULL
    AND (v_row->>'cfdi_zip_at')::timestamptz > now() - interval '90 days';

  RETURN jsonb_build_object(
    'found', true,
    'ticket', jsonb_build_object(
      'id',                v_id,
      'is_paid',           v_is_paid,
      'created_at',        v_row->>'created_at',
      'cfdi_status',       COALESCE(v_row->>'cfdi_status', 'none'),
      'cfdi_folio',        v_row->>'cfdi_folio',
      'fiscal_profile_id', v_row->>'fiscal_profile_id',
      'order_name',        v_row->>'order_name',
      'ticket_id',         v_row->>'ticket_id',
      'items',             COALESCE(v_row->'items', '[]'::jsonb),
      'total_amount',      v_row->'total_amount',
      'cfdi_zip_path',     CASE WHEN v_zip THEN v_row->>'cfdi_zip_path' END,
      'cfdi_zip_expires',  CASE WHEN v_zip THEN ((v_row->>'cfdi_zip_at')::timestamptz + interval '90 days') END,
      'cfdi_reopen_note',  CASE WHEN v_row->>'cfdi_status' = 'reopened' THEN v_row->'cfdi_reopen_note' END
    ),
    'profile', v_profile,
    'global_period', v_global
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cfdi_lookup_ticket(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_lookup_ticket(text) TO anon, authenticated;
