-- 034_idempotent_inventory_deduction.sql
-- Schema 1.1 — make inventory deduction idempotent per originating log.
--
-- deduct_inventory(item_id, qty) is a raw read-modify-write with no dedup key, so
-- on a slow link the same sale could decrement stock twice:
--   1. Sync replay: the RPC commits but the response times out, the Dexie log
--      isn't cleared, and the next run calls it again.
--   2. Online checkout: the RPC commits then times out, the whole sale is requeued
--      to Dexie, and the replay deducts a second time.
-- The sale row itself is safe (upsert on local_id); only the stock count drifted.
--
-- Fix: bind each deduction to the inventory_logs.local_id it came from and claim
-- that id exactly once in a dedup table. Any number of retries with the same
-- local_id — across checkout AND replay — decrement stock at most once. The old
-- deduct_inventory is kept so app versions that still call it keep working (they
-- retain the pre-existing double-count risk on their own timeouts, no worse than
-- before); updated devices call the idempotent variant below.

CREATE TABLE IF NOT EXISTS public.inventory_deductions_applied (
  local_id uuid PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_deductions_applied ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can access inventory_deductions_applied" ON public.inventory_deductions_applied;
CREATE POLICY "Authenticated can access inventory_deductions_applied" ON public.inventory_deductions_applied
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.deduct_inventory_log(p_local_id uuid, p_item_id bigint, p_qty numeric)
RETURNS TABLE (
  out_id bigint,
  out_name text,
  out_current_stock numeric,
  out_applied boolean
) AS $$
DECLARE
  v_rows integer;
BEGIN
  -- Claim this log's deduction exactly once. ON CONFLICT DO NOTHING turns a
  -- repeated or concurrent call for the same local_id into a no-op claim.
  INSERT INTO public.inventory_deductions_applied (local_id)
  VALUES (p_local_id)
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Already applied by an earlier (possibly timed-out-but-committed) call:
    -- report current stock without decrementing again.
    RETURN QUERY
      SELECT inv.id, inv.name, inv.current_stock, false
      FROM public.inventory AS inv
      WHERE inv.id = p_item_id;
    RETURN;
  END IF;

  -- First time for this log: decrement (guarded so stock never goes negative,
  -- matching deduct_inventory). An empty result means insufficient stock.
  RETURN QUERY
    UPDATE public.inventory AS inv
    SET current_stock = inv.current_stock - p_qty
    WHERE inv.id = p_item_id AND inv.current_stock >= p_qty
    RETURNING inv.id, inv.name, inv.current_stock, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
