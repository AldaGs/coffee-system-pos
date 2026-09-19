-- 038 — deduct_inventory_log no longer burns its local_id on insufficient stock.
--
-- Before: the dedup claim was inserted BEFORE the guarded stock UPDATE. When
-- stock was short the UPDATE matched nothing, but the claim committed anyway,
-- so the offline-sale replay (which only checked for an RPC error) deleted the
-- log as done and every later retry was a no-op. Cloud stock stayed too high
-- for good. Now the claim is released when the UPDATE matches no row.
--
-- Schema version 1.5. Idempotent.

-- Same signature and return shape as 1.4, so CREATE OR REPLACE is enough.
CREATE OR REPLACE FUNCTION public.deduct_inventory_log(p_local_id uuid, p_item_id bigint, p_qty numeric)
RETURNS TABLE (
  out_id bigint,
  out_name text,
  out_current_stock numeric,
  out_applied boolean,
  out_found boolean
) AS $$
DECLARE
  v_rows integer;
  v_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.inventory WHERE id = p_item_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN QUERY SELECT p_item_id, NULL::text, NULL::numeric, false, false;
    RETURN;
  END IF;

  INSERT INTO public.inventory_deductions_applied (local_id)
  VALUES (p_local_id)
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN QUERY
      SELECT inv.id, inv.name, inv.current_stock, false, true
      FROM public.inventory AS inv
      WHERE inv.id = p_item_id;
    RETURN;
  END IF;

  RETURN QUERY
    UPDATE public.inventory AS inv
    SET current_stock = inv.current_stock - p_qty
    WHERE inv.id = p_item_id AND inv.current_stock >= p_qty
    RETURNING inv.id, inv.name, inv.current_stock, true, true;
  -- Insufficient stock: release the claim so a later replay (after a
  -- restock) can still apply this deduction instead of it being lost.
  IF NOT FOUND THEN
    DELETE FROM public.inventory_deductions_applied WHERE local_id = p_local_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO public.schema_meta (key, value, updated_at)
VALUES ('schema_version', '1.5', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
