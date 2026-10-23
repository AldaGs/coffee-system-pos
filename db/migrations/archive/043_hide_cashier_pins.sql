-- Take cashier_pins out of reach entirely (schema 1.6, step 5).
--
-- WHY
-- The table holds one bcrypt hash per cashier, and a cashier PIN is four
-- digits. Ten thousand candidates is seconds of offline work once the hash is
-- in hand, whatever the cost factor -- so the hash is nearly as good as the
-- PIN itself. Until now every signed-in account could SELECT the whole table
-- (and before migration 042, so could every account that merely existed).
--
-- WHAT THIS DOES
-- Removes the last policy on the table and revokes the table privileges.
-- Postgres denies everything on an RLS-enabled table with no policy, and with
-- no GRANT there is nothing to deny in the first place -- belt and braces, for
-- the same reason as migration 040.
--
-- Nothing in the app reads this table directly: PINs go in through
-- set_cashier_pin, out through delete_cashier_pin, and are checked by
-- verify_pin -- all SECURITY DEFINER, so they keep working as the function
-- owner. Confirmed by grep across src/ and api/ before writing this.
--
-- No replacement read RPC is added. The admin UI never asks "which cashiers
-- have a PIN", so exposing that would be new surface for no caller.

DROP POLICY IF EXISTS "Hardware can access cashier_pins" ON public.cashier_pins;
DROP POLICY IF EXISTS "cashier_pins_app_users_rw"        ON public.cashier_pins;

ALTER TABLE public.cashier_pins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cashier_pins FROM anon, authenticated;
