import { supabase } from '../supabaseClient';
import { db } from '../db';
import { computeStarsForTicket } from '../hooks/useLoyalty';
import { recordTipAccrual } from './tipsService';
import { isLocalMode } from '../utils/appMode';
import { isCloudReachable } from '../utils/network';
import { useUpgradeNagStore } from '../store/useUpgradeNagStore';
import { calculateItemizedTaxBreakdown } from '../utils/posMath';
import { buildDeductionPlan, aggregateDeductions, describeUnresolved } from '../utils/inventoryMath';
import { restoreInventory, consumeLotsFIFO, setLotRemaining } from './inventoryService';

// Pre-flight stock check against local Dexie inventory. Shares buildDeductionPlan
// with the real deduction below, so the check can no longer disagree with what
// checkout actually consumes. Online RPC is still the source of truth and will
// throw later if local state is stale.
export const validateStockLocally = async ({ activeTicket, recipes }) => {
  if (!activeTicket?.items?.length) return null;
  const inventory = await db.inventory.toArray();
  const { deductions } = buildDeductionPlan({ items: activeTicket.items, recipes, inventory });

  for (const [id, qty] of aggregateDeductions(deductions)) {
    const inv = inventory.find(i => String(i.id) === id);
    if (inv && (inv.current_stock ?? 0) < qty) {
      return `Insufficient stock for ${inv.name}`;
    }
  }
  return null;
};

// FIFO roast/production lot draw-down — the sale -> roast link (schema >= 1.3).
//
// Runs once, AFTER the stock deduction loop has fully succeeded, driven by the
// same inventoryLogsToPush array that already aggregates every sale deduction
// (item_name + qty + ticket_id + local_id). For each lot-tracked item sold, it
// consumes the oldest roast lot first (FIFO by made_date), decrements
// inventory_lots.qty_remaining and writes a lot_consumptions row per lot touched.
//
// Deliberately additive and best-effort: it NEVER throws into checkout (the
// caller wraps it in its own try/catch too), so a missing schema, an empty lot
// registry, or a cloud hiccup can't block or reverse a sale. Stock counts stay
// owned by inventory.current_stock / deduct_inventory_log; this only attributes
// which roast the bags came from. If a lot-tracked item outruns its lots (stock
// that predates lot tracking), the remainder is simply left unattributed.
//
// Lots are read from Dexie (the offline-first mirror), so on a single-register
// setup — the roaster's own shop — this is exact. Multi-device installs where
// lots were created on another device that hasn't synced into this Dexie yet may
// under-attribute; stock is still correct.
async function applyLotConsumption(logs, inventory, isOnline) {
  for (const log of logs) {
    if (log.deduction_type !== 'sale') continue;
    const toConsume = Number(log.qty_deducted) || 0;
    if (toConsume <= 0) continue;

    const invItem = inventory.find(i => i.name === log.item_name);
    if (!invItem || !invItem.track_lots) continue;

    // consumeLotsFIFO owns the ordering and the Dexie/cloud write rules (shared
    // with the Audit reconciliation in InventoryTab); we only record which lot
    // each bag came from. A lot update that can't reach the cloud is flagged
    // pending_sync in there and pushed by the background sync later.
    await consumeLotsFIFO(log.item_name, toConsume, async (lot, take) => {
      const consumption = {
        id: crypto.randomUUID(),
        lot_id: lot.id,
        lot_code: lot.lot_code || null,
        item_name: log.item_name,
        qty: take,
        ticket_id: log.ticket_id,
        deduction_local_id: log.local_id,
        created_at: log.created_at,
        local_id: crypto.randomUUID(),
        pending_sync: true,
      };

      await db.lot_consumptions.put(consumption);

      if (isOnline) {
        try {
          const { pending_sync: _UNUSED, ...cloudRow } = consumption;
          const { error: cErr } = await supabase.from('lot_consumptions').insert([cloudRow]);
          if (cErr) throw cErr;
          await db.lot_consumptions.update(consumption.id, { pending_sync: false });
        } catch (e) {
          console.warn('lot consumption cloud write deferred (kept local):', e?.message);
        }
      }
    });
  }
}

