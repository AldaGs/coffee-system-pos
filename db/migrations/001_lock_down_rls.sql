-- Migration 001: Lock down RLS policies from `public` to `authenticated`
--
-- Why:
--   Earlier installs created RLS policies as `TO public USING (true)`, which meant
--   the (intentionally public) Supabase anon key alone was enough to read every
--   table, including the plaintext cashier PINs stored in `shop_settings.menu_data`.
--   Devices must now complete the email/password sign-in gate (App.jsx) before
--   the REST API will return any data.
--
-- Apply once per Supabase project, in the SQL Editor:
--   1. Make sure at least one Auth user exists (Authentication → Users → Add user).
--   2. Run this script.
--   3. Sign every device in via the Device Authorization screen on next boot.
--
-- Safe to re-run: each policy is dropped before being re-created.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'active_tickets',
    'customers',
    'expenses',
    'inventory',
    'inventory_logs',
    'recipes',
    'sales',
    'shop_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Hardware can access %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Hardware can access %1$s" ON public.%1$I '
      'FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
