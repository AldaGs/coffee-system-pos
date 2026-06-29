-- =============================================================================
-- 023_vendors.sql
--
-- Multi-vendor sales. Adds a dedicated `vendors` registry so a shop hosting a
-- pop-up / consignment can tag each product with the vendor that owns it and,
-- at settlement, total each vendor's sales and apply a commission split.
--
-- `vendors` is catalog/reference data (low-volume, admin-managed), so it follows
-- the same pattern as menu_categories / menu_items: a client-generated text id,
-- RLS scoped TO authenticated, written directly (no offline sync queue / local_id).
--
-- The item -> vendor link is NOT a column here: it rides on menu_items.data jsonb
-- as { vendorId, vendorName }, exactly like linkedRecipeId / linkedWarehouseId
-- already reference other tables. The vendorName is denormalized onto the item
-- (and from there snapshotted onto each sales.items line at checkout) so historic
-- settlement reports stay correct even if a vendor is later renamed or removed.
--
-- This file mirrors the same block embedded in api/install.js and
-- src/components/SetupScreen.jsx. Keep all three in sync.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.vendors (
  id                 text PRIMARY KEY,                 -- client-generated uuid
  name               text NOT NULL,
  contact            text NOT NULL DEFAULT '',
  commission_percent numeric NOT NULL DEFAULT 0,       -- % the house keeps
  is_active          bool NOT NULL DEFAULT true,
  sort_order         int  NOT NULL DEFAULT 0,
  data               jsonb NOT NULL DEFAULT '{}'::jsonb,  -- per-vendor settings: { splitType: 'percentage' | 'cost' }
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hardware can access vendors" ON public.vendors;
CREATE POLICY "Hardware can access vendors" ON public.vendors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
