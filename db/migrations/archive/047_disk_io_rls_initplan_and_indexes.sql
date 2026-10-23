-- Cut Disk IO: index the hot paths and stop re-evaluating auth.* per row.
--
-- WHY
-- Supabase sent a "running out of Disk IO Budget" warning for this project.
-- The dominant cost was the `send-delivery-reminders` pg_cron job firing every
-- minute (176k runs, each writing a cron.job_run_details row, a pg_net request
-- row and a pg_net response row). That schedule is now */15, which is a
-- dashboard-side change and not something this file can carry.
--
-- What this file fixes is the database-side half the linter flagged:
--
--   1. The reminder function's own query full-scans order_fulfillment on every
--      run -- 152,640 sequential scans reading 13.4M tuples off a 116-row
--      table. It filters on delivery_date, which has no index.
--   2. Six foreign keys have no covering index. Harmless at today's row counts,
--      a table scan per cascade check once they grow.
--   3. Fifty-three RLS policies call auth.uid() / auth.role() bare, so Postgres
--      re-evaluates the function once PER ROW instead of hoisting it into an
--      InitPlan. Wrapping the call as (select auth.uid()) makes it a one-time
--      scalar. Same semantics, same rows returned -- only the plan changes.
--
-- Most of the policies in (3) are created by the allowlist loop from migration
-- 042, so that loop's template is fixed at the source (here, and in the two
-- embedded copies in api/install.js and src/components/SetupScreen.jsx). The
-- logistics, notification and Google-Calendar policies were never in the repo's
-- schemaQuery -- they only ever existed in the live database -- so they are
-- restated in full below, which also brings them under version control.

-- ---------------------------------------------------------------------------
-- 1. Indexes for the hot query and the unindexed foreign keys
-- ---------------------------------------------------------------------------

-- The reminder sweep asks for a delivery_date window and nothing else. Partial,
-- because rows with no delivery date are never in the result and there is no
-- reason to carry them in the index.
CREATE INDEX IF NOT EXISTS idx_order_fulfillment_delivery_date
  ON public.order_fulfillment (delivery_date)
  WHERE delivery_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_active_tickets_fiscal_profile
  ON public.active_tickets (fiscal_profile_id);

CREATE INDEX IF NOT EXISTS idx_sales_fiscal_profile
  ON public.sales (fiscal_profile_id);

CREATE INDEX IF NOT EXISTS idx_book_bills_po
  ON public.book_bills (po_id);

CREATE INDEX IF NOT EXISTS idx_google_calendar_config_connected_by
  ON public.google_calendar_config (connected_by);

CREATE INDEX IF NOT EXISTS idx_menu_item_modifier_groups_group
  ON public.menu_item_modifier_groups (group_id);

CREATE INDEX IF NOT EXISTS idx_order_fulfillment_last_moved_by
  ON public.order_fulfillment (last_moved_by);

-- ---------------------------------------------------------------------------
-- 2. InitPlan fix for the allowlist policies (migration 042's loop)
-- ---------------------------------------------------------------------------
-- Identical to 042 apart from the (select ...) wrapper. Re-running it is safe:
-- it drops whatever policy is on each table first, exactly as 042 does.

DO $do$
DECLARE
  r record;
  t text;
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

    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.is_app_user((select auth.uid()))) '
      'WITH CHECK (public.is_app_user((select auth.uid())))',
      t || '_app_users_rw', t);
  END LOOP;
END
$do$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='schema_meta') THEN
    -- "Authenticated can read schema_meta" is a pre-042 leftover that still
    -- exists on some installs. Two permissive SELECT policies on one table
    -- means both get evaluated on every read, so drop it rather than leave it.
    DROP POLICY IF EXISTS "Authenticated can read schema_meta" ON public.schema_meta;
    DROP POLICY IF EXISTS "schema_meta_app_users_read" ON public.schema_meta;
    CREATE POLICY "schema_meta_app_users_read" ON public.schema_meta
      FOR SELECT TO authenticated USING (public.is_app_user((select auth.uid())));
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 3. InitPlan fix for app_users
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read own row" ON public.app_users;
DROP POLICY IF EXISTS "Admins can read all"    ON public.app_users;
DROP POLICY IF EXISTS "Admins can insert"      ON public.app_users;
DROP POLICY IF EXISTS "Admins can update"      ON public.app_users;
DROP POLICY IF EXISTS "Admins can delete"      ON public.app_users;

-- Admins are app_users too, so "Admins can read all" already covers every row
-- "Users can read own row" would return. Folding them into one policy removes
-- the multiple-permissive-policies penalty on the busiest SELECT in the app
-- (app_users is read 24k times via index).
CREATE POLICY "app_users_select" ON public.app_users
  FOR SELECT TO authenticated
  USING (
    auth_user_id = (select auth.uid())
    OR public.is_app_admin((select auth.uid()))
  );

CREATE POLICY "Admins can insert" ON public.app_users
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin((select auth.uid())));

CREATE POLICY "Admins can update" ON public.app_users
  FOR UPDATE TO authenticated
  USING (public.is_app_admin((select auth.uid())))
  WITH CHECK (public.is_app_admin((select auth.uid())));

