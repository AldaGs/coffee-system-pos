-- CFDI portal RPCs (schema 1.6, step 1 of the security lockdown).
--
-- WHY
-- Migrations 031/033 gave the `anon` role blanket RLS policies so the public
-- CFDI portal (PublicCFDI.jsx, opened from the QR code printed on every
-- receipt) could find a ticket and record a factura request:
--
--   sales                 SELECT + UPDATE  USING (true)
--   active_tickets        SELECT           USING (true)
--   fiscal_profiles       SELECT + INSERT + UPDATE  USING (true)
--   cfdi_global_periods   SELECT           USING (true)
--
-- The anon key is public by design (it ships inside the receipt QR and the
-- menu link), so those policies let anyone who has seen one receipt read the
-- whole sales history — totals, cashier names, loyalty phone numbers — read
-- and rewrite every customer's fiscal data (RFC, razón social, email: personal
-- data under the LFPDPPP), and UPDATE any column of any sale.
--
-- WHAT THIS DOES
-- Replaces that direct table access with two SECURITY DEFINER functions that
-- are the portal's entire surface:
--
--   cfdi_lookup_ticket(p_ref)    -- one ticket, only the fields the page shows
--   cfdi_request_invoice(p_ref, ...) -- upsert the fiscal profile + flag ONE sale
--
-- Both require the caller to already hold the ticket reference from their own
-- receipt. Neither can enumerate, and cfdi_request_invoice writes exactly two
-- columns (fiscal_profile_id, cfdi_status) on exactly one row.
--
-- The anon table policies themselves are dropped in the next migration (040),
-- once the portal shipped here is live — dropping them first would break the
-- portal for customers mid-deploy.

-- ---------------------------------------------------------------------------
-- Base CFDI schema guards.
-- The full from-scratch script in api/install.js never carried the CFDI
-- tables (they only ever shipped as deltas 0.9/1.0), so a brand-new install
-- has no fiscal_profiles at all and the functions below would have nothing to
-- run against. These are the same idempotent statements as deltas 0.9/1.0,
-- minus the anon policies, so first installs and upgrades converge.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rfc text NOT NULL UNIQUE,
  razon_social text NOT NULL,
  regimen_fiscal text NOT NULL,
  uso_cfdi text NOT NULL,
  cp text NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.fiscal_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.fiscal_profiles;
CREATE POLICY "Enable all for authenticated users" ON public.fiscal_profiles
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cfdi_status text DEFAULT 'none' CHECK (cfdi_status IN ('none', 'requested', 'issued', 'reopened', 'canceled')),
  ADD COLUMN IF NOT EXISTS cfdi_folio text,
  ADD COLUMN IF NOT EXISTS fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id);

ALTER TABLE public.active_tickets
  ADD COLUMN IF NOT EXISTS cfdi_status text DEFAULT 'none' CHECK (cfdi_status IN ('none', 'requested', 'issued', 'reopened', 'canceled')),
  ADD COLUMN IF NOT EXISTS cfdi_folio text,
  ADD COLUMN IF NOT EXISTS fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id);

CREATE INDEX IF NOT EXISTS idx_sales_cfdi_status ON public.sales(cfdi_status) WHERE cfdi_status != 'none';
CREATE INDEX IF NOT EXISTS idx_active_tickets_cfdi_status ON public.active_tickets(cfdi_status) WHERE cfdi_status != 'none';

