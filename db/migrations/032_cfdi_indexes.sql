-- Add indexes for cfdi_status to prevent timeouts on the Admin CFDI tab
-- when querying tickets with active CFDI requests on large tables.

CREATE INDEX IF NOT EXISTS idx_sales_cfdi_status ON public.sales(cfdi_status) WHERE cfdi_status != 'none';
CREATE INDEX IF NOT EXISTS idx_active_tickets_cfdi_status ON public.active_tickets(cfdi_status) WHERE cfdi_status != 'none';
