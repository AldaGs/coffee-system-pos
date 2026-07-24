-- CFDI Global Invoice periods.
--
-- In Mexico, tickets a customer never individually invoices get rolled into a
-- monthly "Factura Global". Once that global CFDI is issued for a month, an
-- individual factura for a ticket in that month would double-count the income.
--
-- This table records which months (period = 'YYYY-MM') have had their global
-- invoice issued. The public CFDI portal reads it (anon) to block requests for
-- a closed month and show the legend
--   "Tu ticket ya fue incluido en la Factura Global de <negocio>".
-- The business name is snapshotted per row so the portal legend is self-
-- contained (no extra lookup / no auth).

CREATE TABLE IF NOT EXISTS public.cfdi_global_periods (
  period text PRIMARY KEY,                                   -- 'YYYY-MM'
  business_name text,
  summary jsonb,                                             -- frozen totals at close (see below)
  closed_at timestamp with time zone DEFAULT now()
);

-- `summary` snapshots the period's reconciliation totals at close time so a
-- later refund doesn't change what was already filed. Shape (amounts in cents):
--   { ticketCount, grossCents, refundCents, netCents,
--     invoicedCount, invoicedCents,        -- individually issued CFDI
--     globalCount, globalCents }            -- the Factura Global remainder
ALTER TABLE public.cfdi_global_periods ADD COLUMN IF NOT EXISTS summary jsonb;

ALTER TABLE public.cfdi_global_periods ENABLE ROW LEVEL SECURITY;

-- Authenticated POS/admin: full control (close / reopen periods).
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.cfdi_global_periods;
CREATE POLICY "Enable all for authenticated users" ON public.cfdi_global_periods
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Anon public portal: read-only, to detect a closed month and render the legend.
DROP POLICY IF EXISTS "CFDI portal can read global periods" ON public.cfdi_global_periods;
CREATE POLICY "CFDI portal can read global periods" ON public.cfdi_global_periods
  FOR SELECT TO anon USING (true);
