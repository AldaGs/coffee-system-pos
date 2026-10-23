-- Pin search_path on the functions that still lack it (schema 1.6, step 8).
--
-- WHY
-- A SECURITY DEFINER function without a pinned search_path resolves unqualified
-- names using the CALLER's search_path. Anyone who can create objects in a
-- schema that lands earlier on that path can shadow a table or an operator the
-- function relies on and have their version run with the definer's privileges.
-- Supabase's own advisor flags every one of these.
--
-- Most of this app's functions already pin it. These were the stragglers:
-- award_loyalty_visits, deduct_inventory (both legacy overloads),
-- deduct_inventory_log, restock_inventory_log and schedule_matches.
-- (verify_pin got its own in migration 044.)
--
-- ALTER FUNCTION rather than CREATE OR REPLACE: the bodies do not change, so
-- there is no reason to restate them here and risk drift between this file and
-- install.js. It also leaves the grants from migration 041 alone -- CREATE OR
-- REPLACE would reset them.
--
-- `extensions` is included because Supabase installs pgcrypto there; it costs
-- nothing for the functions that do not use it, and prevents the next function
-- that reaches for crypt() from failing mysteriously.
--
-- SCOPE: only this repo's functions. The advisor also flags several belonging
-- to the sibling apps sharing this project -- check_requires_logistics,
-- create_fulfillment_ticket, create_fulfillment_from_active_ticket,
-- gen_tracking_token, verify_admin_pin, provision_schema,
-- google_calendar_resync_all, trigger_google_calendar_sync -- which are left
-- for their own repos.

DO $do$
DECLARE
  r record;
  v_owned text[] := ARRAY[
    'award_loyalty_visits', 'build_menu_snapshot', 'cfdi_lookup_ticket',
    'cfdi_request_invoice', 'cfdi_resolve_ticket', 'claim_or_bootstrap_app_user',
    'deduct_inventory', 'deduct_inventory_log', 'delete_cashier_pin',
    'get_active_menu', 'get_menu_by_id', 'get_public_menu', 'is_app_admin',
    'is_app_user', 'menu_item_available', 'prune_menu_versions',
    'rate_limit_clear', 'rate_limit_hit', 'rate_limit_retry_after',
    'restock_inventory_log', 'restore_menu_version', 'schedule_matches',
    'set_cashier_pin', 'shop_timezone', 'snapshot_menu', 'verify_pin',
    'verify_pin_status'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (v_owned)
      -- Only the ones missing it; the rest already pin their own path and
      -- some of them deliberately differ (public, extensions).
      AND (p.proconfig IS NULL
           OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.sig);
  END LOOP;
END
$do$;
