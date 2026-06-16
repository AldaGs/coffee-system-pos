import { supabase } from '../supabaseClient';
import { db } from '../db';
import { computeStarsForTicket } from '../hooks/useLoyalty';
import { recordTipAccrual } from './tipsService';
import { isLocalMode } from '../utils/appMode';

// Pre-flight stock check against local Dexie inventory. Mirrors the deduction
// logic in processCheckout but only reads — used to surface "insufficient
// stock" before the success flyout animates in. Online RPC is still the
// source of truth and will throw later if local state is stale.
export const validateStockLocally = async ({ activeTicket, recipes }) => {
  if (!activeTicket?.items?.length) return null;
  const inventory = await db.inventory.toArray();
  const usage = new Map(); // id -> qty needed

  const need = (id, qty) => {
    if (!id || !(qty > 0)) return;
    usage.set(String(id), (usage.get(String(id)) || 0) + qty);
  };
  const findByNameId = (id, name) =>
    (id && inventory.find(inv => String(inv.id) === String(id)))
    || (name && inventory.find(inv => inv.name === name))
    || null;

  for (const item of activeTicket.items) {
    const itemQty = item.qty || 1;

    if (item.inventoryMode === "standard" && item.linkedWarehouseId) {
      need(item.linkedWarehouseId, itemQty);
      if (item.selectedModifiers?.length) {
        for (const mod of item.selectedModifiers) {
          const hasDeduct = mod.deductionTargetId || mod.deductionTarget;
          const hasSub = mod.substitutionTargetId || mod.substitutionTarget;
          if (hasDeduct && !hasSub) {
            const modItem = findByNameId(mod.deductionTargetId, mod.deductionTarget);
            if (modItem) need(modItem.id, itemQty);
          }
        }
      }
    } else if (item.inventoryMode === "recipe" && item.linkedRecipeId) {
      const recipe = recipes.find(r => String(r.id) === String(item.linkedRecipeId));
      if (!recipe?.ingredients) continue;
      let cartBOM = recipe.ingredients.map(ing => ({
        id: ing.id,
        item_name: ing.name,
        qty: (parseFloat(ing.qty) || 0) * itemQty
      }));
      if (item.selectedModifiers?.length) {
        item.selectedModifiers.forEach(mod => {
          const hasDeduct = mod.deductionTargetId || mod.deductionTarget;
          const hasSub = mod.substitutionTargetId || mod.substitutionTarget;
          if (hasDeduct && hasSub) {
            const baseIndex = mod.substitutionTargetId
              ? cartBOM.findIndex(ing => String(ing.id) === String(mod.substitutionTargetId))
              : cartBOM.findIndex(ing => ing.item_name === mod.substitutionTarget);
            if (baseIndex !== -1) {
              const baseQty = cartBOM[baseIndex].qty;
              cartBOM.splice(baseIndex, 1);
              cartBOM.push({ id: mod.deductionTargetId || null, item_name: mod.deductionTarget, qty: baseQty });
            }
          } else if (hasDeduct && !hasSub) {
            cartBOM.push({ id: mod.deductionTargetId || null, item_name: mod.deductionTarget, qty: 1 });
          }
        });
      }
      for (const ing of cartBOM) {
        const whItem = findByNameId(ing.id, ing.item_name);
        if (whItem) need(whItem.id, ing.qty);
      }
    }
  }

  for (const [id, qty] of usage) {
    const inv = inventory.find(i => String(i.id) === id);
    if (inv && (inv.current_stock ?? 0) < qty) {
      return `Insufficient stock for ${inv.name}`;
    }
  }
  return null;
};

