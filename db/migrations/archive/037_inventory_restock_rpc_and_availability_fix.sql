-- 037_inventory_restock_rpc_and_availability_fix.sql
-- Schema 1.4 — stock returns, and the availability check that never fired.
--
-- Three fixes, all in the inventory path:
--
-- 1. menu_item_available() tested `inventoryMode = 'warehouse'`, but the app has
--    only ever written 'standard' (see MenuEditorTab / Admin.jsx / menuCloud.js /
--    menuLocal.js — no code path produces 'warehouse'). So the warehouse branch
--    was dead: a stock-linked item stayed "available" on the public menu at zero
--    stock. Accept BOTH spellings rather than rewriting every menu_items.data
--    jsonb blob in place: existing rows keep working and any old row that really
--    does say 'warehouse' keeps working too.
--
-- 2. restock_inventory_log() — the mirror image of deduct_inventory_log, for
--    stock coming BACK (a refund return, a rolled-back checkout). Same dedup
--    table and the same claim-once rule, so a replayed queue entry or a double
--    tap can't inflate stock. Without this, returning stock meant a raw
--    read-modify-write with the exact race deduction was hardened against in 034.
--
-- 3. deduct_inventory_log() gains out_found. It previously returned zero rows
--    both for "not enough stock" and for "no such item id", and the app reported
--    the second as "Insufficient stock" — a confusing error for a deleted or
--    re-linked item. Zero rows now means insufficient stock and nothing else;
--    a missing item returns one row with out_found = false. Older clients read
--    only the row count, so they're unaffected.
--
-- The legacy deduct_inventory(item_id, qty) from migration 002 is deliberately
-- still here: nothing in the app calls it any more (checkout and the sync replay
-- both use deduct_inventory_log), but an un-updated device on an old bundle
-- might, and dropping it would break that device's checkout outright.
--
-- Mirrored in api/install.js, api/_schemaDeltas.js and src/components/SetupScreen.jsx.

-- 1. Availability: accept the mode string the app actually writes ---------------
CREATE OR REPLACE FUNCTION public.menu_item_available(p_item_id text)
RETURNS bool LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb; v_mode text; v_short_id bigint;
BEGIN
  SELECT data INTO v_data FROM public.menu_items WHERE id = p_item_id;
  IF v_data IS NULL THEN RETURN true; END IF;
  v_mode := COALESCE(v_data->>'inventoryMode', 'none');

  IF v_mode IN ('warehouse', 'standard') THEN
    BEGIN v_short_id := NULLIF(v_data->>'linkedWarehouseId','')::bigint;
    EXCEPTION WHEN OTHERS THEN RETURN true; END;
    IF v_short_id IS NULL THEN RETURN true; END IF;
    RETURN COALESCE(
      (SELECT current_stock > 0 FROM public.inventory WHERE id = v_short_id),
      true
    );
  END IF;

  IF v_mode = 'recipe' THEN
    DECLARE v_rid uuid;
    BEGIN
      BEGIN v_rid := NULLIF(v_data->>'linkedRecipeId','')::uuid;
      EXCEPTION WHEN OTHERS THEN RETURN true; END;
      IF v_rid IS NULL THEN RETURN true; END IF;
      RETURN NOT EXISTS (
        SELECT 1
        FROM public.recipes r,
             LATERAL jsonb_array_elements(COALESCE(r.ingredients,'[]'::jsonb)) AS ing(val)
        WHERE r.id = v_rid
          AND COALESCE((ing.val->>'isManual')::bool, false) = false
          AND COALESCE(
                (SELECT current_stock FROM public.inventory
                  WHERE name = (ing.val->>'name') LIMIT 1),
                0
              )
              < (CASE WHEN (ing.val->>'qty') ~ '^-?[0-9]+(\.[0-9]+)?$'
                      THEN (ing.val->>'qty')::numeric ELSE 0 END)
      );
    END;
  END IF;

  RETURN true;
END $$;

-- 2. Idempotent stock RETURN ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.restock_inventory_log(p_local_id uuid, p_item_id bigint, p_qty numeric)
RETURNS TABLE (
  out_id bigint,
  out_name text,
  out_current_stock numeric,
  out_applied boolean,
  out_found boolean
) AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.inventory_deductions_applied (local_id)
  VALUES (p_local_id)
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Already applied by an earlier (possibly timed-out-but-committed) call.
    RETURN QUERY
      SELECT inv.id, inv.name, inv.current_stock, false, true
      FROM public.inventory AS inv
      WHERE inv.id = p_item_id;
    RETURN;
  END IF;

  RETURN QUERY
    UPDATE public.inventory AS inv
    SET current_stock = inv.current_stock + p_qty
    WHERE inv.id = p_item_id
    RETURNING inv.id, inv.name, inv.current_stock, true, true;

  -- No such item: report it instead of silently succeeding.
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_item_id, NULL::text, NULL::numeric, false, false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Deduction: tell "missing item" apart from "insufficient stock" ------------
DROP FUNCTION IF EXISTS public.deduct_inventory_log(uuid, bigint, numeric);

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
    -- One row with out_found = false. Callers that only count rows (older app
    -- bundles) see a success and move on; the item doesn't exist, so there is
    -- no stock to move either way.
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

  -- Guarded so stock never goes negative. An empty result now means exactly one
  -- thing: insufficient stock.
  RETURN QUERY
    UPDATE public.inventory AS inv
    SET current_stock = inv.current_stock - p_qty
    WHERE inv.id = p_item_id AND inv.current_stock >= p_qty
    RETURNING inv.id, inv.name, inv.current_stock, true, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
