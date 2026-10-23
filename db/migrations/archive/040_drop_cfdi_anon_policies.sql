-- Close the anon key's direct table access (schema 1.6, step 2).
--
-- Step 1 (migration 039) gave the public CFDI portal cfdi_lookup_ticket and
-- cfdi_request_invoice. With the portal on those RPCs, the blanket anon
-- policies from migrations 031/033 have no caller left, and every one of them
-- was a hole: the anon key is printed inside the QR code on every receipt, so
-- "anon can SELECT sales USING (true)" meant anyone holding a receipt could
-- read the whole sales history (totals, cashier names, loyalty phone numbers),
-- UPDATE any column of any sale, and read or rewrite every customer's fiscal
-- data — RFC, razón social, email: personal data under the LFPDPPP.
--
-- Two of the fiscal_profiles policies were written without TO anon, so they
-- applied to PUBLIC (every role). Dropping them costs the POS nothing: the
-- "Enable all for authenticated users" policy on that table is untouched.
--
-- ORDER MATTERS: this must not reach a project whose deployed frontend still
-- queries these tables with the anon key, or the portal dies for customers
-- mid-deploy. It ships in the same 1.6 release as the RPCs and the rewritten
-- PublicCFDI.jsx.

-- Sales: the portal's read + "set cfdi_status" write.
DROP POLICY IF EXISTS "CFDI portal can read sales" ON public.sales;
DROP POLICY IF EXISTS "CFDI portal can update cfdi on sales" ON public.sales;

-- Active tickets: the portal's "is this ticket still open?" read.
DROP POLICY IF EXISTS "CFDI portal can read active_tickets" ON public.active_tickets;

-- Fiscal profiles: lookup by RFC, insert, and refresh of an existing RFC.
DROP POLICY IF EXISTS "CFDI portal can update fiscal_profiles" ON public.fiscal_profiles;
DROP POLICY IF EXISTS "Enable insert for anon" ON public.fiscal_profiles;
DROP POLICY IF EXISTS "Enable select for anon by rfc or id" ON public.fiscal_profiles;

-- Global periods: the "already in the Factura Global" legend, now returned by
-- cfdi_lookup_ticket.
DROP POLICY IF EXISTS "CFDI portal can read global periods" ON public.cfdi_global_periods;

-- Policies are only half of it. Supabase grants anon table privileges up front,
-- and RLS then decides which rows those privileges reach — so leaving the GRANT
-- in place would keep the door on its hinges for any future policy that says
-- USING (true) by accident. The portal needs no table privilege at all: its two
-- functions are SECURITY DEFINER and run as their owner.
REVOKE ALL ON TABLE public.sales               FROM anon;
REVOKE ALL ON TABLE public.active_tickets      FROM anon;
REVOKE ALL ON TABLE public.fiscal_profiles     FROM anon;
REVOKE ALL ON TABLE public.cfdi_global_periods FROM anon;

-- NOTE (not fixed here): order_fulfillment carries "KDS anon read" and
-- "KDS anon update" policies, both USING (true). They are not created by this
-- repo's install script — they belong to the kitchen-display app sharing this
-- project — so removing them here would break that app. Same exposure, same
-- anon key; it needs the same RPC treatment on the KDS side.