// Undo the deductions this checkout already applied, when a later one fails.
// Without this, a ticket that dies partway through (item 3 out of stock) left
// items 1-2 permanently deducted for a sale that errored out.
async function rollbackDeductions(logs, ticketId) {
  if (!logs.length) return;
  try {
    // Reverse each applied log's stock, and take the returned units back off the
    // lots they were attributed to, so lot remainders match the restored stock.
    for (const log of logs) {
      const rows = await db.lot_consumptions.where('deduction_local_id').equals(log.local_id).toArray();
      for (const row of rows) {
        const lot = await db.inventory_lots.get(row.lot_id);
        if (lot) await setLotRemaining(lot.id, Number(((Number(lot.qty_remaining) || 0) + (Number(row.qty) || 0)).toFixed(6)));
        await db.lot_consumptions.delete(row.id);
      }
    }
    await restoreInventory({
      movements: logs.map(l => ({ name: l.item_name, qty: l.qty_deducted })),
      deductionType: 'checkout_rollback',
      ticketId,
      restoreLots: false,
    });
  } catch (e) {
    // A failed rollback must not mask the original checkout error.
    console.error('Deduction rollback failed — stock may be short by the partial deduction:', e?.message);
  }
}

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
  //
  // isCloudReachable() (not bare navigator.onLine) means a connection already
  // known to be slow/half-open — the breaker is open — skips the cloud path
  // entirely and records the sale locally in ~0ms, exactly like airplane mode.
  const isOnline = !isLocalMode() && isCloudReachable();

  // Loyalty accrual: if a phone is attached to this ticket AND the loyalty program
  // qualifies the cart, award stars on the sale row. A server-side trigger
  // (trg_award_loyalty) increments customers.visits exactly once on INSERT and
  // short-circuits when no stars move, so it's a no-op for the non-stamp case
  // below. Retries via upsert(onConflict: local_id) do NOT re-fire the trigger.
  const loyaltyPhone = activeTicket?.loyalty_phone || null;
  const loyaltyActive = loyaltySettings?.isActive === true || loyaltySettings?.isActive === "true";
  const loyaltyStars = (loyaltyPhone && loyaltyActive)
    ? computeStarsForTicket(activeTicket, loyaltySettings)
    : 0;
  const loyaltyRedeemed = loyaltyPhone ? (activeTicket?.loyalty_stars_pending || 0) : 0;

  // IVA breakdown for the books (tinybooks ingests sales.tax_amount instead of
  // assuming a flat 16%). Each item carries an ivaTreatment from its menu_item
  // (stored in the item's data jsonb): 'iva16' = prepared/served, taxed at 16%;
  // 'tasa0' / 'exento' = unprepared food (e.g. ground coffee) -> no IVA charged.
  // MX prices are tax-INCLUSIVE, so the IVA is carved out of the line, not added.
  // We compute on raw line totals then scale by any ticket-level discount so the
  // taxable base tracks what was actually charged (centsTotal excludes the tip).
  const { tax: centsTax, taxable: centsTaxable } =
    calculateItemizedTaxBreakdown(activeTicket.items, centsTotal, 16);

  // 1. Build the CLOUD Data specifically matching your Supabase columns
  const currentSale = {
    total_amount: centsTotal,
    tax_amount: centsTax,
    taxable_amount: centsTaxable,
    payment_method: masterMethodString,
    splits: isSplit ? paymentsArray.map(p => ({ ...p, amount: p.amount })) : null,
    tip_amount: centsTip,
    tip_refunded: 0,
    items_sold: activeTicket.items.map(item => item.name),
    items: activeTicket.items.map(item => ({ ...item, price: item.basePrice })),
    discount: activeTicket.discount || activeTicket.autoDiscountRuleName ? {
      ...(activeTicket.discount || {}),
      autoRuleName: activeTicket.autoDiscountRuleName || null,
      autoRuleNames: activeTicket.autoDiscountRuleNames
        || (activeTicket.autoDiscountRuleName ? [activeTicket.autoDiscountRuleName] : null),
      autoBreakdown: activeTicket.appliedDiscountBreakdown || null,
      autoDiscountAmount: activeTicket.autoDiscountAmount || 0,
      manualDiscountAmount: activeTicket.manualDiscountAmount || 0
    } : null, // Discount info for re-sharing
    cashier_name: activeCashier?.name || 'Unknown Cashier',
    order_name: activeTicket.name || null,
    ticket_id: String(activeTicket.id),
    local_id: localId,
    // Attribute the sale to whoever is identified on the ticket — including a
    // member captured only for a membership-gated discount (stars = 0). The
    // stamp audit keys off the star columns, not this field, so a zero-star
    // attribution doesn't read as a loyalty visit.
    loyalty_phone: loyaltyPhone,
    loyalty_stars_awarded: loyaltyStars,
    loyalty_stars_redeemed: loyaltyRedeemed,
    loyalty_program_type: (loyaltyStars > 0 || loyaltyRedeemed > 0) ? (loyaltySettings?.programType || 'multiple') : null
  };

  // --- PREPARE THE DATA ---
  const finalizedSale = { ...currentSale, created_at: new Date().toISOString(), status: 'completed' };
  const inventoryLogsToPush = [];
  // Ticket lines whose inventory target couldn't be resolved. Collected during
  // the deduction and handed back to the caller so the cashier is told the sale
  // went through but stock did NOT move for these.
  let unresolvedTargets = [];
  // Set when the stock deduction failed and was rolled back. The sale itself is
  // still recorded (it's in syncQueue), only inventory didn't move.
  let deductionError = null;

  try {
    // Immediately save to local Dexie
    await db.sales.add(finalizedSale);

    // Fetch local inventory for instant offline deduction
    const currentInventory = await db.inventory.toArray();
    const timestamp = finalizedSale.created_at;

    // --- INVENTORY DEDUCTION ENGINE ---
    // buildDeductionPlan resolves the whole ticket (standard items, recipe BOMs,
    // modifier additions and substitutions) into a flat list of real inventory
    // rows to decrement. It is the same function the pre-flight check ran, so
    // what was validated is exactly what is deducted.
    const { deductions, unresolved } = buildDeductionPlan({
      items: activeTicket.items,
      recipes,
      inventory: currentInventory,
    });

    // A line that points at an inventory item which no longer exists (stale
    // linkedWarehouseId after a re-link, renamed recipe ingredient, orphaned
    // substitution) used to fall through silently — the item sold and stock
    // never moved, with nothing to show for it. The sale still completes (the
    // customer paid; blocking here would strand the ticket), but it is recorded
    // and surfaced to the cashier so the drift is visible the day it happens.
    if (unresolved.length > 0) {
      unresolvedTargets = unresolved;
      console.error('Inventory targets not found — stock NOT moved for:', describeUnresolved(unresolved));
      try {
        // Only columns that exist on the cloud inventory_logs table — an extra
        // key would make the sync upsert fail and jam the whole queue behind it.
        // The detail rides in item_name, which is what the history view shows.
        await db.inventory_logs.add({
          item_name: describeUnresolved(unresolved).slice(0, 300),
          qty_deducted: 0,
          deduction_type: 'unresolved_target',
          created_at: timestamp,
          ticket_id: String(activeTicket.id),
          unit_cost: 0,
          local_id: crypto.randomUUID(),
        });
      } catch (e) { console.warn('unresolved-target log skipped:', e?.message); }
    }

    for (const d of deductions) {
      // Generate the log's local_id up front and bind the deduction to it, so
      // if this sale later times out and is requeued the replay reuses the same
      // id and the server dedups instead of decrementing a second time.
      const logId = crypto.randomUUID();

      if (isOnline) {
        const { data, error } = await supabase.rpc('deduct_inventory_log', {
          p_local_id: logId,
          p_item_id: Number(d.id),
          p_qty: d.qty,
        });
        if (error) throw new Error(`RPC error deducting ${d.name}: ${error.message}`);
        if (!data || data.length === 0) throw new Error(`Insufficient stock for ${d.name}`);
        // out_found distinguishes "no such item" from "not enough stock" (schema
        // >= 1.4). Older servers don't return the column; undefined means the
        // row came back the old way and the deduction landed.
        if (data[0]?.out_found === false) {
          throw new Error(`RPC error deducting ${d.name}: item no longer exists in inventory`);
        }
      }

      inventoryLogsToPush.push({
        item_name: d.name,
        qty_deducted: d.qty,
        deduction_type: 'sale',
        created_at: timestamp,
        ticket_id: String(activeTicket.id),
        unit_cost: d.unit_cost,
        local_id: logId,
      });

      const invRow = currentInventory.find(i => String(i.id) === String(d.id));
      const newStock = (Number(invRow?.current_stock) || 0) - d.qty;
      await db.inventory.update(d.id, { current_stock: newStock });
      if (invRow) invRow.current_stock = newStock;
    }

    // --- FIFO ROAST/LOT DRAW-DOWN (additive, best-effort) ---
    // Attribute each lot-tracked bag sold to the roast it came from. Isolated so
    // a lot/schema issue can never disturb the sale or its stock deduction.
    try {
      await applyLotConsumption(inventoryLogsToPush, currentInventory, isOnline);
    } catch (e) {
      console.warn('lot consumption skipped:', e?.message);
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
    const msg = error?.message || '';

    // Distinguish two very different failures that both land here:
    //  - A DEDUCTION failure — insufficient stock, or the deduct_inventory_log
    //    RPC erroring (missing function, permission, bad signature). Stock was
    //    NOT decremented and sync replay does NOT re-run the deduct RPC, so this
    //    can't be quietly deferred: it must reach the cashier, or the sale looks
    //    successful while inventory (and roast-lot) tracking silently drift.
    //  - A benign cloud/offline sync deferral (the sales/inventory_logs upserts
    //    failing because the link is down). The offline syncQueue + PendingSyncCard
    //    resolve these, so they stay quiet as before.
    const isDeductionFailure = msg.includes('Insufficient stock') || msg.includes('RPC error deducting');
    if (isDeductionFailure) {
      console.error('Checkout deduction failed:', msg);
      // The deduction loop dies on the FIRST failure, so anything already in
      // inventoryLogsToPush was decremented for a sale that is now failing.
      // Put it back before surfacing the error, and don't queue those logs (the
      // rollback wrote its own reversal rows).
      await rollbackDeductions(inventoryLogsToPush, activeTicket.id);
      inventoryLogsToPush.length = 0;
    } else {
      console.warn('Cloud sync deferred:', msg);
    }

    // The sale is queued either way: the money was taken, so the sale row is
    // real regardless of what inventory did. Only the stock movement is undone.
    const { id: _UNUSED, ...safeOfflineSale } = finalizedSale;
    await db.syncQueue.add(safeOfflineSale);
    if (inventoryLogsToPush.length > 0) {
      await db.inventory_logs.bulkPut(inventoryLogsToPush);
    }

    // Don't throw: the sale is recorded, so the tip, loyalty, discount-usage and
    // activity records below must still run. The caller tells the cashier the
    // sale was saved but stock didn't move (so they don't ring it up twice).
    if (isDeductionFailure) deductionError = msg;
  }

  // Local ('guest') mode loyalty: the cloud trg_award_loyalty trigger doesn't
  // run here, so replicate its effect against the Dexie `customers` store —
  // keyed by phone, same shape that migrates to the cloud table on upgrade.
  // Mirror the trigger's short-circuit: only touch the store when stars move,
  // so a zero-star member attribution doesn't run a redundant visit rewrite
  // (capture already recorded the customer via handleAttachCustomer).
  if (isLocalMode() && currentSale.loyalty_phone && (loyaltyStars > 0 || loyaltyRedeemed > 0)) {
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

  // Local-mode growth loop: count this sale toward the upgrade nudge. No-ops in
  // cloud mode (recordEvent short-circuits), so it's safe to call unconditionally.
  useUpgradeNagStore.getState().trigger('sales_completed');

  return { localAnalyticsRecord: finalizedSale, masterMethodString, unresolvedTargets, deductionError };
};

