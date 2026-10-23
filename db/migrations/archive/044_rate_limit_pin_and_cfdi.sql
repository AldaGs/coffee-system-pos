-- Rate limiting for the two guessable endpoints (schema 1.6, step 6).
--
-- WHY
-- Two things stay guessable no matter who can call them:
--   * a cashier PIN is four digits -- 10,000 candidates, and verify_pin is a
--     direct oracle. Step 3 shut anon out of it, but a signed-in device (or
--     anyone with a device's session) could still walk the space in seconds.
--   * a CFDI ticket reference can be an active_tickets id, which is a
--     Date.now() millisecond value. Narrow, ordered, and guessable by anyone
--     who has seen one receipt -- and cfdi_lookup_ticket is public by design.
--
-- Supabase's free tier gives no request-level rate limiting, so this is a
-- counter in Postgres: free, and it cannot be bypassed by calling the RPC
-- from somewhere else, because the check lives inside the function.
--
-- WHAT COUNTS
-- verify_pin counts per cashier, and a correct PIN clears the counter, so
-- normal shift use never accumulates. cfdi_lookup_ticket counts MISSES only,
-- globally: a customer scanning their own receipt hits a real ticket and is
-- never counted, while enumeration is nothing but misses. That keeps the
-- limit off legitimate traffic without needing a client IP, which PostgREST
-- does not hand to Postgres anyway.

CREATE TABLE IF NOT EXISTS public.auth_attempts (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts     integer      NOT NULL DEFAULT 0
);

-- No policy and no grant: only the SECURITY DEFINER functions below touch it,
-- and they run as the owner. Same reasoning as cashier_pins in migration 043.
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_attempts FROM anon, authenticated;

-- Count one attempt against `p_key`. Returns true when the caller is still
-- under the limit, false once it is exhausted. The window is a fixed bucket
-- that resets on first use after it expires -- not a sliding window, which
-- would cost an index scan per call for no security gain at this scale.
--
-- The INSERT ... ON CONFLICT DO UPDATE is a single statement, so two
-- concurrent callers cannot both read a stale count: the second one blocks on
-- the row lock and sees the first one's increment.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key text, p_limit integer, p_window interval
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts integer;
BEGIN
  INSERT INTO public.auth_attempts (key, window_start, attempts)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    -- Expired bucket: start a fresh one. Live bucket: add to it.
    window_start = CASE WHEN public.auth_attempts.window_start < now() - p_window
                        THEN now() ELSE public.auth_attempts.window_start END,
    attempts     = CASE WHEN public.auth_attempts.window_start < now() - p_window
                        THEN 1 ELSE public.auth_attempts.attempts + 1 END
  RETURNING attempts INTO v_attempts;

  RETURN v_attempts <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, interval) FROM PUBLIC, anon, authenticated;

-- Clear a counter after a legitimate success.
CREATE OR REPLACE FUNCTION public.rate_limit_clear(p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_attempts WHERE key = p_key;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_clear(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- verify_pin: 10 wrong PINs per cashier per 15 minutes.
--
-- Generous for a real cashier fumbling at the register, useless for walking
-- 10,000 candidates. A correct PIN clears the counter. Over the limit the
-- function returns false -- the same answer as a wrong PIN, so it leaks
-- nothing about whether the account exists, and the client already renders it
-- as "wrong PIN" with no change needed.
--
-- Also adds the SET search_path this function never had (advisor warning).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_pin(p_cashier_id BIGINT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
  v_key  text := 'pin:' || p_cashier_id::text;
BEGIN
  IF NOT public.rate_limit_hit(v_key, 10, interval '15 minutes') THEN
    RETURN FALSE;
  END IF;

  SELECT pin_hash INTO v_hash FROM public.cashier_pins WHERE cashier_id = p_cashier_id;
  IF v_hash IS NULL THEN RETURN FALSE; END IF;

  IF v_hash = crypt(p_pin, v_hash) THEN
    PERFORM public.rate_limit_clear(v_key);
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_pin(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pin(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- cfdi_lookup_ticket: 30 MISSES per minute, project-wide.
--
-- Same body as migration 039 plus the counter. A real customer's scan resolves
-- and is never counted; sweeping Date.now() values produces nothing but
-- misses. At 30/minute, walking even one hour of millisecond timestamps would
-- take longer than the business will exist.
--
-- Rate-limited callers get the same {found:false} a bad reference gets, with
-- rate_limited:true alongside so the page can say "try again in a moment"
-- rather than "ticket not found" if it ever wants to.
--
-- NOTE: this function is no longer STABLE -- it writes the counter -- so it
-- must be called as an RPC, not from inside a read-only statement.
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
