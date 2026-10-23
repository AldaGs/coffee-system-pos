// Inventory writes for both modes: cloud writes go to Supabase and are mirrored
// into Dexie; local ('guest') mode writes only to Dexie with the same row shape.
import { canReachCloud, returnToNewestLot } from '../../../services/inventoryService';
import { db } from '../../../db';
import { isCloudReachable } from '../../../utils/network';
import { isLocalMode } from '../../../utils/appMode';
import { supabase } from '../../../supabaseClient';

export async function persistInventory(payload, id) {
  if (isLocalMode()) {
    // Merge onto the existing row for partial updates (Dexie put replaces the
    // whole record, unlike a Supabase column update).
    const existing = id != null ? (await db.inventory.get(id)) : null;
    const row = { ...(existing || {}), ...payload, id: id ?? Date.now() };
    await db.inventory.put(row);
    return row;
  }
  const q = id != null
    ? supabase.from('inventory').update(payload).eq('id', id).select()
    : supabase.from('inventory').insert([payload]).select();
  const { data, error } = await q;
  if (error) throw error;
  await db.inventory.put(data[0]);
  return data[0];
}

export async function persistInventoryLog(log) {
  if (isLocalMode()) { await db.inventory_logs.add(log); return; }
  const { error } = await supabase.from('inventory_logs').insert([log]);
  if (error) throw error;
}

// Local date (yyyy-mm-dd) for the <input type="date"> defaults — NOT UTC, so the
// picker never shows "yesterday" for an evening roast.
export function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// Build + persist a lot for `itemName` and return it. Shared by the transform,
// receive, restock and manual "add batch" (backfill) flows so every entry point
// writes an identical row shape.
export async function registerLot({ itemName, qty, unit, unitCost, madeDate, receivedDate, sourceName }) {
  const made = madeDate || todayStr();
  const lot = {
    id: crypto.randomUUID(),
    item_name: itemName,
    lot_code: await nextLotCode(itemName, made),
    made_date: made,
    received_date: receivedDate || made,
    qty_received: qty,
    qty_remaining: qty,
    unit: unit || null,
    unit_cost: unitCost || 0,
    source_name: sourceName || null,
    notes: null,
    local_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  await persistLot(lot);
  return lot;
}

// Audit corrections: a loss comes off the oldest lot (consumeLotsFIFO, as a sale
// does); a found surplus tops up the newest lot, so lot totals track the audited stock.
export async function topUpNewestLot(itemName, qty, unit, unitCost) {
  const landed = await returnToNewestLot(itemName, qty);
  // No lots at all yet: open one so the surplus is still traceable.
  if (!landed) await registerLot({ itemName, qty, unit, unitCost, madeDate: todayStr() });
}

// A lot is one received/produced batch of a lot-tracked item (roasted coffee,
// in-house syrup, prepped food). Offline-first: always mirror to Dexie; in cloud
// mode also push to Supabase, keeping the local row if the push fails so nothing
// is lost (a later fetch reconciles). Same id in both stores (client UUID).
export async function persistLot(lot) {
  // Mark it pending until the cloud copy lands. In local ('guest') mode there is
  // no cloud, so nothing is ever pending. Offline in cloud mode the flag is what
  // lets syncService push the lot later — without it, lots created offline never
  // reached the cloud at all.
  const pending = !isLocalMode();
  await db.inventory_lots.put({ ...lot, pending_sync: pending });
  if (!canReachCloud()) return;
  try {
    const { error } = await supabase.from('inventory_lots').insert([lot]);
    if (error) throw error;
    await db.inventory_lots.update(lot.id, { pending_sync: false });
  } catch (e) {
    console.warn('inventory_lots cloud insert deferred (kept local):', e?.message);
  }
}

// Human-readable batch code: L-<made date>-<letter>, the letter distinguishing
// multiple lots of the same item roasted/made on the same day (A, B, C…).
export async function nextLotCode(itemName, madeDate) {
  let sameDay = 0;
  try {
    sameDay = await db.inventory_lots
      .where('item_name').equals(itemName)
      .filter(l => l.made_date === madeDate).count();
  } catch { /* index/store may be mid-upgrade — fall back to suffix A */ }
  return `L-${madeDate}-${String.fromCharCode(65 + (sameDay % 26))}`;
}

export async function persistInventoryExpense(expense) {
  // Every expense needs a stable local_id. The offline sync flushes the expense
  // queue with upsert(onConflict: 'local_id'); rows without one collide on a
  // shared null key and Postgres rejects the whole batch (21000). It's also the
  // dedup key between this local write and any later cloud retry. The other
  // expense paths (useExpenses, expenseLedger) already set it — this one didn't.
  const withId = { ...expense, local_id: expense.local_id || crypto.randomUUID() };
  if (isLocalMode()) {
    await db.expenses.put({
      ...withId,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      cashierId: 'inventory',
    });
    return;
  }
  try {
    if (!isCloudReachable()) throw new Error('Device is offline');
    const { error } = await supabase.from('expenses').insert([withId]);
    if (error) throw error;
  } catch (err) {
    // Don't silently drop the cost: queue it for the background sync to retry,
    // the same way a failed register expense does. Under degraded auth the
    // direct insert can fail, and without this the roast/restock cost is lost
    // from the cloud entirely (tinybooks never sees it). carries its local_id
    // so the retry upsert is idempotent.
    console.warn('Cloud inventory expense failed. Moving to offline queue.', {
      code: err?.code, status: err?.status, message: err?.message,
    });
    const q = JSON.parse(localStorage.getItem('tinypos_expense_queue') || '[]');
    q.push(withId);
    localStorage.setItem('tinypos_expense_queue', JSON.stringify(q));
  }
}

// Human-readable tag for how an inventory cost was paid, appended to the
// expense reason so each pocket is legible in the raw ledger: "[Banco]" →
// business bank account; "[Dueño]" → the owner's own money (an equity
// contribution, kept separate from the bank); otherwise Caja (petty cash, no
// tag). This is cosmetic only — the authoritative signal is the
// `payment_source` column on the expense (see migration 028), which the cash
// drawer Corte keys off. Shared by the receive, restock and transform flows.
export function paymentTag(paymentSource) {
  if (paymentSource === 'banco') return ' [Banco]';
  if (paymentSource === 'dueno') return ' [Dueño]';
  return '';
}

// Stock at or below which an item should be reordered. A per-item
// `reorder_point` (migration 026) takes precedence; when it's unset (0) we fall
// back to the legacy heuristic (2000 for grams, 10 otherwise) so existing
// installs keep their prior low-stock behavior.