CREATE POLICY "Admins can delete" ON public.app_users
  FOR DELETE TO authenticated USING (public.is_app_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- 4. InitPlan fix for the logistics / notification / calendar policies
-- ---------------------------------------------------------------------------
-- These were created directly against the live database and have no entry in
-- schemaQuery. Restated verbatim apart from the (select ...) wrapper.

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='order_fulfillment') THEN
    DROP POLICY IF EXISTS "auth read fulfillment"   ON public.order_fulfillment;
    DROP POLICY IF EXISTS "auth insert fulfillment" ON public.order_fulfillment;
    DROP POLICY IF EXISTS "auth update fulfillment" ON public.order_fulfillment;

    CREATE POLICY "auth read fulfillment" ON public.order_fulfillment
      FOR SELECT TO authenticated USING (public.is_app_user((select auth.uid())));
    CREATE POLICY "auth insert fulfillment" ON public.order_fulfillment
      FOR INSERT TO authenticated WITH CHECK (public.is_app_user((select auth.uid())));
    CREATE POLICY "auth update fulfillment" ON public.order_fulfillment
      FOR UPDATE TO authenticated
      USING (public.is_app_user((select auth.uid())))
      WITH CHECK (public.is_app_user((select auth.uid())));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='logistics_settings') THEN
    DROP POLICY IF EXISTS "auth read settings"   ON public.logistics_settings;
    DROP POLICY IF EXISTS "auth insert settings" ON public.logistics_settings;
    DROP POLICY IF EXISTS "auth update settings" ON public.logistics_settings;

    CREATE POLICY "auth read settings" ON public.logistics_settings
      FOR SELECT TO authenticated USING (public.is_app_user((select auth.uid())));
    CREATE POLICY "auth insert settings" ON public.logistics_settings
      FOR INSERT TO authenticated WITH CHECK (public.is_app_admin((select auth.uid())));
    CREATE POLICY "auth update settings" ON public.logistics_settings
      FOR UPDATE TO authenticated
      USING (public.is_app_admin((select auth.uid())))
      WITH CHECK (public.is_app_admin((select auth.uid())));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='employees_logistics') THEN
    DROP POLICY IF EXISTS "auth read employees"    ON public.employees_logistics;
    DROP POLICY IF EXISTS "auth insert employees"  ON public.employees_logistics;
    DROP POLICY IF EXISTS "auth update employees"  ON public.employees_logistics;
    DROP POLICY IF EXISTS "admin delete employees" ON public.employees_logistics;

    CREATE POLICY "auth read employees" ON public.employees_logistics
      FOR SELECT TO authenticated USING (public.is_app_user((select auth.uid())));
    CREATE POLICY "auth insert employees" ON public.employees_logistics
      FOR INSERT TO authenticated WITH CHECK (public.is_app_user((select auth.uid())));
    CREATE POLICY "auth update employees" ON public.employees_logistics
      FOR UPDATE TO authenticated
      USING (public.is_app_user((select auth.uid())))
      WITH CHECK (public.is_app_user((select auth.uid())));
    CREATE POLICY "admin delete employees" ON public.employees_logistics
      FOR DELETE TO authenticated USING (public.is_app_admin((select auth.uid())));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='push_subscriptions') THEN
    DROP POLICY IF EXISTS "own subs read"   ON public.push_subscriptions;
    DROP POLICY IF EXISTS "own subs insert" ON public.push_subscriptions;
    DROP POLICY IF EXISTS "own subs update" ON public.push_subscriptions;
    DROP POLICY IF EXISTS "own subs delete" ON public.push_subscriptions;

    CREATE POLICY "own subs read" ON public.push_subscriptions
      FOR SELECT USING ((select auth.uid()) = user_id);
    CREATE POLICY "own subs insert" ON public.push_subscriptions
      FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
    CREATE POLICY "own subs update" ON public.push_subscriptions
      FOR UPDATE USING ((select auth.uid()) = user_id);
    CREATE POLICY "own subs delete" ON public.push_subscriptions
      FOR DELETE USING ((select auth.uid()) = user_id);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='notification_settings') THEN
    DROP POLICY IF EXISTS "own settings read"   ON public.notification_settings;
    DROP POLICY IF EXISTS "own settings upsert" ON public.notification_settings;
    DROP POLICY IF EXISTS "own settings update" ON public.notification_settings;

    CREATE POLICY "own settings read" ON public.notification_settings
      FOR SELECT USING ((select auth.uid()) = user_id);
    CREATE POLICY "own settings upsert" ON public.notification_settings
      FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
    CREATE POLICY "own settings update" ON public.notification_settings
      FOR UPDATE USING ((select auth.uid()) = user_id);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='google_calendar_config') THEN
    -- Was two policies -- one SELECT, one ALL -- both with the same admin
    -- check, so every read evaluated the subquery twice. The ALL policy already
    -- covers SELECT; the read-only one is redundant.
    --
    -- The inline EXISTS is swapped for is_app_admin(), which is the same check
    -- plus disabled_at IS NULL. That is a deliberate tightening: a
    -- deactivated admin could still read and write the Google Calendar
    -- credentials under the old expression.
    DROP POLICY IF EXISTS "admin read google config"  ON public.google_calendar_config;
    DROP POLICY IF EXISTS "admin write google config" ON public.google_calendar_config;

    CREATE POLICY "admin write google config" ON public.google_calendar_config
      FOR ALL
      USING (public.is_app_admin((select auth.uid())))
      WITH CHECK (public.is_app_admin((select auth.uid())));
  END IF;
END
$do$;
