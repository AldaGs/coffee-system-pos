-- 036_lot_consumptions.sql
-- FIFO roast/production lot draw-down — the sale -> lot link.
--
-- Each row records that a sale (ticket_id) drew `qty` from a specific lot. When
-- a lot-tracked item sells, checkout consumes the oldest roast lot first (FIFO by
-- made_date) and decrements inventory_lots.qty_remaining, writing one row here
-- per lot touched (a single sale can span two lots at a boundary). This is what
-- answers "which roast did this bag come from": lot_id -> the sales that drew
-- from it, and ticket_id -> the lot(s) it consumed.
--
-- deduction_local_id is the inventory_logs.local_id that caused the draw-down, so
-- a consumption traces back to its exact stock deduction.
--
-- Additive tracking layer: stock counts remain owned by inventory.current_stock /
-- deduct_inventory_log. If a lot-tracked item outruns its lots (stock that
-- predates lot tracking), the remainder is simply left unattributed — the sale
-- and stock are still correct.
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.

CREATE TABLE IF NOT EXISTS public.lot_consumptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id             uuid,
  lot_code           text,
  item_name          text,
  qty                numeric NOT NULL DEFAULT 0,
  ticket_id          text,
  deduction_local_id uuid,
  created_at         timestamptz DEFAULT now(),
  local_id           uuid UNIQUE
);

CREATE INDEX IF NOT EXISTS lot_consumptions_lot_idx    ON public.lot_consumptions (lot_id);
CREATE INDEX IF NOT EXISTS lot_consumptions_ticket_idx ON public.lot_consumptions (ticket_id);

ALTER TABLE public.lot_consumptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can access lot_consumptions" ON public.lot_consumptions;
CREATE POLICY "Authenticated can access lot_consumptions" ON public.lot_consumptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
