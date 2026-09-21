import { supabase } from '../supabaseClient';
import { db } from '../db';
import { isLocalMode } from '../utils/appMode';
import { isCloudReachable } from '../utils/network';
import { chunkArray, runSyncChunk } from '../utils/syncBatch';

// How many times a single updateQueue row is retried before it is treated as
// stuck. A row that fails this often is not going to drain on its own — it needs
// a human (or a server-side fix) — so we stop spending a request on it every
// interval and surface it instead. The row itself is never discarded: it holds
// cashier-entered data, and dropping it silently is the failure mode this whole
// change exists to remove.
export const MAX_UPDATE_ATTEMPTS = 5;

// Record a failed attempt on a queued update, keeping the payload intact.
// Dexie stores are schemaless per row, so these fields need no version bump.
const markUpdateFailed = async (update, error) => {
  const attempts = (update.attempts || 0) + 1;
  try {
    await db.updateQueue.update(update.id, {
      attempts,
      last_error: `${error?.code || error?.status || 'error'}: ${error?.message || 'unknown'}`,
      last_attempt_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to record updateQueue failure:', err);
  }
  if (attempts >= MAX_UPDATE_ATTEMPTS) {
    console.error(
      `updateQueue row ${update.id} (${update.type}) stuck after ${attempts} attempts:`,
      error?.message || error
    );
  }
};

// Returns { authError, stuck } — `stuck` is the number of queued updates that
// have exhausted MAX_UPDATE_ATTEMPTS and will not drain without intervention.
export const attemptBackgroundSync = async (expenseQueue, clearExpenseQueue) => {
  // Local ('guest') mode has no cloud project to sync to — data lives only in
  // Dexie. No-op so the interval/online listener never touch a null client.
  if (isLocalMode() || !supabase) return { authError: false, stuck: 0 };

  // Don't try if we are offline — or if the cloud is known-unreachable (a slow
  // link that already tripped the breaker). Retrying here would just stall the
  // whole sync batch behind one timeout.
  if (!isCloudReachable()) return { authError: false, stuck: 0 };

  let hasAuthError = false;
  let stuckUpdates = 0;

  try {
    // Check if we have a valid session before starting
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !session) {
      console.warn("Background sync skipped: No active session or session error.", sessionErr?.message);
      return {
        authError: (sessionErr?.status === 400 || sessionErr?.status === 401),
        stuck: 0
      };
    }

    // 1. Sync Sales (Pulling directly from Dexie). Chunked so a big backlog can't
    // blow the deadline as one giant upsert, and so each landed chunk clears from
    // the queue independently — partial progress survives a mid-batch stall.
    const pendingSales = await db.syncQueue.toArray();
    if (pendingSales.length > 0) {
      let synced = 0;
      for (const chunk of chunkArray(pendingSales)) {
        // Strip the local Dexie ID from the payload; keep it to delete on success.
        const cleanSales = chunk.map(({ id: _UNUSED, ...rest }) => rest);
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

        if (cleanLog.deduction_type === 'sale' || cleanLog.deduction_type === 'refund_return' || cleanLog.deduction_type === 'checkout_rollback') {
          const itemId = nameToId.get(cleanLog.item_name);
          if (!itemId) {
            // No cloud inventory row with this name (renamed or deleted since
            // the sale). Deleting the log here would drop the movement on the
            // floor and drift the cloud count forever, so keep it queued and
            // make the mismatch loud — renaming the item back, or recreating it,
            // lets the next run apply it.
            console.error(`Inventory log kept: no cloud inventory item named "${cleanLog.item_name}"`);
            continue;
          }
          {
            // Idempotent deduction keyed on this log's local_id: if the online
            // checkout (or an earlier replay) already applied it — including the
            // "committed but timed out" case that requeued the sale — the server
            // has claimed the id and this call decrements nothing. Prevents the
            // slow-link double-count. Requires schema >= 1.1 (deduct_inventory_log).
            // A negative qty_deducted is stock coming BACK (a refund return or
            // a rolled-back checkout, same convention restock/added use), so it
            // routes to the restock RPC instead. Both claim the log's local_id
            // exactly once, so replaying either is a no-op.
            const qty = Number(cleanLog.qty_deducted);
            const { data: rpcData, error: rpcErr } = qty < 0
              ? await supabase.rpc('restock_inventory_log', {
                  p_local_id: cleanLog.local_id,
                  p_item_id: Number(itemId),
                  p_qty: Math.abs(qty)
                })
              : await supabase.rpc('deduct_inventory_log', {
                  p_local_id: cleanLog.local_id,
                  p_item_id: Number(itemId),
                  p_qty: qty
                });
            if (rpcErr) {
              console.error("RPC deduct failed:", rpcErr);
              if (rpcErr.status === 400 || rpcErr.status === 401) hasAuthError = true;
              continue;
            }
            // No row back from a deduction = cloud stock is short of what this
            // (offline) sale took. Nothing was decremented and, from schema 1.5,
            // the local_id stays unclaimed — so keep the log queued; it applies
            // once the item is restocked instead of being dropped for good.
            if (qty >= 0 && (!rpcData || rpcData.length === 0)) {
              console.error(`Inventory log kept: cloud stock too low to deduct ${qty} of "${cleanLog.item_name}"`);
              continue;
            }
          }
        }

        await db.inventory_logs.delete(dexieId);
        processed++;
      }
      if (processed > 0) console.log(`☁️ Synced ${processed} inventory logs.`);
    }

    // 3b. Sync Lots + Lot Consumptions.
    // These were previously best-effort-only: a lot created or drawn down while
    // offline lived in Dexie forever and the cloud registry drifted. Rows whose
    // cloud write didn't land carry pending_sync, and are pushed here with the
    // same upsert-on-local_id idempotency the other ledgers use.
    try {
      const pendingLots = (await db.inventory_lots.toArray()).filter(l => l.pending_sync);
      for (const lot of pendingLots) {
        const { pending_sync: _UNUSED, ...cloudRow } = lot;
        const { error } = await supabase.from('inventory_lots').upsert([cloudRow], { onConflict: 'id' });
        if (error) {
          if (error.status === 400 || error.status === 401) hasAuthError = true;
          break;
        }
        await db.inventory_lots.update(lot.id, { pending_sync: false });
      }

      const pendingConsumptions = (await db.lot_consumptions.toArray()).filter(c => c.pending_sync);
      for (const row of pendingConsumptions) {
        const { pending_sync: _UNUSED, ...cloudRow } = row;
        const { error } = await supabase.from('lot_consumptions').upsert([cloudRow], { onConflict: 'id' });
        if (error) {
          if (error.status === 400 || error.status === 401) hasAuthError = true;
          break;
        }
        await db.lot_consumptions.update(row.id, { pending_sync: false });
      }

      const lotCount = pendingLots.length + pendingConsumptions.length;
      if (lotCount > 0) console.log(`☁️ Pushed ${lotCount} pending lot rows.`);
    } catch (err) {
      // Lots are traceability, not stock: never let them block the rest of sync.
      console.warn('Lot sync skipped:', err?.message);
    }

    // 4. Sync Updates (Refunds, Loyalty, Deletions)
    //
    // Rows drain in insertion order, which matters: an `active_ticket_upsert`
    // queued when a ticket's INSERT failed must replay before the patches that
    // were queued behind it.
    const pendingUpdates = await db.updateQueue.toArray();
    if (pendingUpdates.length > 0) {
      for (const update of pendingUpdates) {
        // Already past the attempt cap: leave the row untouched (it still holds
        // the cashier's data) and just keep it counted as stuck.
        if ((update.attempts || 0) >= MAX_UPDATE_ATTEMPTS) { stuckUpdates++; continue; }

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
          } else if (update.type === 'active_ticket_upsert') {
            const { error: err } = await supabase
              .from('active_tickets').upsert([update.data], { onConflict: 'id' });
            error = err;
          } else {
            // Unrecognised type. Falling through with `error === null` would
            // DELETE the row and lose whatever it was carrying, so treat it as
            // a failure and let the attempt cap surface it instead.
            error = { message: `unknown updateQueue type "${update.type}"` };
          }

          if (!error) {
            await db.updateQueue.delete(update.id);
          } else if (error.status === 400 || error.status === 401) {
            hasAuthError = true;
          } else {
            // Anything else (a 404 from a trigger raising inside the write, a
            // 5xx, a stale schema cache) used to leave the row queued with no
            // record that it had failed — so it retried every 60s forever while
            // the Pending Sync card reported success. Count the attempts and
            // keep the last error on the row: the data is still preserved, but
            // a genuinely stuck row now stops burning requests and can be shown
            // to the user with the reason attached.
            await markUpdateFailed(update, error);
            if ((update.attempts || 0) + 1 >= MAX_UPDATE_ATTEMPTS) stuckUpdates++;
          }
        } catch (updateErr) {
          console.error("Failed to sync update:", updateErr);
          await markUpdateFailed(update, updateErr);
          if ((update.attempts || 0) + 1 >= MAX_UPDATE_ATTEMPTS) stuckUpdates++;
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

  return { authError: hasAuthError, stuck: stuckUpdates };
};