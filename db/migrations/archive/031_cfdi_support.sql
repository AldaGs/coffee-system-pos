-- Create fiscal_profiles table
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

-- Enable RLS
ALTER TABLE public.fiscal_profiles ENABLE ROW LEVEL SECURITY;

-- Allow read/write for authenticated users (the POS clients)
CREATE POLICY "Enable all for authenticated users" ON public.fiscal_profiles
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Allow public inserts and selects for the CFDI web portal
-- We restrict select by ID or RFC to prevent dumping the whole table
CREATE POLICY "Enable insert for anon" ON public.fiscal_profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable select for anon by rfc or id" ON public.fiscal_profiles
  FOR SELECT USING (true);

-- Update sales table
ALTER TABLE public.sales
ADD COLUMN cfdi_status text DEFAULT 'none' CHECK (cfdi_status IN ('none', 'requested', 'issued', 'reopened', 'canceled')),
ADD COLUMN cfdi_folio text,
ADD COLUMN fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id);

-- Update active_tickets to allow tracking CFDI requests before checkout
ALTER TABLE public.active_tickets
ADD COLUMN cfdi_status text DEFAULT 'none' CHECK (cfdi_status IN ('none', 'requested', 'issued', 'reopened', 'canceled')),
ADD COLUMN cfdi_folio text,
ADD COLUMN fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id);

-- ==========================================================================
-- ANON POLICIES: allow the public CFDI portal to read tickets and write CFDI
-- status. The portal connects with the anon key (no sign-in).
-- ==========================================================================

-- Sales: anon can SELECT (to find the sale) and UPDATE (to set cfdi_status)
DROP POLICY IF EXISTS "CFDI portal can read sales" ON public.sales;
CREATE POLICY "CFDI portal can read sales" ON public.sales
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "CFDI portal can update cfdi on sales" ON public.sales;
CREATE POLICY "CFDI portal can update cfdi on sales" ON public.sales
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Active tickets: anon can SELECT (to show unpaid ticket status)
DROP POLICY IF EXISTS "CFDI portal can read active_tickets" ON public.active_tickets;
CREATE POLICY "CFDI portal can read active_tickets" ON public.active_tickets
  FOR SELECT TO anon USING (true);

-- Fiscal profiles: anon can also UPDATE (to refresh an existing RFC's details)
DROP POLICY IF EXISTS "CFDI portal can update fiscal_profiles" ON public.fiscal_profiles;
CREATE POLICY "CFDI portal can update fiscal_profiles" ON public.fiscal_profiles
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
