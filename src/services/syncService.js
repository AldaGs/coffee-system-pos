import { supabase } from '../supabaseClient';
import { db } from '../db';

export const attemptBackgroundSync = async (expenseQueue, clearExpenseQueue) => {
  // Don't try if we are offline
  if (!navigator.onLine) return;

  try {
    // 1. Sync Sales (Pulling directly from Dexie)
    const pendingSales = await db.syncQueue.toArray();
    if (pendingSales.length > 0) {
      // Strip the local Dexie ID from the sales
      const cleanSales = pendingSales.map(({ id: _UNUSED, ...rest }) => rest); // eslint-disable-line no-unused-vars
      
      const { error: salesErr } = await supabase.from('sales').insert(cleanSales);
      if (!salesErr) {
        await db.syncQueue.clear();
        console.log(`☁️ Synced ${cleanSales.length} offline sales.`);
      } else {
        console.error("Sales sync failed:", salesErr);
      }
    }
    
    // 2. Sync Expenses (Using the state passed from Register)
    if (expenseQueue && expenseQueue.length > 0) {
      // Strip the local ID from expenses just in case
      const cleanExpenses = expenseQueue.map(({ id: _UNUSED, ...rest }) => rest); // eslint-disable-line no-unused-vars
      
      const { error: expErr } = await supabase.from('expenses').insert(cleanExpenses);
      if (!expErr) {
        clearExpenseQueue();
        console.log(`☁️ Synced ${cleanExpenses.length} offline expenses.`);
      }
    }

    // 3. Sync Inventory Logs (Pulling directly from Dexie)
    const pendingInventory = await db.inventory_logs.toArray();
    if (pendingInventory.length > 0) {
      // Strip the local Dexie ID from the inventory logs
      const cleanLogs = pendingInventory.map(({ id: _UNUSED, ...rest }) => rest); // eslint-disable-line no-unused-vars
      
      const { error: invErr } = await supabase.from('inventory_logs').insert(cleanLogs);
      if (!invErr) {
        await db.inventory_logs.clear();
        console.log(`☁️ Synced ${cleanLogs.length} offline inventory logs.`);
      } else {
        console.error("Inventory sync failed:", invErr);
      }
    }
  } catch (err) {
    console.error("Background sync failed:", err);
  }
};