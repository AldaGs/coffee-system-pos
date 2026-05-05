-- 002_inventory_rpc.sql
-- Atomic inventory deduction to prevent race conditions

CREATE OR REPLACE FUNCTION deduct_inventory(item_id BIGINT, qty NUMERIC)
RETURNS TABLE (
  id BIGINT,
  name TEXT,
  current_stock NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  UPDATE public.inventory
  SET current_stock = current_stock - qty
  WHERE public.inventory.id = item_id AND current_stock >= qty
  RETURNING public.inventory.id, public.inventory.name, public.inventory.current_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
