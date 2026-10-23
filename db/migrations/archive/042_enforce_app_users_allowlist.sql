-- Enforce the app_users allowlist in the database (schema 1.6, step 4).
--
-- WHY
-- Every POS table carried a policy of the shape
--     FOR ALL TO authenticated USING (true) WITH CHECK (true)
-- (or the equivalent auth.role() = 'authenticated'), so ANY account that can
-- sign in to the Supabase project could read and write every table: sales,
-- expenses, payroll-adjacent vendor payouts, customers, the menu, the lot
-- ledger. The app_users allowlist that is supposed to gate this was only ever
-- checked client-side, in App.jsx after sign-in -- a check that a REST call
-- with a valid JWT never goes near. The only thing standing between a stranger
-- and the whole database was whether the project happened to have public
-- sign-ups disabled, which the setup flow never turned off and which Supabase
-- leaves ON by default.
--
-- WHAT THIS DOES
-- Replaces those blanket policies with is_app_user(auth.uid()): the same
-- allowlist, enforced where it cannot be bypassed. A signed-in account that is
-- not on the list (or is disabled) now sees nothing.
--
-- SAFE TO APPLY: checked on the live project first -- 3 auth users, 3 linked
-- app_users rows, 0 accounts that would lose access.
--
-- SCOPE: only tables this repo creates. The book_* tables (tinybooks), the
-- logistics and fulfillment tables (tinykds / tinylogistics) and the
-- notification/push/calendar tables are left alone -- they have the same
-- blanket-authenticated shape and need the same fix in their own repos.

-- The allowlist predicate. is_app_admin already shipped with install.js;
-- is_app_user did not (it exists on the live project but was never in the
-- install script), so define it here and keep both in one place.
-- SECURITY DEFINER so the policies below can consult app_users without the
-- caller needing to read that table -- and STABLE so the planner calls it
-- once per statement rather than once per row.
CREATE OR REPLACE FUNCTION public.is_app_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE auth_user_id = p_user_id
      AND disabled_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_app_user(uuid) FROM PUBLIC, anon;
-- Policies call it as the querying role, so authenticated MUST keep EXECUTE.
GRANT EXECUTE ON FUNCTION public.is_app_user(uuid) TO authenticated;

DO $do$
DECLARE
  r record;
  t text;
  -- Tables owned by this repo. Each gets exactly one policy: full access for
  -- an account on the allowlist, nothing for anyone else.
  v_tables text[] := ARRAY[
    'active_tickets', 'activity_logs', 'cashier_pins', 'customers', 'expenses',
    'floor_plan', 'inventory', 'inventory_deductions_applied', 'inventory_logs',
    'inventory_lots', 'lot_consumptions', 'menu_categories',
    'menu_discount_rules', 'menu_item_modifier_groups', 'menu_items',
    'menu_modifier_groups', 'menu_modifier_options', 'menu_schedules',
    'menu_versions', 'menus', 'recipes', 'sales', 'shop_settings',
    'tip_events', 'tip_payouts', 'vendor_payouts', 'vendors',
    'fiscal_profiles', 'cfdi_global_periods'
  ];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Drop whatever is on the table today. Every policy on these tables is
    -- this repo's own (the anon ones went in migration 040), and the names
    -- have drifted across versions -- "Hardware can access x", "x auth all",
    -- "Enable all for authenticated users", "Authenticated can access x" --
    -- so match by table, not by name.
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.is_app_user(auth.uid())) '
      'WITH CHECK (public.is_app_user(auth.uid()))',
      t || '_app_users_rw', t);
  END LOOP;
END
$do$;

-- schema_meta stays read-only for clients: the version banner reads it, and
-- only the install script (service role, which bypasses RLS) writes it.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='schema_meta') THEN
    DROP POLICY IF EXISTS "Authenticated can read schema_meta" ON public.schema_meta;
    DROP POLICY IF EXISTS "schema_meta_app_users_read" ON public.schema_meta;
    CREATE POLICY "schema_meta_app_users_read" ON public.schema_meta
      FOR SELECT TO authenticated USING (public.is_app_user(auth.uid()));
  END IF;
END
$do$;
