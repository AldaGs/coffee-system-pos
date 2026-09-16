// Shared stock movement primitives.
//
// Deduction (sales) lives in checkoutService; everything that ADDS stock back —
// a refund return, a rolled-back checkout — plus the lot (roast batch) helpers
// that both sides need live here, so the FIFO draw-down and the cloud/Dexie
// write rules exist once instead of once per caller.

import { supabase } from '../supabaseClient';
import { db } from '../db';
import { isLocalMode } from '../utils/appMode';
import { isCloudReachable } from '../utils/network';

// Cloud writes are possible only when there IS a cloud and it's reachable.
// Everything below still writes Dexie unconditionally and marks the row
// pending_sync when the cloud half didn't land, so syncService can retry.
export const canReachCloud = () => !isLocalMode() && isCloudReachable();

// ---------------------------------------------------------------------------
// Lots (roast / production batches)
// ---------------------------------------------------------------------------

// Lots of `itemName` that still have stock, oldest roast first. made_date is the
// FIFO key (when it was roasted), created_at breaks ties for same-day lots.
export async function openLotsFIFO(itemName) {
  const rows = await db.inventory_lots.where('item_name').equals(itemName).toArray();
  return rows
    .filter(l => (Number(l.qty_remaining) || 0) > 0)
    .sort((a, b) =>
      String(a.made_date || '').localeCompare(String(b.made_date || '')) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

// Write a lot's new remaining qty to Dexie, then best-effort to the cloud. A
// failed (or skipped, when offline) cloud write flags the row pending_sync so
// syncService pushes it later — without that flag the cloud lot registry
// silently drifted from the device forever.
export async function setLotRemaining(lotId, newRemaining) {
  await db.inventory_lots.update(lotId, { qty_remaining: newRemaining, pending_sync: true });
  if (!canReachCloud()) return false;
  try {
    const { error } = await supabase.from('inventory_lots').update({ qty_remaining: newRemaining }).eq('id', lotId);
    if (error) throw error;
    await db.inventory_lots.update(lotId, { pending_sync: false });
    return true;
  } catch (e) {
    console.warn('lot remaining cloud update deferred:', e?.message);
    return false;
  }
}

// Consume `qty` of an item from its lots, oldest first. `onTake(lot, take)` is
// awaited for each lot touched, so callers can record what came from where
// (checkout writes a lot_consumptions row; the audit path doesn't need to).
// Returns the amount that could NOT be attributed — stock that predates lot
// tracking. That's not an error: stock counts are owned by inventory.current_stock.
export async function consumeLotsFIFO(itemName, qty, onTake) {
  let toConsume = Number(qty) || 0;
  if (toConsume <= 0) return 0;

  for (const lot of await openLotsFIFO(itemName)) {
    if (toConsume <= 0) break;
    const take = Math.min(Number(lot.qty_remaining) || 0, toConsume);
    if (take <= 0) continue;
    const newRemaining = Math.max(0, Number((lot.qty_remaining - take).toFixed(6)));
    if (onTake) await onTake(lot, take);
    await setLotRemaining(lot.id, newRemaining);
    lot.qty_remaining = newRemaining;
    toConsume -= take;
  }
  return toConsume;
}

// Put `qty` back on the newest lot. Used when stock returns and the originating
// roast is unknown or not worth tracing (audit surplus, refund return), keeping
// sum(lot remaining) aligned with the stock count.
export async function returnToNewestLot(itemName, qty) {
  const lots = (await db.inventory_lots.where('item_name').equals(itemName).toArray())
    .sort((a, b) =>
      String(b.made_date || '').localeCompare(String(a.made_date || '')) ||
      String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const newest = lots[0];
  if (!newest) return false;
  await setLotRemaining(newest.id, Number(((Number(newest.qty_remaining) || 0) + (Number(qty) || 0)).toFixed(6)));
  return true;
}

// ---------------------------------------------------------------------------
// Adding stock back
// ---------------------------------------------------------------------------

/**
 * Add stock back for a set of {name, qty, unit_cost} movements and write the
 * matching inventory_logs rows (negative qty_deducted = an addition, the
 * convention restock/added/transform_in already use).
 *
 * Idempotent per movement: each carries a local_id claimed once by
 * restock_inventory_log, so a retry — a replayed queue entry, a double tap —
 * can't inflate stock. Offline, the log row stays in Dexie and syncService
 * applies the cloud half later, exactly like a sale deduction.
 *
 * `restoreLots` tops the newest lot back up for lot-tracked items; checkout
 * rollback passes false because the sale's own lot consumption is reversed by
 * its caller.
 */
export async function restoreInventory({ movements, deductionType, ticketId, restoreLots = true }) {
  if (!movements?.length) return { restored: [], failed: [] };

  const online = canReachCloud();
  const inventory = await db.inventory.toArray();
  const timestamp = new Date().toISOString();
  const restored = [];
  const failed = [];

  for (const mv of movements) {
    const qty = Number(mv.qty) || 0;
    if (qty <= 0) continue;

    const invItem = inventory.find(i => String(i.id) === String(mv.id))
      || inventory.find(i => i.name === mv.name);
    if (!invItem) {
      // The item was deleted since the sale. Nothing to add back to, but the
      // operator should not be told stock returned when it didn't.
      failed.push({ name: mv.name, reason: 'item-not-found' });
      continue;
    }

    const localId = mv.local_id || crypto.randomUUID();
    const log = {
      item_name: invItem.name,
      qty_deducted: -qty,
      deduction_type: deductionType,
      created_at: timestamp,
      ticket_id: ticketId ? String(ticketId) : null,
      unit_cost: invItem.unit_cost || 0,
      local_id: localId,
    };

    let cloudApplied = false;
    if (online) {
      try {
        const { error } = await supabase.rpc('restock_inventory_log', {
          p_local_id: localId,
          p_item_id: Number(invItem.id),
          p_qty: qty,
        });
        if (error) throw error;
        const { error: logErr } = await supabase.from('inventory_logs').upsert([log], { onConflict: 'local_id' });
        if (logErr) throw logErr;
        cloudApplied = true;
      } catch (e) {
        console.warn('Stock restore cloud write deferred:', e?.message);
      }
    }

    // Dexie mirror always moves; when the cloud half didn't land the log stays
    // queued in inventory_logs so the background sync applies it (the RPC's
    // local_id claim keeps that safe even if the cloud write actually did land).
    const newStock = (Number(invItem.current_stock) || 0) + qty;
    await db.inventory.update(invItem.id, { current_stock: newStock });
    invItem.current_stock = newStock;
    if (!cloudApplied) await db.inventory_logs.put(log);

    if (restoreLots && invItem.track_lots) {
      try { await returnToNewestLot(invItem.name, qty); }
      catch (e) { console.warn('Lot restore skipped:', e?.message); }
    }

    restored.push({ name: invItem.name, qty });
  }

  return { restored, failed };
}
