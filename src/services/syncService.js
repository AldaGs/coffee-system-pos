import { supabase } from '../supabaseClient';
import { db } from '../db';

export const attemptBackgroundSync = async (expenseQueue, clearExpenseQueue) => {
  // Don't try if we are offline
  if (!navigator.onLine) return;

  try {
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
      }
    }
    
    // 2. Sync Expenses
    if (expenseQueue && expenseQueue.length > 0) {
      const cleanExpenses = expenseQueue.map(({ id: _UNUSED, ...rest }) => ({ ...rest, local_id: rest.local_id || crypto.randomUUID() })); // eslint-disable-line no-unused-vars
      
      const { error: expErr } = await supabase.from('expenses').upsert(cleanExpenses, { onConflict: 'local_id' });
      if (!expErr) {
        clearExpenseQueue();
        console.log(`☁️ Synced ${cleanExpenses.length} offline expenses.`);
      }
    }

    // 3. Sync Inventory Logs (and apply the actual stock decrement to Supabase).
    // Process per-log so we never re-run deduct_inventory after success: each log is
    // deleted from Dexie only after BOTH the upsert and the RPC succeed.
    const pendingInventory = await db.inventory_logs.toArray();
    if (pendingInventory.length > 0) {
      // One lookup of cloud inventory IDs by name for the whole batch
      const { data: cloudInventory, error: invFetchErr } = await supabase
        .from('inventory').select('id, name');
      if (invFetchErr) {
        console.error("Inventory fetch failed:", invFetchErr);
      } else {
        const nameToId = new Map((cloudInventory || []).map(i => [i.name, i.id]));
        let processed = 0;
        for (const log of pendingInventory) {
          const { id: dexieId, ...cleanLog } = log;
          const { error: upsertErr } = await supabase
            .from('inventory_logs')
            .upsert([cleanLog], { onConflict: 'local_id' });
          if (upsertErr) { console.error("Log upsert failed:", upsertErr); continue; }

          // Apply the actual stock deduction (RPC is NOT idempotent — only run once per log).
          if (cleanLog.deduction_type === 'sale') {
            const itemId = nameToId.get(cleanLog.item_name);
            if (itemId) {
              const { error: rpcErr } = await supabase.rpc('deduct_inventory', {
                item_id: Number(itemId),
                qty: Number(cleanLog.qty_deducted)
              });
              if (rpcErr) { console.error("RPC deduct failed:", rpcErr); continue; }
            }
          }

          await db.inventory_logs.delete(dexieId);
          processed++;
        }
        if (processed > 0) console.log(`☁️ Synced ${processed} offline inventory logs.`);
      }
    }

    // 4. Sync Updates (Refunds, Loyalty, Deletions)
    const pendingUpdates = await db.updateQueue.toArray();
    if (pendingUpdates.length > 0) {
      for (const update of pendingUpdates) {
        try {
          let error = null;
          if (update.type === 'sale_update') {
            // Prefer local_id; fall back to id for legacy rows that have no local_id.
            const query = update.local_id
              ? supabase.from('sales').update(update.data).eq('local_id', update.local_id)
              : supabase.from('sales').update(update.data).eq('id', update.cloud_id);
            const { error: err } = await query;
            error = err;
          } else if (update.type === 'loyalty_increment') {
            // Read-modify-write: add the queued increment to whatever is on the server.
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
          } else if (update.type === 'loyalty_update') {
            // Legacy queued items from the old (buggy) format — migrate by treating
            // the stored visits as an increment so we don't overwrite real totals.
            const { data: existing } = await supabase
              .from('customers').select('visits').eq('phone', update.data.phone).maybeSingle();
            const incremented = (existing?.visits || 0) + (update.data.visits || 0);
            const { error: err } = await supabase.from('customers').upsert(
              { phone: update.data.phone, visits: incremented },
              { onConflict: 'phone' }
            );
            error = err;
          } else if (update.type === 'ticket_deletion') {
            const { error: err } = await supabase.from('active_tickets').delete().eq('id', update.ticket_id);
            error = err;
          }

          if (!error) {
            await db.updateQueue.delete(update.id);
          }
        } catch (updateErr) {
          console.error("Failed to sync update:", updateErr);
        }
      }
      console.log(`☁️ Processed ${pendingUpdates.length} background updates.`);
    }

  } catch (err) {
    console.error("Background sync failed:", err);
  }
};