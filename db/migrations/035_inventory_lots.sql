-- 035_inventory_lots.sql
-- Roast / production lot traceability.
--
-- A "lot" is one received or produced batch of a lot-tracked inventory item —
-- roasted coffee, an in-house syrup, a prepped food. It carries TWO dates:
--   * made_date     — when it was roasted / produced (from the roaster)
--   * received_date — when it actually landed in stock
-- These differ when roasting is outsourced and the bags arrive up to a few days
-- after the roast. inventory.track_lots flags which items participate; it is set
-- true automatically the first time an item is produced via the Transform flow
-- (see src/components/admin/InventoryTab.jsx). Non-tracked items (milk, cups)
-- are unaffected.
--
-- The link key is item_name (inventory.name is UNIQUE) rather than a numeric id,
-- so the same rows round-trip between local ('guest') Dexie and cloud without an
-- id-type mismatch — the same convention inventory_logs already uses.
--
-- Increment 1: the lot registry. FIFO sale draw-down + the batch report land in
-- a follow-up (inventory_lots.qty_remaining is decremented there).
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS track_lots boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name     text NOT NULL,
  lot_code      text,
  made_date     date,
  received_date date,
  qty_received  numeric NOT NULL DEFAULT 0,
  qty_remaining numeric NOT NULL DEFAULT 0,
  unit          text,
  unit_cost     numeric DEFAULT 0,
  source_name   text,
  notes         text,
  local_id      uuid UNIQUE,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_lots_item_made_idx
  ON public.inventory_lots (item_name, made_date);

ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can access inventory_lots" ON public.inventory_lots;
CREATE POLICY "Authenticated can access inventory_lots" ON public.inventory_lots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
