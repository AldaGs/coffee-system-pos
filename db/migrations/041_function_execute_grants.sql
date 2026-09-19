-- Lock down EXECUTE on this app's functions (schema 1.6, step 3).
--
-- WHY THE EXISTING REVOKES DIDN'T WORK
-- install.js already carries lines like
--     REVOKE ALL ON FUNCTION public.restore_menu_version(bigint) FROM PUBLIC;
-- and they do nothing useful, because Supabase ALSO grants EXECUTE to `anon`
-- and `authenticated` directly on every function in `public` (a default
-- privilege on the schema). Revoking from PUBLIC leaves that direct grant
-- untouched. Checked on the live project: all 32 functions in `public` were
-- executable by anon -- the key printed inside every receipt QR code.
--
-- That meant an unauthenticated caller could, among other things:
--   set_cashier_pin / delete_cashier_pin  -- overwrite or wipe any cashier PIN
--   verify_pin                            -- guess 4-digit PINs, unlimited
--   deduct_inventory_log / restock_inventory_log -- move stock
--   restore_menu_version / snapshot_menu  -- roll the live menu back
--   award_loyalty_visits                  -- hand out loyalty visits
--
-- WHAT THIS DOES
-- Revokes EXECUTE from PUBLIC, anon and authenticated on every function this
-- app owns, then grants back exactly what each role needs:
--
--   anon          the public menu (get_active_menu, get_menu_by_id,
--                 get_public_menu, menu_item_available, shop_timezone) and
--                 the two CFDI portal entry points from migration 039
--   authenticated everything the signed-in POS actually calls
--
-- cfdi_resolve_ticket is granted to nobody: it is an internal helper, reached
-- only from inside the two SECURITY DEFINER functions that call it.
--
-- is_app_admin and is_app_user MUST stay granted to authenticated: RLS
-- policies call them, and a policy's function runs as the querying role, not
-- as the policy's owner. Revoking those would lock every signed-in user out
-- of app_users (and, after step 4, out of every table).
--
-- SCOPE: this project is shared with sibling apps (kitchen display, delivery
-- tracking, calendar sync). Their functions -- get_tracking,
-- get_tracking_private, set_tracking_pin, gen_tracking_token,
-- create_fulfillment_ticket, create_fulfillment_from_active_ticket,
-- check_requires_logistics, verify_admin_pin, google_calendar_resync_all,
-- trigger_google_calendar_sync, provision_schema -- are deliberately NOT
-- touched here: this repo does not know which of them their own public pages
-- call, and a blanket revoke would break those apps silently. They carry the
-- same exposure (provision_schema and set_tracking_pin in particular are
-- callable by anyone today) and need the same treatment in their own repos.

DO $do$
DECLARE
  r record;
  -- Functions this repo creates. Matched by name, so every overload is
  -- covered (deduct_inventory ships in two legacy signatures), and missing
  -- ones are simply skipped -- a fresh install has no legacy overloads.
  v_owned text[] := ARRAY[
    'award_loyalty_visits', 'build_menu_snapshot', 'cfdi_lookup_ticket',
    'cfdi_request_invoice', 'cfdi_resolve_ticket', 'claim_or_bootstrap_app_user',
    'deduct_inventory', 'deduct_inventory_log', 'delete_cashier_pin',
    'get_active_menu', 'get_menu_by_id', 'get_public_menu', 'is_app_admin',
    'is_app_user', 'menu_item_available', 'prune_menu_versions',
    'restock_inventory_log', 'restore_menu_version', 'schedule_matches',
    'set_cashier_pin', 'shop_timezone', 'snapshot_menu', 'verify_pin'
  ];
  -- Reachable without signing in (public menu + CFDI portal).
  v_anon text[] := ARRAY[
    'get_active_menu', 'get_menu_by_id', 'get_public_menu',
    'menu_item_available', 'shop_timezone',
    'cfdi_lookup_ticket', 'cfdi_request_invoice'
  ];
  -- Reachable by a signed-in POS client. Everything owned except the internal
  -- resolver and schedule_matches, which is only called from inside
  -- get_active_menu (SECURITY DEFINER, so it runs as the owner).
  v_auth text[] := ARRAY[
    'award_loyalty_visits', 'build_menu_snapshot', 'cfdi_lookup_ticket',
    'cfdi_request_invoice', 'claim_or_bootstrap_app_user', 'deduct_inventory',
    'deduct_inventory_log', 'delete_cashier_pin', 'get_active_menu',
    'get_menu_by_id', 'get_public_menu', 'is_app_admin', 'is_app_user',
    'menu_item_available', 'prune_menu_versions', 'restock_inventory_log',
    'restore_menu_version', 'set_cashier_pin', 'shop_timezone',
    'snapshot_menu', 'verify_pin'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (v_owned)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    IF r.proname = ANY (v_anon) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    END IF;
    IF r.proname = ANY (v_auth) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END
$do$;

-- Stop the bleeding at the source: without this, the next function anyone adds
-- to `public` is executable by anon the moment it is created, and we are back
-- to auditing 32 functions by hand. Applies only to functions created AFTER
-- this runs, by the role that runs it (the same role the install script and
-- every migration here use), so existing sibling-app functions are unaffected
-- -- but a sibling app that later adds a public function must GRANT EXECUTE
-- to anon explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Defence in depth on the two PIN-management functions: a grant is one
-- ALTER DEFAULT PRIVILEGES away from being handed back by accident, so the
-- functions check for themselves. Bodies are otherwise unchanged from
-- install.js. Every account on this project is role='admin'; a device account
-- has never managed cashier PINs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_cashier_pin(p_cashier_id BIGINT, p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'set_cashier_pin: admin privileges required';
  END IF;
  IF p_pin IS NULL OR length(p_pin) = 0 THEN
    RAISE EXCEPTION 'PIN cannot be empty';
  END IF;
  INSERT INTO public.cashier_pins (cashier_id, pin_hash)
  VALUES (p_cashier_id, crypt(p_pin, gen_salt('bf')))
  ON CONFLICT (cashier_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_cashier_pin(p_cashier_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'delete_cashier_pin: admin privileges required';
  END IF;
  DELETE FROM public.cashier_pins WHERE cashier_id = p_cashier_id;
END;
$$;

-- CREATE OR REPLACE resets the two functions' privileges to the schema
-- default, so re-apply their grants after redefining them.
REVOKE ALL ON FUNCTION public.set_cashier_pin(bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_cashier_pin(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_cashier_pin(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cashier_pin(bigint) TO authenticated;
