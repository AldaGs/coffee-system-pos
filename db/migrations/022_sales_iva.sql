-- =============================================================================
-- 022_sales_iva.sql
--
-- Records the IVA breakdown on each sale so the books (tinybooks) can post the
-- real tax instead of assuming a flat 16% on every ticket. MX food rules mean
-- some items are taxed (prepared/served, 16%) and some are not (unprepared food
-- like ground coffee — tasa 0% / exento).
--
-- The per-item treatment lives in menu_items.data jsonb (key `ivaTreatment`:
-- 'iva16' | 'tasa0' | 'exento'), set in the Admin menu editor — no column needed
-- there because the POS already spreads data into each item. This migration only
-- adds the two computed columns the checkout writes per sale (integer centavos,
-- IVA carved out of the tax-inclusive total):
--   tax_amount     — IVA portion of the sale
--   taxable_amount — the 16%-rated base the IVA came from
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.
-- =============================================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS tax_amount     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric DEFAULT 0;