export const processCheckout = async ({ activeTicket, cartTotal, paymentsArray, activeCashier, recipes, tipAmount = 0, loyaltySettings = null }) => {
  // Determine the master string for backwards compatibility
  const isSplit = paymentsArray.length > 1;
  const masterMethodString = isSplit ? 'Split' : paymentsArray[0].method;

  // Ensure we are working with integer cents
  const centsTotal = cartTotal;
  const centsTip = tipAmount;
  const localId = crypto.randomUUID();

  // Local ('guest') mode has no Supabase client, so every cloud RPC/upsert below
  // must be skipped. Treating it as "offline" routes the sale through the same
  // catch path that persists to Dexie (syncQueue + inventory_logs) — which also
  // becomes the payload the upgrade migration pushes up later.
  const isOnline = !isLocalMode() && navigator.onLine;

  // Loyalty accrual: if a phone is attached to this ticket AND the loyalty program
  // qualifies the cart, record the phone + stars on the sale row. A server-side
  // trigger (trg_award_loyalty) will increment customers.visits exactly once on INSERT.
  // Retries via upsert(onConflict: local_id) do NOT re-fire the trigger.
  const loyaltyPhone = activeTicket?.loyalty_phone || null;
  const loyaltyActive = loyaltySettings?.isActive === true || loyaltySettings?.isActive === "true";
  const loyaltyStars = (loyaltyPhone && loyaltyActive)
    ? computeStarsForTicket(activeTicket, loyaltySettings)
    : 0;
  const loyaltyRedeemed = loyaltyPhone ? (activeTicket?.loyalty_stars_pending || 0) : 0;

  // 1. Build the CLOUD Data specifically matching your Supabase columns
  const currentSale = {
    total_amount: centsTotal,
    payment_method: masterMethodString,
    splits: isSplit ? paymentsArray.map(p => ({ ...p, amount: p.amount })) : null,
    tip_amount: centsTip,
    tip_refunded: 0,
    items_sold: activeTicket.items.map(item => item.name),
    items: activeTicket.items.map(item => ({ ...item, price: item.basePrice })),
    discount: activeTicket.discount || activeTicket.autoDiscountRuleName ? {
      ...(activeTicket.discount || {}),
      autoRuleName: activeTicket.autoDiscountRuleName || null,
      autoDiscountAmount: activeTicket.autoDiscountAmount || 0,
      manualDiscountAmount: activeTicket.manualDiscountAmount || 0
    } : null, // Discount info for re-sharing
    cashier_name: activeCashier?.name || 'Unknown Cashier',
    order_name: activeTicket.name || null,
    ticket_id: String(activeTicket.id),
    local_id: localId,
    loyalty_phone: (loyaltyStars > 0 || loyaltyRedeemed > 0) ? loyaltyPhone : null,
    loyalty_stars_awarded: loyaltyStars,
    loyalty_stars_redeemed: loyaltyRedeemed,
    loyalty_program_type: (loyaltyStars > 0 || loyaltyRedeemed > 0) ? (loyaltySettings?.programType || 'multiple') : null
  };

  // --- PREPARE THE DATA ---
  const finalizedSale = { ...currentSale, created_at: new Date().toISOString(), status: 'completed' };
  const inventoryLogsToPush = [];

  try {
    // Immediately save to local Dexie
    await db.sales.add(finalizedSale);

    // Fetch local inventory for instant offline deduction
    const currentInventory = await db.inventory.toArray();
    const timestamp = finalizedSale.created_at;

    // --- HYBRID INVENTORY DEDUCTION ENGINE ---
    for (const item of activeTicket.items) {
      const itemQty = item.qty || 1;

      // ==========================================
      // A. STANDARD ITEMS (Make-to-Stock)
      // ==========================================
      if (item.inventoryMode === "standard" && item.linkedWarehouseId) {
        const warehouseItem = currentInventory.find(inv => String(inv.id) === String(item.linkedWarehouseId));

        if (warehouseItem) {
          // ONLINE ATOMIC DEDUCTION
          if (isOnline) {
            const { data, error } = await supabase.rpc('deduct_inventory', { item_id: Number(warehouseItem.id), qty: itemQty });
            if (error) throw new Error(`RPC error deducting ${warehouseItem.name}: ${error.message}`);
            if (!data || data.length === 0) throw new Error(`Insufficient stock for ${warehouseItem.name}`);
          }

          inventoryLogsToPush.push({
            item_name: warehouseItem.name,
            qty_deducted: itemQty,
            deduction_type: "sale",
            created_at: timestamp,
            ticket_id: String(activeTicket.id),
            unit_cost: warehouseItem.unit_cost || 0,
            local_id: crypto.randomUUID()
          });

          const newStock = warehouseItem.current_stock - itemQty;
          await db.inventory.update(warehouseItem.id, { current_stock: newStock });
          warehouseItem.current_stock = newStock;
        }

        // Process Modifiers on Standard Items
        if (item.selectedModifiers && item.selectedModifiers.length > 0) {
          for (const mod of item.selectedModifiers) {
            const hasDeductTarget = mod.deductionTargetId || mod.deductionTarget;
            const hasSubTarget = mod.substitutionTargetId || mod.substitutionTarget;
            if (hasDeductTarget && !hasSubTarget) {
              const modItem = (mod.deductionTargetId && currentInventory.find(inv => String(inv.id) === String(mod.deductionTargetId)))
                || (mod.deductionTarget && currentInventory.find(inv => inv.name === mod.deductionTarget));

              if (modItem) {
                if (isOnline) {
                  const { data, error } = await supabase.rpc('deduct_inventory', { item_id: Number(modItem.id), qty: itemQty });
                  if (error) throw new Error(`RPC error deducting modifier ${modItem.name}: ${error.message}`);
                  if (!data || data.length === 0) throw new Error(`Insufficient stock for modifier ${modItem.name}`);
                }

                inventoryLogsToPush.push({
                  item_name: modItem.name,
                  qty_deducted: itemQty,
                  deduction_type: "sale",
                  created_at: timestamp,
                  ticket_id: String(activeTicket.id),
                  unit_cost: modItem.unit_cost || 0,
                  local_id: crypto.randomUUID()
                });

                const newModStock = modItem.current_stock - itemQty;
                await db.inventory.update(modItem.id, { current_stock: newModStock });
                modItem.current_stock = newModStock;
              }
            }
          }
        }
      }

      // ==========================================
      // B. RECIPE ITEMS (Make-to-Order)
      // ==========================================
      else if (item.inventoryMode === "recipe" && item.linkedRecipeId) {
        const recipe = recipes.find(r => String(r.id) === String(item.linkedRecipeId));

        if (recipe && recipe.ingredients) {
          let cartBOM = recipe.ingredients.map(ing => ({
            id: ing.id, // Prefer ID
            item_name: ing.name,
            qty: (parseFloat(ing.qty) || 0) * itemQty
          }));

          // Process Modifier Substitutions/Additions
          if (item.selectedModifiers && item.selectedModifiers.length > 0) {
            item.selectedModifiers.forEach(mod => {
              const hasDeductTarget = mod.deductionTargetId || mod.deductionTarget;
              const hasSubTarget = mod.substitutionTargetId || mod.substitutionTarget;
              if (hasDeductTarget && hasSubTarget) {
                const baseIndex = mod.substitutionTargetId
                  ? cartBOM.findIndex(ing => String(ing.id) === String(mod.substitutionTargetId))
                  : cartBOM.findIndex(ing => ing.item_name === mod.substitutionTarget);
                if (baseIndex !== -1) {
                  const baseQty = cartBOM[baseIndex].qty;
                  cartBOM.splice(baseIndex, 1);
                  cartBOM.push({ id: mod.deductionTargetId || null, item_name: mod.deductionTarget, qty: baseQty });
                }
              } else if (hasDeductTarget && !hasSubTarget) {
                cartBOM.push({ id: mod.deductionTargetId || null, item_name: mod.deductionTarget, qty: 1 });
              }
            });
          }

          for (const ing of cartBOM) {
            if (ing.qty > 0) {
              const whItem = currentInventory.find(inv => String(inv.id) === String(ing.id))
                || currentInventory.find(inv => inv.name === ing.item_name);

              if (whItem) {
                if (isOnline) {
                  const { data, error } = await supabase.rpc('deduct_inventory', { item_id: Number(whItem.id), qty: ing.qty });
                  if (error) throw new Error(`RPC error deducting ingredient ${whItem.name}: ${error.message}`);
                  if (!data || data.length === 0) throw new Error(`Insufficient stock for ingredient ${whItem.name}`);
                }

                inventoryLogsToPush.push({
                  item_name: whItem.name,
                  qty_deducted: ing.qty,
                  deduction_type: "sale",
                  created_at: timestamp,
                  ticket_id: String(activeTicket.id),
                  unit_cost: whItem.unit_cost || 0,
                  local_id: crypto.randomUUID()
                });

                const newStock = whItem.current_stock - ing.qty;
                await db.inventory.update(whItem.id, { current_stock: newStock });
                whItem.current_stock = newStock;
              }
            }
          }
        }
      }
    }

    // --- CLOUD SYNC ATTEMPT ---
    if (!isOnline) throw new Error("Device is offline");

    const { id: _UNUSED, ...cleanSale } = finalizedSale;
    const { error: salesError } = await supabase.from('sales').upsert(cleanSale, { onConflict: 'local_id' });
    if (salesError) throw salesError;

    if (inventoryLogsToPush.length > 0) {
      const { error: invError } = await supabase.from('inventory_logs').upsert(inventoryLogsToPush, { onConflict: 'local_id' });
      if (invError) throw invError;
    }

  } catch (error) {
    console.warn("Cloud sync deferred:", error.message);
    const { id: _UNUSED, ...safeOfflineSale } = finalizedSale;

    await db.syncQueue.add(safeOfflineSale);
    if (inventoryLogsToPush.length > 0) {
      await db.inventory_logs.bulkPut(inventoryLogsToPush);
    }
    // If it was a stock error, we should probably re-throw to alert the UI
    if (error.message.includes("Insufficient stock")) throw error;
  }

  // Local ('guest') mode loyalty: the cloud trg_award_loyalty trigger doesn't
  // run here, so replicate its effect against the Dexie `customers` store —
  // keyed by phone, same shape that migrates to the cloud table on upgrade.
  if (isLocalMode() && currentSale.loyalty_phone) {
    try {
      const phone = currentSale.loyalty_phone;
      const existing = await db.customers.get(phone);
      const visits = Math.max(0, (existing?.visits || 0) + loyaltyStars - loyaltyRedeemed);
      await db.customers.put({
        phone,
        visits,
        completed_at: existing?.completed_at
          || (loyaltySettings?.programType === 'single' && visits >= (loyaltySettings?.visitsRequired || Infinity)
              ? new Date().toISOString()
              : null),
      });
    } catch (e) {
      console.warn('local loyalty increment failed', e);
    }
  }

  // Record the tip accrual as a custodial-liability event. Best-effort:
  // never block checkout on ledger failure (a missing event can be rebuilt
  // from the sale row; a missing sale cannot be rebuilt from the event).
  if (centsTip > 0) {
    try {
      await recordTipAccrual({
        saleLocalId: localId,
        tipCents: centsTip,
        actor: activeCashier?.name || null
      });
    } catch (e) {
      console.warn('tip accrual event failed', e);
    }
  }

  return { localAnalyticsRecord: finalizedSale, masterMethodString };
};

