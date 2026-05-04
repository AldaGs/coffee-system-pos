import { supabase } from '../supabaseClient';
import { db } from '../db';

export const processCheckout = async ({ activeTicket, cartTotal, paymentsArray, activeCashier, recipes, tipAmount = 0 }) => {
  // Determine the master string for backwards compatibility
  const isSplit = paymentsArray.length > 1;
  const masterMethodString = isSplit ? 'Split' : paymentsArray[0].method;

  // 1. Build the LOCAL Analytics Data (This powers your Admin Dashboard!)
  const localAnalyticsRecord = {
    ...activeTicket, // Copies all items and modifiers
    total: cartTotal,
    method: masterMethodString,
    splits: isSplit ? paymentsArray : null,
    timestamp: new Date().toISOString(),
    cashierId: activeCashier?.id || 'unknown',
    cashier_name: activeCashier?.name || 'Unknown Cashier'
  };

  // 2. Build the CLOUD Data specifically matching your Supabase columns
  const currentSale = {
    total_amount: cartTotal,
    payment_method: masterMethodString,
    splits: isSplit ? paymentsArray : null,
    tip_amount: tipAmount,
    items_sold: activeTicket.items.map(item => item.name),
    cashier_name: activeCashier?.name || 'Unknown Cashier'
  };

  // --- PREPARE THE DATA ---
  const finalizedSale = { ...currentSale, created_at: new Date().toISOString(), status: 'completed' };
  const inventoryLogsToPush = [];

  try {
    // Immediately save to local Dexie so it shows up in your history instantly
    await db.sales.add(finalizedSale);

    // Fetch local inventory for instant offline deduction
    const currentInventory = await db.inventory.toArray();
    const timestamp = finalizedSale.created_at;

    // --- HYBRID INVENTORY DEDUCTION ENGINE ---
    for (const item of activeTicket.items) {
      
      // ==========================================
      // A. STANDARD ITEMS (Make-to-Stock)
      // ==========================================
      if (item.inventoryMode === "standard" && item.linkedWarehouseId) {
        const itemQty = item.qty || 1;
        const warehouseItem = currentInventory.find(inv => String(inv.id) === String(item.linkedWarehouseId));

        if (warehouseItem) {
          inventoryLogsToPush.push({ item_name: warehouseItem.name, qty_deducted: itemQty, deduction_type: "sale", created_at: timestamp, ticket_id: activeTicket.id, unit_cost: warehouseItem.unit_cost || 0 });

          const newStock = warehouseItem.current_stock - itemQty;
          await db.inventory.update(warehouseItem.id, { current_stock: newStock });
          warehouseItem.current_stock = newStock;
          if (navigator.onLine) supabase.from('inventory').update({ current_stock: newStock }).eq('id', warehouseItem.id).then();
        }

        // Process Additions on Standard Items
        if (item.selectedModifiers && item.selectedModifiers.length > 0) {
          for (const mod of item.selectedModifiers) {
            if (mod.deductionTarget && !mod.substitutionTarget) {
              const modItem = currentInventory.find(inv => inv.name === mod.deductionTarget);
              inventoryLogsToPush.push({ item_name: mod.deductionTarget, qty_deducted: itemQty, deduction_type: "sale", created_at: timestamp, ticket_id: activeTicket.id, unit_cost: modItem ? (modItem.unit_cost || 0) : 0 });

              if (modItem) {
                const newModStock = modItem.current_stock - itemQty;
                await db.inventory.update(modItem.id, { current_stock: newModStock });
                modItem.current_stock = newModStock;
                if (navigator.onLine) supabase.from('inventory').update({ current_stock: newModStock }).eq('id', modItem.id).then();
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
          const itemQty = item.qty || 1;
          let cartBOM = recipe.ingredients.map(ing => ({ item_name: ing.name, qty: (parseFloat(ing.qty) || 0) * itemQty }));

          if (item.selectedModifiers && item.selectedModifiers.length > 0) {
            item.selectedModifiers.forEach(mod => {
              if (mod.deductionTarget && mod.substitutionTarget) {
                const targetName = mod.substitutionTarget.trim().toLowerCase();
                const baseIndex = cartBOM.findIndex(ing => ing.item_name.trim().toLowerCase() === targetName);
                if (baseIndex !== -1) {
                  const baseQty = cartBOM[baseIndex].qty;
                  cartBOM.splice(baseIndex, 1);
                  cartBOM.push({ item_name: mod.deductionTarget, qty: baseQty });
                } else {
                  cartBOM.push({ item_name: mod.deductionTarget, qty: 1 });
                }
              } else if (mod.deductionTarget && !mod.substitutionTarget) {
                cartBOM.push({ item_name: mod.deductionTarget, qty: 1 });
              }
            });
          }

          for (const ing of cartBOM) {
            if (ing.qty > 0) {
              const whItem = currentInventory.find(inv => inv.name === ing.item_name);
              inventoryLogsToPush.push({ item_name: ing.item_name, qty_deducted: ing.qty, deduction_type: "sale", created_at: timestamp, ticket_id: activeTicket.id, unit_cost: whItem ? (whItem.unit_cost || 0) : 0 });

              if (whItem) {
                const newStock = whItem.current_stock - ing.qty;
                await db.inventory.update(whItem.id, { current_stock: newStock });
                whItem.current_stock = newStock;
                if (navigator.onLine) supabase.from('inventory').update({ current_stock: newStock }).eq('id', whItem.id).then();
              }
            }
          }
        }
      }
    }

    // --- CLOUD SYNC ATTEMPT ---
    if (!navigator.onLine) throw new Error("Device is offline");

    const { id: _UNUSED, ...cleanSale } = finalizedSale;
    const { error: salesError } = await supabase.from('sales').insert([cleanSale]);
    if (salesError) throw salesError;

    if (inventoryLogsToPush.length > 0) {
      const { error: invError } = await supabase.from('inventory_logs').insert(inventoryLogsToPush);
      if (invError) throw invError;
    }
    console.log("SALE COMPLETE & SAVED TO CLOUD INSTANTLY");

  } catch (error) {
    console.warn("Cloud save failed. Moving to offline queue.", error.message);
    const { id: _UNUSED, ...safeOfflineSale } = finalizedSale;
    
    await db.syncQueue.add(safeOfflineSale);
    if (inventoryLogsToPush.length > 0) {
      await db.inventory_logs.bulkPut(inventoryLogsToPush);
    }
  } 

  // Return the data the UI needs to finish the transaction animations
  return { localAnalyticsRecord, masterMethodString };
};