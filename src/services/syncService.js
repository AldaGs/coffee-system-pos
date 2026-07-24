import { supabase } from '../supabaseClient';
import { db } from '../db';
import { isLocalMode } from '../utils/appMode';
import { isCloudReachable } from '../utils/network';
import { chunkArray, runSyncChunk } from '../utils/syncBatch';

export const attemptBackgroundSync = async (expenseQueue, clearExpenseQueue) => {
  // Local ('guest') mode has no cloud project to sync to — data lives only in
  // Dexie. No-op so the interval/online listener never touch a null client.
  if (isLocalMode() || !supabase) return false;

  // Don't try if we are offline — or if the cloud is known-unreachable (a slow
  // link that already tripped the breaker). Retrying here would just stall the
  // whole sync batch behind one timeout.
  if (!isCloudReachable()) return false;

  let hasAuthError = false;

  try {
    // Check if we have a valid session before starting
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !session) {
      console.warn("Background sync skipped: No active session or session error.", sessionErr?.message);
      return (sessionErr?.status === 400 || sessionErr?.status === 401);
    }

    // 1. Sync Sales (Pulling directly from Dexie). Chunked so a big backlog can't
    // blow the deadline as one giant upsert, and so each landed chunk clears from
    // the queue independently — partial progress survives a mid-batch stall.
    const pendingSales = await db.syncQueue.toArray();
    if (pendingSales.length > 0) {
      let synced = 0;
      for (const chunk of chunkArray(pendingSales)) {
        // Strip the local Dexie ID from the payload; keep it to delete on success.
        const cleanSales = chunk.map(({ id: _UNUSED, ...rest }) => rest); // eslint-disable-line no-unused-vars
        const { ok, authError } = await runSyncChunk(
          () => supabase.from('sales').upsert(cleanSales, { onConflict: 'local_id' })
        );
        if (ok) {
          await db.syncQueue.bulkDelete(chunk.map(r => r.id));
          synced += chunk.length;
        } else {
          if (authError) hasAuthError = true;
          // Link is down or the chunk is stuck: stop now and let the next interval
          // (or the heartbeat's recovery close) resume from what's left.
          break;
        }
      }
      if (synced > 0) console.log(`☁️ Synced ${synced} offline sales.`);
    }

    // 2. Sync Expenses (From LocalStorage)
    const localExpenseQueue = JSON.parse(localStorage.getItem('tinypos_expense_queue') || '[]');
    const combinedExpenseQueue = [...(expenseQueue || []), ...localExpenseQueue];

    // De-dup before upserting: this batch is an `onConflict: 'local_id'` upsert,
    // so two rows sharing a local_id (a re-queued retry, or several rows with a
    // missing/null local_id) make Postgres reject the WHOLE batch with 21000
    // ("ON CONFLICT DO UPDATE command cannot affect row a second time"), which
    // then never clears and blocks every queued expense forever. Backfill a
    // local_id for any row missing one, then keep the last row per local_id.
    const dedupedExpenseQueue = [...new Map(
      combinedExpenseQueue.map(e => {
        const withId = e.local_id ? e : { ...e, local_id: crypto.randomUUID() };
        return [withId.local_id, withId];
      })
    ).values()];

    if (dedupedExpenseQueue.length > 0) {
      // Chunk the upsert. Whatever doesn't land is folded into `remaining` and
      // written back to localStorage, so synced chunks aren't re-sent while the
      // rest waits for the next interval. The React-state queue is always cleared
      // because every pending row is now represented in `remaining`.
      const remaining = [];
      let blocked = false;
      let synced = 0;
      for (const chunk of chunkArray(dedupedExpenseQueue)) {
        if (blocked) { remaining.push(...chunk); continue; }
        const { ok, authError } = await runSyncChunk(
          () => supabase.from('expenses').upsert(chunk, { onConflict: 'local_id' })
        );
        if (ok) {
          synced += chunk.length;
        } else {
          if (authError) hasAuthError = true;
          blocked = true;
          remaining.push(...chunk);
        }
      }
      if (clearExpenseQueue) clearExpenseQueue();
      localStorage.setItem('tinypos_expense_queue', JSON.stringify(remaining));
      if (synced > 0) console.log(`☁️ Synced ${synced} offline expenses.`);
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
          } else if (update.type === 'active_ticket_update') {
            const { error: err } = await supabase.from('active_tickets').update(update.data).eq('id', update.ticket_id);
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

    // 5. Sync WhatsApp Queue (chunked, same partial-progress shape as expenses).
    const waQueue = JSON.parse(localStorage.getItem('tinypos_wa_queue') || '[]');
    if (waQueue.length > 0) {
      const remaining = [];
      let blocked = false;
      let synced = 0;
      for (const chunk of chunkArray(waQueue)) {
        if (blocked) { remaining.push(...chunk); continue; }
        const { ok, authError } = await runSyncChunk(
          () => supabase.from('whatsapp_queue').upsert(chunk, { onConflict: 'id' })
        );
        if (ok) {
          synced += chunk.length;
        } else {
          if (authError) hasAuthError = true;
          blocked = true;
          remaining.push(...chunk);
        }
      }
      localStorage.setItem('tinypos_wa_queue', JSON.stringify(remaining));
      if (synced > 0) console.log(`☁️ Synced ${synced} WhatsApp receipts.`);
    }

  } catch (err) {
    console.error("Global background sync error:", err);
  }

  return hasAuthError;
};