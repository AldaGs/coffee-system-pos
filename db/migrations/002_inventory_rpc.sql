-- 002_inventory_rpc.sql
-- Atomic inventory deduction to prevent race conditions

DROP FUNCTION IF EXISTS deduct_inventory(BIGINT, NUMERIC);

CREATE OR REPLACE FUNCTION deduct_inventory(item_id BIGINT, qty NUMERIC)
RETURNS TABLE (
  out_id BIGINT,
  out_name TEXT,
  out_current_stock NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  UPDATE public.inventory AS inv
  SET current_stock = inv.current_stock - qty
  WHERE inv.id = item_id AND inv.current_stock >= qty
  RETURNING inv.id, inv.name, inv.current_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