CREATE TABLE IF NOT EXISTS public.cfdi_global_periods (
  period text PRIMARY KEY,
  business_name text,
  summary jsonb,
  closed_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.cfdi_global_periods ADD COLUMN IF NOT EXISTS summary jsonb;
ALTER TABLE public.cfdi_global_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.cfdi_global_periods;
CREATE POLICY "Enable all for authenticated users" ON public.cfdi_global_periods
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Shared resolver: ticket reference -> the one row it names.
-- Mirrors the three lookups PublicCFDI.jsx used to do client-side:
--   1. a uuid  -> sales.local_id   (links from OrdersTab / PNG receipts)
--   2. any ref -> sales.ticket_id  (the original activeTicket.id, as text)
--   3. digits  -> active_tickets.id (ticket still open at the register)
-- Returns the sale id (bigint), whether it is a paid sale, and the row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cfdi_resolve_ticket(
  p_ref text,
  OUT o_id bigint,
  OUT o_is_paid boolean,
  OUT o_row jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_uuid boolean := p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  o_id := NULL; o_is_paid := NULL; o_row := NULL;
  IF p_ref IS NULL OR length(p_ref) = 0 THEN
    RETURN;
  END IF;

  IF v_is_uuid THEN
    SELECT s.id, true, to_jsonb(s) INTO o_id, o_is_paid, o_row
    FROM public.sales s WHERE s.local_id = p_ref::uuid LIMIT 1;
  END IF;

  IF o_id IS NULL THEN
    SELECT s.id, true, to_jsonb(s) INTO o_id, o_is_paid, o_row
    FROM public.sales s WHERE s.ticket_id = p_ref LIMIT 1;
  END IF;

  IF o_id IS NULL AND p_ref ~ '^[0-9]{1,18}$' THEN
    SELECT t.id, false, to_jsonb(t) INTO o_id, o_is_paid, o_row
    FROM public.active_tickets t WHERE t.id = p_ref::bigint LIMIT 1;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- cfdi_lookup_ticket — everything the portal needs, in one call.
--
-- Returns ONLY the fields PublicCFDI.jsx renders. Deliberately withheld from
-- the anon caller: cashier_name, loyalty_phone / loyalty_* columns, splits,
-- payment_method, refund columns, local_id, and every other sale in the table.
-- The fiscal profile comes back only as a prefill for the profile already
-- attached to this very ticket — there is no lookup by RFC any more.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cfdi_lookup_ticket(p_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_id bigint; v_is_paid boolean; v_row jsonb;
  v_profile jsonb := NULL;
  v_global jsonb := NULL;
  v_period text;
BEGIN
  SELECT o_id, o_is_paid, o_row INTO v_id, v_is_paid, v_row
  FROM public.cfdi_resolve_ticket(p_ref);

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF (v_row->>'fiscal_profile_id') IS NOT NULL THEN
    SELECT to_jsonb(f) - 'created_at' - 'updated_at' INTO v_profile
    FROM public.fiscal_profiles f
    WHERE f.id = (v_row->>'fiscal_profile_id')::uuid;
  END IF;

  -- Factura Global block. The period is derived in the SHOP's timezone; the
  -- page used to derive it from the visitor's browser clock, which disagreed
  -- for customers abroad on the first/last day of a month.
  IF v_is_paid AND (v_row->>'created_at') IS NOT NULL THEN
    v_period := to_char(
      ((v_row->>'created_at')::timestamptz AT TIME ZONE public.shop_timezone()), 'YYYY-MM');
    SELECT jsonb_build_object('period', g.period, 'business_name', g.business_name)
    INTO v_global
    FROM public.cfdi_global_periods g WHERE g.period = v_period;
  END IF;

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
      'total_amount',      v_row->'total_amount'
    ),
    'profile', v_profile,
    'global_period', v_global
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- cfdi_request_invoice — record a factura request for ONE ticket.
--
-- Enforces server-side what the page enforced client-side (and what the anon
-- UPDATE policy enforced not at all):
--   * the ref must resolve to a PAID sale (an open ticket can't be invoiced)
--   * its month must not already be closed into a Factura Global
--   * its cfdi_status must be 'none' or 'reopened' (a requested/issued/
--     canceled ticket is read-only to the customer)
--   * only fiscal_profile_id and cfdi_status are ever written
-- Returns { ok, cfdi_status, fiscal_profile_id } or { ok:false, reason }.
-- ---------------------------------------------------------------------------
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

  INSERT INTO public.fiscal_profiles (rfc, razon_social, regimen_fiscal, uso_cfdi, cp, email)
  VALUES (v_rfc, btrim(p_razon_social), btrim(p_regimen_fiscal), btrim(p_uso_cfdi),
          btrim(p_cp), btrim(p_email))
  ON CONFLICT (rfc) DO UPDATE SET
    razon_social   = EXCLUDED.razon_social,
    regimen_fiscal = EXCLUDED.regimen_fiscal,
    uso_cfdi       = EXCLUDED.uso_cfdi,
    cp             = EXCLUDED.cp,
    email          = EXCLUDED.email,
    updated_at     = now()
  RETURNING id INTO v_profile_id;

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

-- The portal is the only anon caller; the POS itself (authenticated) keeps its
-- direct table access. cfdi_resolve_ticket is an internal helper — the two
-- public entry points call it as their definer-owner, so anon needs no grant
-- on it. (Migration 041 revokes the implicit anon/authenticated grants that
-- Supabase adds to every new function; these explicit ones are what survive.)
REVOKE ALL ON FUNCTION public.cfdi_resolve_ticket(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cfdi_lookup_ticket(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cfdi_request_invoice(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_lookup_ticket(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cfdi_request_invoice(text, text, text, text, text, text, text) TO anon, authenticated;
