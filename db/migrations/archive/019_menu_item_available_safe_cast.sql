-- =============================================================================
-- 019_menu_item_available_safe_cast.sql
--
-- Fix: migration 018's menu_item_available() casts the recipe ingredient
-- `qty` to numeric unconditionally. Recipes with an empty-string qty
-- (saved by older catalog editor versions) crash the cast with
-- "invalid input syntax for type numeric:" causing get_active_menu /
-- get_menu_by_id to return 400.
--
-- Replace the cast with the same regex-guarded CASE pattern we use for
-- the ingredient id, so any non-numeric qty just falls back to 0
-- ("nothing required → not blocking availability").
--
-- Mirrored in api/install.js and src/components/SetupScreen.jsx.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.menu_item_available(p_item_id text)
RETURNS bool LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb; v_mode text; v_short_id bigint;
BEGIN
  SELECT data INTO v_data FROM public.menu_items WHERE id = p_item_id;
  IF v_data IS NULL THEN RETURN true; END IF;
  v_mode := COALESCE(v_data->>'inventoryMode', 'none');

  IF v_mode = 'warehouse' THEN
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
