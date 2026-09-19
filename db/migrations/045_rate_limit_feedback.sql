-- Tell the caller WHY it was refused, and for how long (schema 1.6, step 6b).
--
-- Migration 044 made the two guessable endpoints fail closed, but silently:
-- a locked-out cashier saw "wrong PIN" and kept trying a PIN that was right,
-- and the portal could say "too many queries" without saying for how long.
-- Silence is the wrong trade here. Knowing that a lockout is running, and
-- when it lifts, tells an attacker nothing they cannot measure by trying
-- again -- and it is the difference between a cashier waiting 90 seconds and
-- a cashier phoning the owner convinced the till is broken.

-- Seconds left in the current window for a key, or 0 when nothing is running.
CREATE OR REPLACE FUNCTION public.rate_limit_retry_after(p_key text, p_window interval)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT GREATEST(0, ceil(extract(epoch FROM (a.window_start + p_window - now()))))::integer
  FROM public.auth_attempts a
  WHERE a.key = p_key;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_retry_after(text, interval) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- verify_pin_status — same check as verify_pin, but it says what happened:
--   { ok: bool, locked: bool, retry_after: int }
-- `locked` is only ever true when the limiter refused the call, so a plain
-- wrong PIN still returns { ok:false, locked:false } and leaks nothing extra.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_pin_status(p_cashier_id BIGINT, p_pin TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
  v_key  text := 'pin:' || p_cashier_id::text;
  v_window constant interval := interval '15 minutes';
BEGIN
  IF NOT public.rate_limit_hit(v_key, 10, v_window) THEN
    RETURN jsonb_build_object(
      'ok', false, 'locked', true,
      'retry_after', public.rate_limit_retry_after(v_key, v_window));
  END IF;

  SELECT pin_hash INTO v_hash FROM public.cashier_pins WHERE cashier_id = p_cashier_id;

  IF v_hash IS NOT NULL AND v_hash = crypt(p_pin, v_hash) THEN
    PERFORM public.rate_limit_clear(v_key);
    RETURN jsonb_build_object('ok', true, 'locked', false, 'retry_after', 0);
  END IF;

  RETURN jsonb_build_object('ok', false, 'locked', false, 'retry_after', 0);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_pin_status(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pin_status(bigint, text) TO authenticated;

-- verify_pin stays a boolean, delegating to the same body, so an app version
-- that predates this migration keeps working unchanged -- and, importantly,
-- so one PIN entry is counted once no matter which of the two a client calls.
CREATE OR REPLACE FUNCTION public.verify_pin(p_cashier_id BIGINT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE((public.verify_pin_status(p_cashier_id, p_pin) ->> 'ok')::boolean, false);
$$;
REVOKE ALL ON FUNCTION public.verify_pin(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pin(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- cfdi_lookup_ticket: carry the same retry_after on a throttled miss, so the
-- portal can count down instead of guessing. Identical to migration 044
-- otherwise.
-- ---------------------------------------------------------------------------
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
  v_window constant interval := interval '1 minute';
BEGIN
  SELECT o_id, o_is_paid, o_row INTO v_id, v_is_paid, v_row
  FROM public.cfdi_resolve_ticket(p_ref);

  IF v_id IS NULL THEN
    IF NOT public.rate_limit_hit('cfdi:miss', 30, v_window) THEN
      RETURN jsonb_build_object(
        'found', false, 'rate_limited', true,
        'retry_after', public.rate_limit_retry_after('cfdi:miss', v_window));
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
REVOKE ALL ON FUNCTION public.cfdi_lookup_ticket(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_lookup_ticket(text) TO anon, authenticated;
