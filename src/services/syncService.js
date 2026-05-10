import { supabase } from '../supabaseClient';
import { db } from '../db';

export const attemptBackgroundSync = async (expenseQueue, clearExpenseQueue) => {
  // Don't try if we are offline
  if (!navigator.onLine) return false;

  let hasAuthError = false;

  try {
    // Check if we have a valid session before starting
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !session) {
      console.warn("Background sync skipped: No active session or session error.", sessionErr?.message);
      return (sessionErr?.status === 400 || sessionErr?.status === 401);
    }

    // 1. Sync Sales (Pulling directly from Dexie)
    const pendingSales = await db.syncQueue.toArray();
    if (pendingSales.length > 0) {
      // Strip the local Dexie ID
      const cleanSales = pendingSales.map(({ id: _UNUSED, ...rest }) => rest); // eslint-disable-line no-unused-vars
      
      const { error: salesErr } = await supabase.from('sales').upsert(cleanSales, { onConflict: 'local_id' });
      if (!salesErr) {
        await db.syncQueue.clear();
        console.log(`☁️ Synced ${cleanSales.length} offline sales.`);
      } else {
        console.error("Sales sync failed:", salesErr);
        if (salesErr.status === 400 || salesErr.status === 401) hasAuthError = true;
      }
    }

    // 2. Sync Expenses (From LocalStorage)
    const localExpenseQueue = JSON.parse(localStorage.getItem('tinypos_expense_queue') || '[]');
    const combinedExpenseQueue = [...(expenseQueue || []), ...localExpenseQueue];
    
    if (combinedExpenseQueue.length > 0) {
      const { error: expErr } = await supabase.from('expenses').upsert(combinedExpenseQueue, { onConflict: 'id' });
      if (!expErr) {
        if (clearExpenseQueue) clearExpenseQueue();
        localStorage.setItem('tinypos_expense_queue', '[]');
        console.log(`☁️ Synced ${combinedExpenseQueue.length} offline expenses.`);
      } else {
        console.error("Expense sync failed:", expErr);
        if (expErr.status === 400 || expErr.status === 401) hasAuthError = true;
      }
    }

    // 3. Sync Inventory Logs
    const pendingInventory = await db.inventory_logs.toArray();
    if (pendingInventory.length > 0) {
      const { data: cloudInventory } = await supabase.from('inventory').select('id, name');
      const nameToId = new Map((cloudInventory || []).map(i => [i.name, i.id]));
      let processed = 0;

      for (const log of pendingInventory) {
        const { id: dexieId, ...cleanLog } = log;
        const { error: upsertErr } = await supabase.from('inventory_logs').upsert([cleanLog], { onConflict: 'local_id' });
        
        if (upsertErr) {
          console.error("Log upsert failed:", upsertErr);
          if (upsertErr.status === 400 || upsertErr.status === 401) hasAuthError = true;
          continue;
        }

        if (cleanLog.deduction_type === 'sale') {
          const itemId = nameToId.get(cleanLog.item_name);
          if (itemId) {
            const { error: rpcErr } = await supabase.rpc('deduct_inventory', {
              item_id: Number(itemId),
              qty: Number(cleanLog.qty_deducted)
            });
            if (rpcErr) { 
              console.error("RPC deduct failed:", rpcErr);
              if (rpcErr.status === 400 || rpcErr.status === 401) hasAuthError = true;
              continue; 
            }
          }
        }

        await db.inventory_logs.delete(dexieId);
        processed++;
      }
      if (processed > 0) console.log(`☁️ Synced ${processed} inventory logs.`);
    }

    // 4. Sync Updates (Refunds, Loyalty, Deletions)
    const pendingUpdates = await db.updateQueue.toArray();
    if (pendingUpdates.length > 0) {
      for (const update of pendingUpdates) {
        try {
          let error = null;
          if (update.type === 'sale_update') {
            const query = update.local_id
              ? supabase.from('sales').update(update.data).eq('local_id', update.local_id)
              : supabase.from('sales').update(update.data).eq('id', update.cloud_id);
            const { error: err } = await query;
            error = err;
          } else if (update.type === 'loyalty_increment') {
            const { data: existing, error: readErr } = await supabase
              .from('customers').select('visits').eq('phone', update.data.phone).maybeSingle();
            if (readErr) { error = readErr; }
            else if (existing) {
              const newVisits = (existing.visits || 0) + (update.data.increment || 0);
              const { error: err } = await supabase.from('customers')
                .update({ visits: newVisits }).eq('phone', update.data.phone);
              error = err;
            } else {
              const { error: err } = await supabase.from('customers')
                .insert([{ phone: update.data.phone, visits: update.data.increment || 0 }]);
              error = err;
            }
          } else if (update.type === 'ticket_deletion') {
            const { error: err } = await supabase.from('active_tickets').delete().eq('id', update.ticket_id);
            error = err;
          }

          if (!error) {
            await db.updateQueue.delete(update.id);
          } else if (error.status === 400 || error.status === 401) {
            hasAuthError = true;
          }
        } catch (updateErr) {
          console.error("Failed to sync update:", updateErr);
        }
      }
    }

    // 5. Sync WhatsApp Queue
    const waQueue = JSON.parse(localStorage.getItem('tinypos_wa_queue') || '[]');
    if (waQueue.length > 0) {
      const { error: waErr } = await supabase.from('whatsapp_queue').upsert(waQueue, { onConflict: 'id' });
      if (!waErr) {
        localStorage.setItem('tinypos_wa_queue', '[]');
        console.log(`☁️ Synced ${waQueue.length} WhatsApp receipts.`);
      } else {
        console.error("WA sync failed:", waErr);
        if (waErr.status === 400 || waErr.status === 401) hasAuthError = true;
      }
    }

  } catch (err) {
    console.error("Global background sync error:", err);
  }

  return hasAuthError;
};