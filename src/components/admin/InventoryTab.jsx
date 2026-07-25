import { Icon } from '@iconify/react';
import { useState, useMemo, useRef, useEffect, Fragment } from 'react';
import { supabase } from '../../supabaseClient';
import { db } from '../../db';
import { useTranslation } from '../../hooks/useTranslation';
import { logActivity } from '../../services/activityService';
import { toCents, toMillicents, fromMillicents, formatForDisplay, formatMillicentsForDisplay, millicentsToCents } from '../../utils/moneyUtils';
import { isLocalMode } from '../../utils/appMode';
import { isCloudReachable } from '../../utils/network';
import { useUpgradeNagStore } from '../../store/useUpgradeNagStore';

// --- Mode-aware persistence helpers ---------------------------------------
// In cloud mode each write goes to Supabase and the returned row (with its
// server id) is mirrored into Dexie. In local ('guest') mode there is no
// Supabase: we generate the id locally and write straight to Dexie, returning
// the same row shape so the callers below are identical across modes.
async function persistInventory(payload, id) {
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

async function persistInventoryLog(log) {
  if (isLocalMode()) { await db.inventory_logs.add(log); return; }
  const { error } = await supabase.from('inventory_logs').insert([log]);
  if (error) throw error;
}

// Local date (yyyy-mm-dd) for the <input type="date"> defaults — NOT UTC, so the
// picker never shows "yesterday" for an evening roast.
function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// Build + persist a lot for `itemName` and return it. Shared by the transform,
// receive, restock and manual "add batch" (backfill) flows so every entry point
// writes an identical row shape.
async function registerLot({ itemName, qty, unit, unitCost, madeDate, receivedDate, sourceName }) {
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

// Reduce a lot-tracked item's lots by `qty`, oldest roast first (FIFO). Used by
// Audit when a loss/waste is logged, so lot remainders stay truthful — a lost
// bag comes off the oldest roast. Returns the amount that couldn't be attributed
// (lots ran dry — stock that predates lot tracking). Best-effort on the cloud.
async function drawDownLotsFIFO(itemName, qty) {
  let toConsume = qty;
  const lots = (await db.inventory_lots.where('item_name').equals(itemName).toArray())
    .filter(l => (Number(l.qty_remaining) || 0) > 0)
    .sort((a, b) =>
      String(a.made_date || '').localeCompare(String(b.made_date || '')) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')));
  for (const lot of lots) {
    if (toConsume <= 0) break;
    const take = Math.min(Number(lot.qty_remaining) || 0, toConsume);
    const newRemaining = Math.max(0, Number((lot.qty_remaining - take).toFixed(6)));
    await db.inventory_lots.update(lot.id, { qty_remaining: newRemaining });
    if (!isLocalMode()) {
      try { await supabase.from('inventory_lots').update({ qty_remaining: newRemaining }).eq('id', lot.id); }
      catch (e) { console.warn('lot draw-down cloud update failed (kept local):', e?.message); }
    }
    toConsume -= take;
  }
  return toConsume;
}

// Add `qty` back to the newest lot (or open one if none). Used by Audit when a
// surplus is found — the roast is unknown, so it lands on the most recent lot,
// keeping sum(lot remaining) == stock.
async function topUpNewestLot(itemName, qty, unit, unitCost) {
  const lots = (await db.inventory_lots.where('item_name').equals(itemName).toArray())
    .sort((a, b) =>
      String(b.made_date || '').localeCompare(String(a.made_date || '')) ||
      String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const newest = lots[0];
  if (!newest) { await registerLot({ itemName, qty, unit, unitCost, madeDate: todayStr() }); return; }
  const newRemaining = Number(((Number(newest.qty_remaining) || 0) + qty).toFixed(6));
  await db.inventory_lots.update(newest.id, { qty_remaining: newRemaining });
  if (!isLocalMode()) {
    try { await supabase.from('inventory_lots').update({ qty_remaining: newRemaining }).eq('id', newest.id); }
    catch (e) { console.warn('lot top-up cloud update failed (kept local):', e?.message); }
  }
}

// A lot is one received/produced batch of a lot-tracked item (roasted coffee,
// in-house syrup, prepped food). Offline-first: always mirror to Dexie; in cloud
// mode also push to Supabase, keeping the local row if the push fails so nothing
// is lost (a later fetch reconciles). Same id in both stores (client UUID).
async function persistLot(lot) {
  await db.inventory_lots.put(lot);
  if (!isLocalMode()) {
    try {
      const { error } = await supabase.from('inventory_lots').insert([lot]);
      if (error) throw error;
    } catch (e) {
      console.warn('inventory_lots cloud insert failed (kept local):', e?.message);
    }
  }
}

// Human-readable batch code: L-<made date>-<letter>, the letter distinguishing
// multiple lots of the same item roasted/made on the same day (A, B, C…).
async function nextLotCode(itemName, madeDate) {
  let sameDay = 0;
  try {
    sameDay = await db.inventory_lots
      .where('item_name').equals(itemName)
      .filter(l => l.made_date === madeDate).count();
  } catch { /* index/store may be mid-upgrade — fall back to suffix A */ }
  return `L-${madeDate}-${String.fromCharCode(65 + (sameDay % 26))}`;
}

async function persistInventoryExpense(expense) {
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
function paymentTag(paymentSource) {
  if (paymentSource === 'banco') return ' [Banco]';
  if (paymentSource === 'dueno') return ' [Dueño]';
  return '';
}

// Stock at or below which an item should be reordered. A per-item
// `reorder_point` (migration 026) takes precedence; when it's unset (0) we fall
// back to the legacy heuristic (2000 for grams, 10 otherwise) so existing
// installs keep their prior low-stock behavior.
const menuItemStyle = { width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 600, fontSize: '0.92rem', textAlign: 'left' };

function reorderThreshold(item) {
  const rp = Number(item.reorder_point) || 0;
  if (rp > 0) return rp;
  return item.unit === 'g' ? 2000 : 10;
}
function isLowStock(item) {
  return Number(item.current_stock) <= reorderThreshold(item);
}

function InventoryTab({ inventoryItems, setInventoryItems, showAlert, showConfirm }) {
  const { t } = useTranslation();

  const [activeView, setActiveView] = useState('list'); // 'list', 'add', 'transform'

  const [newItem, setNewItem] = useState({ name: '', current_stock: '', unit: 'g', total_cost: '', paymentSource: 'caja', trackLots: false, madeDate: todayStr(), receivedDate: todayStr() });
  const [transformForm, setTransformForm] = useState({ sourceItemId: '', amountUsed: '', yieldQty: '', targetItemName: '', operationalCost: '', paymentSource: 'caja', madeDate: todayStr(), receivedDate: todayStr() });

  // --- LOT / BATCH REGISTRY STATE ---
  const [lots, setLots] = useState([]);
  const [lotFilterItem, setLotFilterItem] = useState('');
  // Which lot row is expanded to its sale draw-downs, and the loaded rows for it.
  const [expandedLotId, setExpandedLotId] = useState(null);
  const [lotConsumptions, setLotConsumptions] = useState([]);
  // Manual "add batch" (backfill for stock that predates the feature — e.g. the
  // roasts already in stock when tracking started). Creates a lot WITHOUT
  // changing the stock count.
  const [addingLot, setAddingLot] = useState(false);
  const [lotForm, setLotForm] = useState({ itemId: '', qty: '', madeDate: todayStr(), receivedDate: todayStr() });

  // The batch report: which sales drew from a given lot (the sale -> roast link).
  const fetchLotConsumptions = async (lot) => {
    const sortLocal = (rows) => [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    try {
      if (isLocalMode()) {
        setLotConsumptions(sortLocal(await db.lot_consumptions.where('lot_id').equals(lot.id).toArray()));
        return;
      }
      const { data, error } = await supabase.from('lot_consumptions').select('*').eq('lot_id', lot.id).order('created_at', { ascending: false });
      if (error) throw error;
      setLotConsumptions(data || []);
    } catch (err) {
      console.error('Failed to load lot draw-downs:', err);
      try { setLotConsumptions(sortLocal(await db.lot_consumptions.where('lot_id').equals(lot.id).toArray())); } catch { setLotConsumptions([]); }
    }
  };

  const toggleLotExpand = (lot) => {
    if (expandedLotId === lot.id) { setExpandedLotId(null); setLotConsumptions([]); return; }
    setExpandedLotId(lot.id);
    setLotConsumptions([]);
    fetchLotConsumptions(lot);
  };

  // Grams of an item already covered by open lots — used to prefill the backfill
  // qty with just the untracked remainder so one click registers the gap without
  // double-counting stock that's already lotted.
  const lottedRemaining = (itemName) =>
    lots.filter(l => l.item_name === itemName).reduce((s, l) => s + (Number(l.qty_remaining) || 0), 0);

  const handleAddBatch = async () => {
    const item = inventoryItems.find(i => String(i.id) === String(lotForm.itemId));
    const qty = parseFloat(lotForm.qty);
    if (!item || isNaN(qty) || qty <= 0) {
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc2'));
    }
    try {
      await registerLot({
        itemName: item.name, qty, unit: item.unit, unitCost: item.unit_cost || 0,
        madeDate: lotForm.madeDate, receivedDate: lotForm.receivedDate,
      });
      // Backfilling implicitly marks the item lot-tracked from here on.
      if (!item.track_lots) {
        const saved = await persistInventory({ track_lots: true }, item.id);
        setInventoryItems(prev => prev.map(i => i.id === item.id ? { ...i, ...saved, track_lots: true } : i));
      }
      setAddingLot(false);
      setLotForm({ itemId: '', qty: '', madeDate: todayStr(), receivedDate: todayStr() });
      fetchLots();
      showAlert(t('inv.lotAddedTitle'), `${t('inv.thLotCode')}: ${item.name} — ${qty}${item.unit}.`);
    } catch (err) {
      console.error('Add batch failed:', err);
      showAlert(t('inv.alertError'), t('inv.alertError'));
    }
  };

  // Load the batch registry for the Lots view. Cloud is the source of truth when
  // reachable (and is mirrored into Dexie for offline reads); otherwise fall back
  // to the local mirror so lots created on this device still show.
  const fetchLots = async () => {
    const sortLocal = (rows) => [...rows].sort((a, b) => String(b.made_date || '').localeCompare(String(a.made_date || '')));
    try {
      if (isLocalMode()) {
        setLots(sortLocal(await db.inventory_lots.toArray()));
        return;
      }
      const { data, error } = await supabase.from('inventory_lots').select('*').order('made_date', { ascending: false });
      if (error) throw error;
      setLots(data || []);
      try { await db.inventory_lots.bulkPut(data || []); } catch { /* mirror best-effort */ }
    } catch (err) {
      console.error('Failed to load lots:', err);
      try { setLots(sortLocal(await db.inventory_lots.toArray())); } catch { /* ignore */ }
    }
  };
  const [editingItem, setEditingItem] = useState(null);

  // --- NEW: AUDIT STATE ---
  const [auditingItem, setAuditingItem] = useState(null);

  // --- NEW: RESTOCK STATE ---
  const [restockingItem, setRestockingItem] = useState(null);

  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  // Which row's actions menu (kebab) is open. Only one at a time.
  const [menuOpenId, setMenuOpenId] = useState(null);
  // Screen-space anchor for the row actions menu. The menu renders position:fixed
  // off these coords so it escapes the list card's `overflow:hidden` and the
  // `.admin-section` overflow trap (overflow-x:auto forces overflow-y:auto),
  // either of which clips an absolutely-positioned dropdown — badly when there
  // are only a couple of rows and no scroll room below.
  const [menuAnchor, setMenuAnchor] = useState(null);

  // Auto-scroll between the row-triggered editor panels (edit/restock/audit),
  // which render above the list, and the list row itself. The scroll container
  // is `.admin-main`, so scrollIntoView — which targets the real scroll parent —
  // is what works here. Only one panel is open at a time, so a single ref set on
  // all three panel roots points at whichever is currently mounted.
  const panelRef = useRef(null);
  const rowRefs = useRef(new Map());
  const returnToItemId = useRef(null);

  useEffect(() => {
    const panelOpen = editingItem || restockingItem || auditingItem;
    if (panelOpen) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Panel closed (save/cancel): bring the originating row back into view.
    const id = returnToItemId.current;
    if (!id) return;
    returnToItemId.current = null;
    const el = rowRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editingItem, restockingItem, auditingItem]);

  // --- NEW: HISTORY STATE ---
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyFilterItem, setHistoryFilterItem] = useState('');
  const [historyModalItem, setHistoryModalItem] = useState(null);

  const fetchHistoryLogs = async () => {
    try {
      if (isLocalMode()) {
        const logs = await db.inventory_logs.reverse().sortBy('created_at');
        setHistoryLogs(logs || []);
      } else {
        const { data, error } = await supabase.from('inventory_logs').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        setHistoryLogs(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch history logs:', err);
      showAlert(t('inv.alertError'), 'Could not load history logs.');
    }
  };


  const handleAddItem = async () => {
    // 1. Removed total_cost from the strict validation
    if (!newItem.name || newItem.current_stock === '') {
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc1'));
    }

    const stockVal = parseFloat(newItem.current_stock);
    const costInCents = toCents(newItem.total_cost);
    const unitCostInMillicents = stockVal > 0 ? Math.round((costInCents * 100) / stockVal) : 0;

    const itemToSave = {
      name: newItem.name,
      current_stock: stockVal,
      unit: newItem.unit,
      unit_cost: unitCostInMillicents,
      // Received roasted coffee / batch product: flag it lot-tracked up front so
      // the FIFO sale draw-down applies (outsourced roasting arrives here, not
      // via the in-house Transform).
      track_lots: !!newItem.trackLots
    };

    try {
      const saved = await persistInventory(itemToSave);

      // Batch-tracked delivery: register this received quantity as its first lot.
      if (newItem.trackLots && stockVal > 0) {
        try {
          await registerLot({
            itemName: itemToSave.name, qty: stockVal, unit: newItem.unit,
            unitCost: unitCostInMillicents, madeDate: newItem.madeDate, receivedDate: newItem.receivedDate,
          });
        } catch (e) { console.warn('Lot registration on receive skipped:', e?.message); }
      }

      await persistInventoryLog({
        item_name: itemToSave.name,
        qty_deducted: -stockVal,
        deduction_type: 'added',
        created_at: new Date().toISOString(),
        ticket_id: `ADD-${Date.now()}`,
        unit_cost: unitCostInMillicents,
        local_id: crypto.randomUUID()
      });

      // 3. ONLY create an expense if they actually entered a cost > 0
      if (costInCents > 0) {
        const purchaseExpense = {
          amount: costInCents,
          reason: `Inventory Purchase${paymentTag(newItem.paymentSource)}: ${newItem.name} (${stockVal}${newItem.unit})`,
          category: 'Inventario',
          payment_source: newItem.paymentSource,
          cashier_name: 'Inventory System'
        };
        try { await persistInventoryExpense(purchaseExpense); }
        catch (e) { console.error("Failed to log purchase expense:", e); }
      }

      // LOG ACTIVITY
      logActivity('inventory_created', null, { name: itemToSave.name, stock: stockVal, unit: itemToSave.unit });

      setInventoryItems([...inventoryItems, saved]);
      setNewItem({ name: '', current_stock: '', unit: 'g', total_cost: '', paymentSource: 'caja', trackLots: false, madeDate: todayStr(), receivedDate: todayStr() });
      setActiveView('list');
      useUpgradeNagStore.getState().trigger('inventory_logged');

      showAlert(t('inv.alertSuccess'), `${itemToSave.name} ${t('inv.added')}`);
    } catch (_UNUSED) { // eslint-disable-line no-unused-vars
      showAlert(t('inv.alertError'), t('inv.alertErrorDesc1'));
    }
  };

  // --- 2. THE ROASTER (TRANSFORM STOCK) ---
  const handleTransformStock = async () => {
    if (!transformForm.sourceItemId || !transformForm.amountUsed || !transformForm.yieldQty || !transformForm.targetItemName) {
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc2'));
    }

    const sourceItem = inventoryItems.find(i => i.id === parseInt(transformForm.sourceItemId));
    const usedQty = parseFloat(transformForm.amountUsed);
    const finalYieldQty = parseFloat(transformForm.yieldQty);
    const opCost = parseFloat(transformForm.operationalCost) || 0;

    if (usedQty > sourceItem.current_stock) {
      return showAlert(t('inv.alertNotEnough'), `Solo hay ${sourceItem.current_stock}${sourceItem.unit} de ${sourceItem.name}.`);
    }

    if (!(finalYieldQty > 0) || finalYieldQty > usedQty) {
      return showAlert(t('inv.alertMissing'), t('inv.alertInvalidYield'));
    }

    // unit_cost is in Millicents. opCost is in dollars.
    const totalCostOfUsedInMillicents = Math.round(usedQty * sourceItem.unit_cost) + toMillicents(opCost);
    const newRoastedUnitMillicents = Math.round(totalCostOfUsedInMillicents / finalYieldQty);

    const existingTarget = inventoryItems.find(
      i => i.name.toLowerCase().trim() === transformForm.targetItemName.toLowerCase().trim()
    );

    let finalStockForTarget = finalYieldQty;
    let finalUnitCost = newRoastedUnitMillicents;

    if (existingTarget) {
      finalStockForTarget = existingTarget.current_stock + finalYieldQty;
      const oldTotalValueInMillicents = Math.round(existingTarget.current_stock * (existingTarget.unit_cost || 0));
      const newTotalValueInMillicents = Math.round(finalYieldQty * newRoastedUnitMillicents);
      finalUnitCost = Math.round((oldTotalValueInMillicents + newTotalValueInMillicents) / finalStockForTarget);
    } else {
      finalUnitCost = newRoastedUnitMillicents;
    }

    try {
      const newSourceStock = sourceItem.current_stock - usedQty;
      const updatedSource = await persistInventory({ current_stock: newSourceStock }, sourceItem.id);

      const targetItemPayload = {
        name: existingTarget ? existingTarget.name : transformForm.targetItemName.trim(),
        current_stock: finalStockForTarget,
        unit: sourceItem.unit,
        unit_cost: finalUnitCost
      };

      // Cloud upserts by unique name; locally we resolve the conflict ourselves
      // via existingTarget (update) vs new item (insert).
      let targetRow;
      if (isLocalMode()) {
        targetRow = await persistInventory(targetItemPayload, existingTarget ? existingTarget.id : undefined);
      } else {
        const { data: upsertData, error: upsertErr } = await supabase.from('inventory').upsert([targetItemPayload], { onConflict: 'name' }).select();
        if (upsertErr) throw upsertErr;
        await db.inventory.put(upsertData[0]);
        targetRow = upsertData[0];
      }

      const timestamp = new Date().toISOString();
      const ticketId = `XFR-${Date.now()}`;
      await persistInventoryLog({
        item_name: sourceItem.name,
        qty_deducted: usedQty,
        deduction_type: 'transform_out',
        created_at: timestamp,
        ticket_id: ticketId,
        unit_cost: sourceItem.unit_cost,
        local_id: crypto.randomUUID()
      });
      await persistInventoryLog({
        item_name: targetItemPayload.name,
        qty_deducted: -finalYieldQty,
        deduction_type: 'transform_in',
        created_at: timestamp,
        ticket_id: ticketId,
        unit_cost: finalUnitCost,
        local_id: crypto.randomUUID()
      });

      setInventoryItems(prev => {
        let next = prev.map(i => i.id === updatedSource.id ? updatedSource : i);
        if (existingTarget) {
          next = next.map(i => i.id === existingTarget.id ? targetRow : i);
        } else {
          next = [...next, targetRow];
        }
        return next;
      });

      // Record the operational (roasting) cost as the money that left, the same
      // way buying stock logs an "Inventory Purchase" expense. Category
      // "Inventario" so the books (tinybooks) capture it as inventory value
      // added, not a plain expense. The payment source is encoded in the reason
      // via paymentTag() so each pocket reflects what's actually in it.
      if (opCost > 0) {
        const transformExpense = {
          amount: toCents(opCost),
          reason: `Transform${paymentTag(transformForm.paymentSource)}: ${targetItemPayload.name} (${finalYieldQty}${sourceItem.unit})`,
          category: 'Inventario',
          payment_source: transformForm.paymentSource,
          cashier_name: 'Inventory System'
        };
        try { await persistInventoryExpense(transformExpense); }
        catch (e) { console.error('Failed to log transform cost expense:', e); }
      }

      // Register this batch as a lot and flag the target item as lot-tracked.
      // Best-effort and isolated in its own try/catch AFTER the core transform
      // (stock deduction) has committed, so a device that updated the app but
      // hasn't applied schema 1.2 yet still roasts normally — it just doesn't
      // get the lot until the schema banner is applied.
      try {
        const madeDate = transformForm.madeDate || todayStr();
        const receivedDate = transformForm.receivedDate || madeDate;
        const lot = {
          id: crypto.randomUUID(),
          item_name: targetItemPayload.name,
          lot_code: await nextLotCode(targetItemPayload.name, madeDate),
          made_date: madeDate,
          received_date: receivedDate,
          qty_received: finalYieldQty,
          qty_remaining: finalYieldQty,
          unit: sourceItem.unit,
          unit_cost: finalUnitCost,
          source_name: sourceItem.name,
          notes: null,
          local_id: crypto.randomUUID(),
          created_at: new Date().toISOString()
        };
        await persistLot(lot);
        const trackUpdated = await persistInventory({ track_lots: true }, targetRow.id);
        setInventoryItems(prev => prev.map(i => i.id === targetRow.id ? { ...i, ...trackUpdated, track_lots: true } : i));
      } catch (e) {
        console.warn('Lot registry update skipped (schema 1.2 not applied?):', e?.message);
      }

      setActiveView('list');
      setTransformForm({ sourceItemId: '', amountUsed: '', yieldQty: '', targetItemName: '', operationalCost: '', paymentSource: 'caja', madeDate: todayStr(), receivedDate: todayStr() });

      const successMsg = existingTarget
        ? `${t('inv.added')} ${finalYieldQty}g ${t('inv.to')} ${existingTarget.name}. ${t('inv.newTotal')} ${finalStockForTarget}g ${t('inv.at')} ${formatMillicentsForDisplay(finalUnitCost)}/g.`
        : `${t('inv.roastCompleteMsg')} ${finalYieldQty}g de ${targetItemPayload.name} ${t('inv.at')} ${formatMillicentsForDisplay(finalUnitCost)}/g.`;

      showAlert(t('inv.alertTransformComplete'), successMsg);

    } catch (err) {
      console.error(err);
      showAlert(t('inv.alertError'), t('inv.alertTransformFail'));
    }
  };

  // --- 3. EDIT EXISTING STOCK ---
  const handleSaveEdit = async () => {
    // 1. Removed unit_cost from the strict validation
    if (!editingItem.name || editingItem.current_stock === '') {
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc3'));
    }

    try {
      const payload = {
        name: editingItem.name,
        current_stock: parseFloat(editingItem.current_stock),
        unit: editingItem.unit,
        unit_cost: toMillicents(editingItem.unit_cost),
        reorder_point: Math.max(0, parseFloat(editingItem.reorder_point) || 0)
      };

      const saved = await persistInventory(payload, editingItem.id);
      setInventoryItems(inventoryItems.map(item => item.id === editingItem.id ? saved : item));
      setEditingItem(null);
    } catch (err) {
      console.error(err);
      showAlert(t('inv.alertError'), t('inv.alertUpdateFail'));
    }
  };

  // --- 4. NEW: SAVE AUDIT / WASTAGE LOG ---
  const handleSaveAudit = async () => {
    const actualCount = parseFloat(auditingItem.actualCount);
    if (isNaN(actualCount)) return showAlert(t('inv.alertInvalidCount'), t('inv.alertInvalidCountDesc'));

    const variance = actualCount - auditingItem.current_stock;

    if (variance === 0) {
      setAuditingItem(null);
      return showAlert(t('inv.alertVerified'), t('inv.alertVerifiedDesc'));
    }

    const unitCost = auditingItem.unit_cost || 0;
    const financialImpactInCents = millicentsToCents(variance * unitCost);
    const deductionType = variance < 0 ? (auditingItem.reason || 'waste') : 'audit_correction';

    try {
      const saved = await persistInventory({ current_stock: actualCount }, auditingItem.id);

      const auditLog = {
        item_name: auditingItem.name,
        qty_deducted: -variance,
        deduction_type: deductionType,
        created_at: new Date().toISOString(),
        ticket_id: `AUDIT-${Date.now()}`,
        unit_cost: unitCost,
        local_id: crypto.randomUUID()
      };

      await persistInventoryLog(auditLog);

      // Keep the roast lots consistent with the corrected stock. A loss draws
      // down the oldest roast first (FIFO); a found surplus tops up the newest
      // lot — so sum(lot remaining) tracks the audited stock. Best-effort.
      if (auditingItem.track_lots) {
        try {
          if (variance < 0) await drawDownLotsFIFO(auditingItem.name, Math.abs(variance));
          else await topUpNewestLot(auditingItem.name, variance, auditingItem.unit, unitCost);
        } catch (e) { console.warn('Audit lot reconciliation skipped:', e?.message); }
      }

      setInventoryItems(inventoryItems.map(item => item.id === auditingItem.id ? saved : item));
      setAuditingItem(null);

      const impactMsg = variance < 0
        ? `${t('inv.loggedLoss')} ${Math.abs(variance)}${auditingItem.unit} (-${formatForDisplay(Math.abs(financialImpactInCents))})`
        : `${t('inv.foundExtra')} ${variance}${auditingItem.unit} (+${formatForDisplay(financialImpactInCents)})`;

      // LOG ACTIVITY
      logActivity('inventory_audit', null, { name: auditingItem.name, variance, financial_impact: financialImpactInCents });

      showAlert(t('inv.alertAuditComplete'), impactMsg);

    } catch (err) {
      console.error("Audit error:", err);
      showAlert(t('inv.alertError'), t('inv.alertAuditFail'));
    }
  };

  // --- 5. NEW: SAVE RESTOCK LOG ---
  const handleSaveRestock = async () => {
    const qtyBought = parseFloat(restockingItem.qtyBought);
    const totalPaidInCents = toCents(restockingItem.totalPaid);

    if (isNaN(qtyBought) || qtyBought <= 0 || isNaN(totalPaidInCents) || totalPaidInCents < 0) {
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc3'));
    }

    const oldStock = restockingItem.current_stock;
    const oldCostInMillicents = restockingItem.unit_cost || 0;
    const oldTotalValueInMillicents = Math.round(oldStock * oldCostInMillicents);

    const newStock = oldStock + qtyBought;
    const newTotalValueInMillicents = oldTotalValueInMillicents + (totalPaidInCents * 100);
    const newUnitCostInMillicents = newStock > 0 ? Math.round(newTotalValueInMillicents / newStock) : 0;

    if (newUnitCostInMillicents < 0) {
      return showAlert(t('common.error'), "Negative COGS: The calculated unit cost is negative. Please check your total paid amount.");
    }


    try {
      const saved = await persistInventory(
        { current_stock: newStock, unit_cost: newUnitCostInMillicents },
        restockingItem.id
      );

      const restockLog = {
        item_name: restockingItem.name,
        qty_deducted: -qtyBought, // Negative means addition of stock
        deduction_type: 'restock',
        created_at: new Date().toISOString(),
        ticket_id: `RESTOCK-${Date.now()}`,
        unit_cost: newUnitCostInMillicents,
        local_id: crypto.randomUUID()
      };
      await persistInventoryLog(restockLog);

      // Batch-tracked item: a restock is a new delivery, so it always opens a new
      // lot for the received quantity (dates from the restock form).
      if (restockingItem.track_lots && qtyBought > 0) {
        try {
          await registerLot({
            itemName: restockingItem.name, qty: qtyBought, unit: restockingItem.unit,
            unitCost: newUnitCostInMillicents, madeDate: restockingItem.madeDate, receivedDate: restockingItem.receivedDate,
          });
        } catch (e) { console.warn('Lot registration on restock skipped:', e?.message); }
      }

      // Like transform, record the money that left tagged by pocket so each
      // pocket (Caja / Banco / Dueño) reflects what's actually in it.
      if (totalPaidInCents > 0) {
        const expense = {
          amount: totalPaidInCents,
          reason: `RESTOCK${paymentTag(restockingItem.paymentSource)}: ${restockingItem.name} (${qtyBought}${restockingItem.unit})`,
          category: 'Inventario',
          payment_source: restockingItem.paymentSource,
          cashier_name: 'Inventory System'
        };
        await persistInventoryExpense(expense);
      }

      // LOG ACTIVITY
      logActivity('inventory_restock', null, { name: restockingItem.name, qty: qtyBought, unit: restockingItem.unit, cost: totalPaidInCents });

      setInventoryItems(inventoryItems.map(item => item.id === restockingItem.id ? saved : item));
      setRestockingItem(null);
      useUpgradeNagStore.getState().trigger('inventory_logged');

      showAlert(t('inv.alertRestockComplete'), `${qtyBought}${restockingItem.unit} ${t('inv.added')} ${t('inv.to')} ${restockingItem.name}.`);

    } catch (err) {
      console.error(err);
      showAlert(t('inv.alertError'), t('inv.alertUpdateFail'));
    }
  };

  const handleDelete = (id, name) => {
    showConfirm(t('inv.confirmDelete'), `${t('inv.confirmDeleteDesc')} ${name}?`, async () => {
      // Capture stock + cost before deletion so the audit trail still has
      // enough context to reconcile later (otherwise a deleted item just
      // vanishes from the system with no record of what was lost).
      const item = inventoryItems.find(i => i.id === id);
      if (!isLocalMode()) await supabase.from('inventory').delete().eq('id', id);
      await db.inventory.delete(id);

      await persistInventoryLog({
        item_name: name,
        qty_deducted: item?.current_stock ?? 0,
        deduction_type: 'removed',
        created_at: new Date().toISOString(),
        ticket_id: `DEL-${Date.now()}`,
        unit_cost: item?.unit_cost ?? 0,
        local_id: crypto.randomUUID()
      });

      logActivity('inventory_deleted', null, {
        name,
        stock_at_delete: item?.current_stock ?? null,
        unit: item?.unit ?? null,
        unit_cost_at_delete: item?.unit_cost ?? null
      });
      setInventoryItems(inventoryItems.filter(item => item.id !== id));
    });
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortedItems = useMemo(() => {
    let sortableItems = [...inventoryItems];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (sortConfig.key === 'name') {
          const nameA = a.name.toLowerCase();
          const nameB = b.name.toLowerCase();
          if (nameA < nameB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (nameA > nameB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        }
        const valA = parseFloat(a[sortConfig.key]) || 0;
        const valB = parseFloat(b[sortConfig.key]) || 0;
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [inventoryItems, sortConfig]);

  return (
    <div className="admin-section fade-in" style={{ maxWidth: '1000px', margin: '0 auto', color: 'var(--text-main)' }}>
      <div className="admin-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <h2 style={{ margin: 0, fontWeight: '800', fontSize: '1.8rem' }}>{t('inv.title')}</h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setActiveView(activeView === 'transform' ? 'list' : 'transform'); setEditingItem(null); setAuditingItem(null); }}
            style={{ padding: '12px 20px', background: activeView === 'transform' ? '#95a5a6' : '#e67e22', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(230, 126, 34, 0.2)' }}
          >
            <Icon icon={activeView === 'transform' ? 'lucide:x' : 'lucide:flame'} />
            {activeView === 'transform' ? t('inv.btnCancel') : t('inv.btnRoast')}
          </button>
          <button
            onClick={() => { setActiveView(activeView === 'add' ? 'list' : 'add'); setEditingItem(null); setAuditingItem(null); }}
            style={{ padding: '12px 20px', background: activeView === 'add' ? '#95a5a6' : 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(52, 152, 219, 0.2)' }}
          >
            <Icon icon={activeView === 'add' ? 'lucide:x' : 'lucide:plus'} />
            {activeView === 'add' ? t('inv.btnCancel') : t('inv.btnReceive')}
          </button>
          <button
            onClick={() => {
              const newView = activeView === 'deleted' ? 'list' : 'deleted';
              setActiveView(newView);
              setEditingItem(null);
              setAuditingItem(null);
              if (newView === 'deleted') fetchHistoryLogs();
            }}
            style={{ padding: '12px 20px', background: activeView === 'deleted' ? '#95a5a6' : '#8e44ad', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(142, 68, 173, 0.2)' }}
          >
            <Icon icon={activeView === 'deleted' ? 'lucide:x' : 'lucide:trash-2'} />
            {activeView === 'deleted' ? t('inv.btnCancel') : t('inv.btnDeleted')}
          </button>
          <button
            onClick={() => {
              const newView = activeView === 'lots' ? 'list' : 'lots';
              setActiveView(newView);
              setEditingItem(null);
              setAuditingItem(null);
              if (newView === 'lots') fetchLots();
            }}
            style={{ padding: '12px 20px', background: activeView === 'lots' ? '#95a5a6' : '#16a085', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(22, 160, 133, 0.2)' }}
          >
            <Icon icon={activeView === 'lots' ? 'lucide:x' : 'lucide:layers'} />
            {activeView === 'lots' ? t('inv.btnCancel') : t('inv.btnLots')}
          </button>
        </div>
      </div>

      {activeView === 'add' && !editingItem && !auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '1px solid var(--border)', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:package-plus" style={{ color: 'var(--brand-color)' }} />
            {t('inv.receiveTitle')}
          </h3>
          <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.3fr auto', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.itemName')}</label>
              <input type="text" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.stockQty')}</label>
              <input type="number" value={newItem.current_stock} onChange={e => setNewItem({ ...newItem, current_stock: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.unit')}</label>
              <select value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                <option value="g">{t('inv.unitG')}</option>
                <option value="ml">{t('inv.unitMl')}</option>
                <option value="units">{t('inv.unitPieces')}</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.totalCost')}</label>
              <input type="number" placeholder={t('inv.invoiceTotal')} value={newItem.total_cost} onChange={e => setNewItem({ ...newItem, total_cost: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.paidWith') || '¿Cómo se pagó?'}</label>
              <select value={newItem.paymentSource} onChange={e => setNewItem({ ...newItem, paymentSource: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }} title="Solo aplica si hay costo">
                <option value="caja">{t('inv.paidCaja') || 'Caja Chica'}</option>
                <option value="banco">{t('inv.paidBanco') || 'Banco'}</option>
                <option value="dueno">{t('inv.paidOwner') || 'Dueño (mi dinero)'}</option>
              </select>
            </div>
            <button onClick={handleAddItem} style={{ padding: '12px 24px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(46, 204, 113, 0.2)' }}>{t('inv.btnSave')}</button>
          </div>

          {/* Batch tracking: for roasted coffee / in-house batches received here
              (e.g. outsourced roasting). Reveals the roast + received dates. */}
          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}>
              <input type="checkbox" checked={newItem.trackLots} onChange={e => setNewItem({ ...newItem, trackLots: e.target.checked })} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              <Icon icon="lucide:layers" style={{ color: '#16a085' }} />
              {t('inv.trackBatches')}
            </label>
            {newItem.trackLots && (
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '14px' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.madeDate')}</label>
                  <input type="date" value={newItem.madeDate} onChange={e => setNewItem({ ...newItem, madeDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.receivedDate')}</label>
                  <input type="date" value={newItem.receivedDate} onChange={e => setNewItem({ ...newItem, receivedDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'transform' && !editingItem && !auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '2px solid #e67e22', boxShadow: '0 10px 20px rgba(230, 126, 34, 0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#e67e22', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:flame" />
            {t('inv.roastTitle')}
          </h3>
          <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
            <div style={{ minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.rawMaterial')}</label>
              <select value={transformForm.sourceItemId} onChange={e => setTransformForm({ ...transformForm, sourceItemId: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                <option value="">{t('inv.selectOption')}</option>
                {sortedItems.map(item => <option key={item.id} value={item.id}>{item.name} ({t('inv.has')} {item.current_stock}{item.unit})</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.usedQty')}</label>
              <input type="number" value={transformForm.amountUsed} onChange={e => setTransformForm({ ...transformForm, amountUsed: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.yieldQty')}</label>
              <input type="number" value={transformForm.yieldQty} onChange={e => setTransformForm({ ...transformForm, yieldQty: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.opCost')}</label>
              <input type="number" placeholder="e.g. 275" value={transformForm.operationalCost} onChange={e => setTransformForm({ ...transformForm, operationalCost: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.paidWith') || '¿Cómo se pagó?'}</label>
              <select value={transformForm.paymentSource} onChange={e => setTransformForm({ ...transformForm, paymentSource: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }} title="Solo aplica si hay costo de operación">
                <option value="caja">{t('inv.paidCaja') || 'Caja Chica'}</option>
                <option value="banco">{t('inv.paidBanco') || 'Banco'}</option>
                <option value="dueno">{t('inv.paidOwner') || 'Dueño (mi dinero)'}</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.madeDate')}</label>
              <input type="date" value={transformForm.madeDate} onChange={e => setTransformForm({ ...transformForm, madeDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.receivedDate')}</label>
              <input type="date" value={transformForm.receivedDate} onChange={e => setTransformForm({ ...transformForm, receivedDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.targetItem')}</label>
              <input
                type="text"
                list="inventory-names"
                placeholder={t('inv.typeNewOrSelect')}
                value={transformForm.targetItemName}
                onChange={e => setTransformForm({ ...transformForm, targetItemName: e.target.value })}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }}
              />
              <datalist id="inventory-names">
                {sortedItems.map(item => <option key={item.id} value={item.name} />)}
              </datalist>
            </div>
            <button onClick={handleTransformStock} style={{ padding: '12px 24px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(230, 126, 34, 0.2)' }}>{t('inv.btnProcess')}</button>
          </div>
        </div>
      )}

      {activeView === 'lots' && (() => {
        const lotItemNames = [...new Set(lots.map(l => l.item_name))].sort();
        const shown = lots.filter(l => !lotFilterItem || l.item_name === lotFilterItem);
        return (
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '1px solid var(--border)', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#16a085' }}>
              <Icon icon="lucide:layers" />
              {t('inv.lotsTitle')}
            </h3>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: '220px' }}>
                <select value={lotFilterItem} onChange={e => setLotFilterItem(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                  <option value="">{t('inv.filterAll')}</option>
                  {lotItemNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <button onClick={() => setAddingLot(v => !v)} style={{ padding: '10px 16px', background: addingLot ? '#95a5a6' : '#16a085', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon icon={addingLot ? 'lucide:x' : 'lucide:plus'} />{addingLot ? t('inv.btnCancel') : t('inv.btnAddBatch')}
              </button>
            </div>
          </div>
          <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>{t('inv.lotsSubtitle')}</p>

          {addingLot && (() => {
            const selected = inventoryItems.find(i => String(i.id) === String(lotForm.itemId));
            const gap = selected ? Math.max(0, (Number(selected.current_stock) || 0) - lottedRemaining(selected.name)) : 0;
            return (
            <div style={{ background: 'rgba(22, 160, 133, 0.05)', border: '1px solid rgba(22, 160, 133, 0.25)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#16a085', textTransform: 'uppercase', marginBottom: '12px' }}>{t('inv.addBatchTitle')}</div>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '2 1 200px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.itemName')}</label>
                  <select value={lotForm.itemId} onChange={e => {
                      const it = inventoryItems.find(i => String(i.id) === String(e.target.value));
                      const prefill = it ? Math.max(0, (Number(it.current_stock) || 0) - lottedRemaining(it.name)) : '';
                      setLotForm({ ...lotForm, itemId: e.target.value, qty: prefill ? String(prefill) : '' });
                    }} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                    <option value="">{t('inv.selectOption')}</option>
                    {sortedItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.thReceivedQty')}{selected ? ` (${selected.unit})` : ''}</label>
                  <input type="number" value={lotForm.qty} onChange={e => setLotForm({ ...lotForm, qty: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.madeDate')}</label>
                  <input type="date" value={lotForm.madeDate} onChange={e => setLotForm({ ...lotForm, madeDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.receivedDate')}</label>
                  <input type="date" value={lotForm.receivedDate} onChange={e => setLotForm({ ...lotForm, receivedDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
                </div>
                <button onClick={handleAddBatch} style={{ padding: '12px 22px', background: '#16a085', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>{t('inv.btnSave')}</button>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {t('inv.addBatchHint')}{selected ? ` ${t('inv.addBatchUntracked')}: ${gap}${selected.unit}.` : ''}
              </p>
            </div>
            );
          })()}

          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thLotCode')}</th>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.itemName')}</th>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thMadeDate')}</th>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thReceivedDate')}</th>
                  <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thReceivedQty')}</th>
                  <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thSold')}</th>
                  <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thRemaining')}</th>
                  <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thUnitCost')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((lot, idx) => {
                  const sold = Math.max(0, (Number(lot.qty_received) || 0) - (Number(lot.qty_remaining) || 0));
                  const isOpen = expandedLotId === lot.id;
                  return (
                  <Fragment key={lot.id || lot.local_id || idx}>
                  <tr onClick={() => toggleLotExpand(lot)} className="hover-row" style={{ borderBottom: isOpen ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                      <Icon icon={isOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'} style={{ verticalAlign: 'middle', marginRight: '6px', color: 'var(--text-muted)' }} />
                      {lot.lot_code || '—'}
                    </td>
                    <td style={{ padding: '12px' }}>{lot.item_name}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{lot.made_date || '—'}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{lot.received_date || '—'}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{lot.qty_received}{lot.unit}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>{sold}{lot.unit}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>{lot.qty_remaining}{lot.unit}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{formatMillicentsForDisplay(lot.unit_cost || 0)}/{lot.unit}</td>
                  </tr>
                  {isOpen && (
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={8} style={{ padding: '0 12px 16px 34px', background: 'rgba(22, 160, 133, 0.04)' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', padding: '12px 0 6px' }}>{t('inv.drawdownTitle')}</div>
                        {lotConsumptions.length === 0 ? (
                          <div style={{ padding: '8px 0 4px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('inv.drawdownEmpty')}</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                              {lotConsumptions.map((c, i) => (
                                <tr key={c.id || c.local_id || i}>
                                  <td style={{ padding: '5px 0', color: 'var(--text-muted)', fontSize: '0.88rem', width: '190px' }}>{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</td>
                                  <td style={{ padding: '5px 0', fontSize: '0.88rem' }}>{t('inv.drawdownTicket')} {c.ticket_id || '—'}</td>
                                  <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 'bold', fontSize: '0.88rem' }}>{c.qty}{lot.unit}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('inv.lotsEmpty')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        );
      })()}

      {activeView === 'deleted' && (() => {
        const deletedItemNames = [...new Set(historyLogs.map(l => l.item_name))].filter(name => !inventoryItems.find(i => i.name === name));
        return (
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '1px solid var(--border)', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#e74c3c' }}>
              <Icon icon="lucide:trash-2" />
              {t('inv.deletedTitle')}
            </h3>
            <div style={{ width: '250px' }}>
              <select value={historyFilterItem} onChange={e => setHistoryFilterItem(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                <option value="">{t('inv.filterAll')}</option>
                {deletedItemNames.sort().map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thDate')}</th>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.itemName')}</th>
                  <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thType')}</th>
                  <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thQty')}</th>
                  <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thImpact')}</th>
                  <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thTicket')}</th>
                </tr>
              </thead>
              <tbody>
                {historyLogs.filter(l => deletedItemNames.includes(l.item_name)).filter(l => !historyFilterItem || l.item_name === historyFilterItem).map((log, idx) => {
                  const qty = -log.qty_deducted;
                  const isPositive = qty > 0;
                  const color = isPositive ? '#2ecc71' : (qty < 0 ? '#e74c3c' : 'var(--text-main)');
                  const dateStr = new Date(log.created_at).toLocaleString();
                  const impactInCents = millicentsToCents(Math.abs(qty) * (log.unit_cost || 0));
                  
                  let actionLabel = log.deduction_type;
                  if (log.deduction_type === 'added') actionLabel = t('inv.logAdded');
                  if (log.deduction_type === 'restock') actionLabel = t('inv.logRestocked');
                  if (log.deduction_type === 'sale') actionLabel = t('inv.logSale');
                  if (log.deduction_type === 'transform_out') actionLabel = t('inv.logTransformOut');
                  if (log.deduction_type === 'transform_in') actionLabel = t('inv.logTransformIn');
                  if (log.deduction_type === 'removed') actionLabel = t('inv.logRemoved');
                  if (log.deduction_type === 'waste' || log.deduction_type === 'audit_correction') {
                    actionLabel = isPositive ? t('inv.logAuditGain') : t('inv.logAuditLoss');
                  }

                  return (
                    <tr key={log.id || log.local_id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{dateStr}</td>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{log.item_name}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ background: 'var(--bg-main)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{actionLabel}</span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color }}>
                        {isPositive ? '+' : ''}{qty}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {impactInCents > 0 ? formatForDisplay(impactInCents) : '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{log.ticket_id}</td>
                    </tr>
                  );
                })}
                {historyLogs.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('inv.noHistory')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        );
      })}

      {/* --- NEW: PER-ITEM HISTORY MODAL --- */}
      {historyModalItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#8e44ad', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:history" />
                {t('inv.historyTitle')} - {historyModalItem}
              </h3>
              <button onClick={() => setHistoryModalItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex' }}>
                <Icon icon="lucide:x" />
              </button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thDate')}</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thType')}</th>
                    <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thQty')}</th>
                    <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thImpact')}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLogs.filter(l => l.item_name === historyModalItem).map((log, idx) => {
                    const qty = -log.qty_deducted;
                    const isPositive = qty > 0;
                    const color = isPositive ? '#2ecc71' : (qty < 0 ? '#e74c3c' : 'var(--text-main)');
                    const dateStr = new Date(log.created_at).toLocaleString();
                    const impactInCents = millicentsToCents(Math.abs(qty) * (log.unit_cost || 0));
                    
                    let actionLabel = log.deduction_type;
                    if (log.deduction_type === 'added') actionLabel = t('inv.logAdded');
                    if (log.deduction_type === 'restock') actionLabel = t('inv.logRestocked');
                    if (log.deduction_type === 'sale') actionLabel = t('inv.logSale');
                    if (log.deduction_type === 'transform_out') actionLabel = t('inv.logTransformOut');
                    if (log.deduction_type === 'transform_in') actionLabel = t('inv.logTransformIn');
                    if (log.deduction_type === 'removed') actionLabel = t('inv.logRemoved');
                    if (log.deduction_type === 'waste' || log.deduction_type === 'audit_correction') {
                      actionLabel = isPositive ? t('inv.logAuditGain') : t('inv.logAuditLoss');
                    }

                    return (
                      <tr key={log.id || log.local_id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{dateStr}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ background: 'var(--bg-main)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{actionLabel}</span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color }}>
                          {isPositive ? '+' : ''}{qty}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {impactInCents > 0 ? formatForDisplay(impactInCents) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {historyLogs.filter(l => l.item_name === historyModalItem).length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('inv.noHistory')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT ITEM UI --- */}
      {editingItem && (
        <div ref={panelRef} style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '1px solid var(--brand-color)', boxShadow: '0 10px 30px rgba(52, 152, 219, 0.1)', scrollMarginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: 'var(--brand-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:edit-3" />
              {t('inv.editTitle')}
            </h3>
            <button onClick={() => setEditingItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex' }}>
              <Icon icon="lucide:x" />
            </button>
          </div>

          <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.itemName')}</label>
              <input type="text" value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.currentStock')}</label>
              <input type="number" value={editingItem.current_stock} onChange={e => {
                const newStock = e.target.value;
                setEditingItem({
                  ...editingItem,
                  current_stock: newStock,
                  total_cost: newStock === '' ? '' : formatForDisplay(millicentsToCents(parseFloat(newStock) * editingItem.unit_cost))
                })
              }} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--brand-color)' }}>{t('inv.unitCost')}</label>
              <input type="number" step="0.0001" value={editingItem.unit_cost} onChange={e => {
                const newUnit = e.target.value;
                const stock = parseFloat(editingItem.current_stock) || 0;
                setEditingItem({
                  ...editingItem,
                  unit_cost: newUnit,
                  total_cost: newUnit === '' ? '' : formatForDisplay(millicentsToCents(stock * toMillicents(newUnit)))
                })
              }} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }} title={t('inv.reorderPointHint')}>{t('inv.reorderPoint')}</label>
              <input type="number" min="0" step="any" placeholder="0" value={editingItem.reorder_point ?? ''} onChange={e => setEditingItem({ ...editingItem, reorder_point: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>

            <button onClick={handleSaveEdit} style={{ padding: '12px 24px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(52, 152, 219, 0.2)' }}>{t('inv.btnUpdate')}</button>
          </div>
        </div>
      )}

      {/* --- NEW: RESTOCK UI --- */}
      {restockingItem && (
        <div ref={panelRef} style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '2px solid #27ae60', boxShadow: '0 10px 30px rgba(39, 174, 96, 0.1)', scrollMarginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#27ae60', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:package-plus" />
              {t('inv.restock')} - {restockingItem.name}
            </h3>
            <button onClick={() => setRestockingItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex' }}>
              <Icon icon="lucide:x" />
            </button>
          </div>

          <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>{t('inv.restockDesc')}</p>

          <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '16px', alignItems: 'flex-start' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.qtyBought')} ({restockingItem.unit})</label>
              <input type="number" placeholder="0" value={restockingItem.qtyBought || ''} onChange={e => setRestockingItem({ ...restockingItem, qtyBought: e.target.value })} style={{ width: '100%', padding: '16px', fontSize: '1.2rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.totalPaid')} ($)</label>
              <input type="number" placeholder="0.00" value={restockingItem.totalPaid || ''} onChange={e => setRestockingItem({ ...restockingItem, totalPaid: e.target.value })} style={{ width: '100%', padding: '16px', fontSize: '1.2rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />

              <div style={{ marginTop: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.paidWith') || '¿Cómo se pagó?'}</label>
                <select value={restockingItem.paymentSource || 'caja'} onChange={e => setRestockingItem({ ...restockingItem, paymentSource: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                  <option value="caja">{t('inv.paidCaja') || 'Caja Chica'}</option>
                  <option value="banco">{t('inv.paidBanco') || 'Banco'}</option>
                  <option value="dueno">{t('inv.paidOwner') || 'Dueño (mi dinero)'}</option>
                </select>
              </div>
            </div>

            <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'flex-start' }}>
              <button onClick={handleSaveRestock} style={{ height: '55px', padding: '0 30px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(39, 174, 96, 0.2)' }}>
                {t('inv.restock')}
              </button>
            </div>
          </div>

          {/* Batch-tracked item: a restock is a new delivery, so it opens a new
              lot. Capture the roast + received dates for it. */}
          {restockingItem.track_lots && (
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a085', fontWeight: 600, flex: '1 1 100%' }}>
                <Icon icon="lucide:layers" />{t('inv.restockNewBatch')}
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.madeDate')}</label>
                <input type="date" value={restockingItem.madeDate} onChange={e => setRestockingItem({ ...restockingItem, madeDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.receivedDate')}</label>
                <input type="date" value={restockingItem.receivedDate} onChange={e => setRestockingItem({ ...restockingItem, receivedDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- NEW: AUDIT / WASTAGE UI --- */}
      {auditingItem && (
        <div ref={panelRef} style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '2px solid #e74c3c', boxShadow: '0 10px 30px rgba(231, 76, 60, 0.1)', scrollMarginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#e74c3c', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:clipboard-check" />
              {t('inv.auditTitle')}
            </h3>
            <button onClick={() => setAuditingItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex' }}>
              <Icon icon="lucide:x" />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', alignItems: 'start' }}>

            <div style={{ background: 'var(--bg-main)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('inv.expectedStock')}</p>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)' }}>{auditingItem.current_stock} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{auditingItem.unit}</span></div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 'bold', color: '#e74c3c' }}>{t('inv.actualCount')}</label>
              <input type="number" autoFocus value={auditingItem.actualCount || ''} onChange={e => {
                setAuditingItem({ ...auditingItem, actualCount: e.target.value })
              }} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '2px solid #e74c3c', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.5rem', fontWeight: '800', textAlign: 'center', outline: 'none' }} />
            </div>

            {auditingItem.actualCount !== undefined && auditingItem.actualCount !== '' && (() => {
              const variance = parseFloat(auditingItem.actualCount) - auditingItem.current_stock;
              const isLoss = variance < 0;

              const unitCost = auditingItem.unit_cost || 0;
              const financialImpactInCents = millicentsToCents(Math.abs(variance * unitCost));

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="mobile-flex-stack" style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, padding: '12px', background: isLoss ? 'rgba(231,76,60,0.05)' : 'rgba(46,204,113,0.05)', borderRadius: '12px', border: `1px solid ${isLoss ? 'rgba(231,76,60,0.2)' : 'rgba(46,204,113,0.2)'}`, textAlign: 'center' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', color: isLoss ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>{t('inv.variance')}</p>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isLoss ? '#e74c3c' : '#2ecc71' }}>{variance > 0 ? '+' : ''}{variance} {auditingItem.unit}</div>
                    </div>
                    <div style={{ flex: 1, padding: '12px', background: isLoss ? 'rgba(231,76,60,0.05)' : 'rgba(46,204,113,0.05)', borderRadius: '12px', border: `1px solid ${isLoss ? 'rgba(231,76,60,0.2)' : 'rgba(46,204,113,0.2)'}`, textAlign: 'center' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', color: isLoss ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>{t('inv.financialImpact')}</p>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isLoss ? '#e74c3c' : '#2ecc71' }}>{isLoss ? '-' : '+'}{formatForDisplay(financialImpactInCents)}</div>
                    </div>
                  </div>

                  {isLoss && (
                    <select value={auditingItem.reason || 'waste'} onChange={e => setAuditingItem({ ...auditingItem, reason: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                      <option value="waste">{t('inv.reasonWaste')}</option>
                      <option value="expired">{t('inv.reasonExpired')}</option>
                      <option value="comp">{t('inv.reasonComp')}</option>
                      <option value="audit_correction">{t('inv.reasonAudit')}</option>
                    </select>
                  )}

                  <button onClick={handleSaveAudit} style={{ padding: '16px', background: isLoss ? '#e74c3c' : '#2ecc71', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem', boxShadow: `0 8px 20px ${isLoss ? 'rgba(231, 76, 60, 0.2)' : 'rgba(46, 204, 113, 0.2)'}` }}>
                    {isLoss ? t('inv.btnConfirmLoss') : t('inv.btnConfirmAdj')}
                  </button>
                </div>
              );
            })()}

          </div>
        </div>
      )}

      {/* --- LOW-STOCK / REORDER ALERT --- */}
      {(() => {
        const lowItems = sortedItems.filter(isLowStock);
        if (lowItems.length === 0) return null;
        return (
          <div style={{ background: 'rgba(231, 76, 60, 0.06)', border: '1px solid rgba(231, 76, 60, 0.25)', borderRadius: 'var(--admin-card-radius)', padding: '16px 20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#c0392b', fontWeight: 800 }}>
              <Icon icon="lucide:alert-triangle" style={{ fontSize: '1.3rem' }} />
              {t('inv.reorderAlertTitle')} · {lowItems.length}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {lowItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => { returnToItemId.current = item.id; setRestockingItem({ ...item, qtyBought: '', totalPaid: '', paymentSource: 'caja', madeDate: todayStr(), receivedDate: todayStr() }); setEditingItem(null); setAuditingItem(null); setActiveView('list'); }}
                  title={t('inv.restock')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'var(--bg-surface)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: '20px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold', fontSize: '0.9rem' }}
                >
                  <Icon icon="lucide:package-plus" style={{ color: '#27ae60' }} />
                  {item.name}
                  <span style={{ color: '#c0392b' }}>{item.current_stock}{item.unit}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* --- INVENTORY LIST --- */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
        <table className="card-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-main)' }}>
              <th onClick={() => handleSort('name')} style={{ padding: '20px 24px', textAlign: 'left', borderBottom: '2px solid var(--border)', cursor: 'pointer', userSelect: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {t('inv.thName')}
                  <Icon icon={sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? 'lucide:sort-asc' : 'lucide:sort-desc') : 'lucide:chevrons-up-down'} style={{ fontSize: '1rem' }} />
                </div>
              </th>
              <th onClick={() => handleSort('current_stock')} style={{ padding: '20px 24px', textAlign: 'left', borderBottom: '2px solid var(--border)', cursor: 'pointer', userSelect: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {t('inv.thStock')}
                  <Icon icon={sortConfig.key === 'current_stock' ? (sortConfig.direction === 'asc' ? 'lucide:sort-asc' : 'lucide:sort-desc') : 'lucide:chevrons-up-down'} style={{ fontSize: '1rem' }} />
                </div>
              </th>
              <th onClick={() => handleSort('unit_cost')} style={{ padding: '20px 24px', textAlign: 'left', borderBottom: '2px solid var(--border)', cursor: 'pointer', userSelect: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {t('inv.thCost')}
                  <Icon icon={sortConfig.key === 'unit_cost' ? (sortConfig.direction === 'asc' ? 'lucide:sort-asc' : 'lucide:sort-desc') : 'lucide:chevrons-up-down'} style={{ fontSize: '1rem' }} />
                </div>
              </th>
              <th style={{ padding: '20px 24px', textAlign: 'right', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('inv.thActions')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr
                key={item.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(item.id, el);
                  else rowRefs.current.delete(item.id);
                }}
                style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', scrollMarginTop: '16px', scrollMarginBottom: '16px' }}
                className="hover-row"
              >
                <td data-label={t('inv.thName')} style={{ padding: '20px 24px', fontWeight: '700', fontSize: '1rem' }}>{item.name}</td>
                <td data-label={t('inv.thStock')} style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: isLowStock(item) ? 'rgba(231, 76, 60, 0.1)' : 'rgba(46, 204, 113, 0.1)', borderRadius: '20px', color: isLowStock(item) ? '#e74c3c' : '#27ae60', fontWeight: 'bold', fontSize: '0.95rem' }} title={Number(item.reorder_point) > 0 ? `${t('inv.reorderPoint')}: ${item.reorder_point} ${item.unit}` : undefined}>
                    <Icon icon={isLowStock(item) ? 'lucide:alert-circle' : 'lucide:check-circle'} />
                    {item.current_stock} {item.unit}
                  </div>
                </td>
                <td data-label={t('inv.thCost')} style={{ padding: '20px 24px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '1rem' }}>
                  {formatMillicentsForDisplay(item.unit_cost || 0)} / {item.unit}
                </td>
                <td data-label={t('inv.thActions')} style={{ padding: '20px 24px', textAlign: 'right' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                      onClick={(e) => {
                        if (menuOpenId === item.id) { setMenuOpenId(null); return; }
                        const r = e.currentTarget.getBoundingClientRect();
                        setMenuAnchor({ top: r.top, bottom: r.bottom, right: window.innerWidth - r.right });
                        setMenuOpenId(item.id);
                      }}
                      title={t('inv.thActions')}
                      aria-haspopup="menu"
                      aria-expanded={menuOpenId === item.id}
                      style={{ padding: '10px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', display: 'flex' }}
                    >
                      <Icon icon="lucide:more-vertical" style={{ fontSize: '1.2rem' }} />
                    </button>

                    {menuOpenId === item.id && menuAnchor && (() => {
                      // Flip upward when there isn't room for the ~5-item menu below.
                      const MENU_H = 260;
                      const openUp = menuAnchor.bottom + MENU_H > window.innerHeight;
                      return (
                      <>
                        {/* click-away backdrop */}
                        <div onClick={() => setMenuOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                        <div role="menu" style={{ position: 'fixed', ...(openUp ? { bottom: window.innerHeight - menuAnchor.top + 6 } : { top: menuAnchor.bottom + 6 }), right: menuAnchor.right, zIndex: 41, minWidth: '180px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 12px 30px rgba(0,0,0,0.18)', overflow: 'hidden', padding: '6px' }}>
                          <button role="menuitem" className="inv-menu-item" onClick={() => { setMenuOpenId(null); setHistoryModalItem(item.name); fetchHistoryLogs(); }} style={menuItemStyle}>
                            <Icon icon="lucide:history" style={{ fontSize: '1.15rem', color: '#8e44ad' }} />{t('inv.btnHistory')}
                          </button>
                          <button role="menuitem" className="inv-menu-item" onClick={() => { setMenuOpenId(null); returnToItemId.current = item.id; setRestockingItem({ ...item, qtyBought: '', totalPaid: '', paymentSource: 'caja', madeDate: todayStr(), receivedDate: todayStr() }); setEditingItem(null); setAuditingItem(null); setActiveView('list'); }} style={menuItemStyle}>
                            <Icon icon="lucide:package-plus" style={{ fontSize: '1.15rem', color: '#27ae60' }} />{t('inv.restock')}
                          </button>
                          <button role="menuitem" className="inv-menu-item" onClick={() => { setMenuOpenId(null); returnToItemId.current = item.id; setAuditingItem({ ...item, actualCount: item.current_stock, reason: 'waste' }); setEditingItem(null); setRestockingItem(null); setActiveView('list'); }} style={menuItemStyle}>
                            <Icon icon="lucide:clipboard-check" style={{ fontSize: '1.15rem', color: '#e67e22' }} />{t('inv.btnAudit')}
                          </button>
                          <button role="menuitem" className="inv-menu-item" onClick={() => { setMenuOpenId(null); returnToItemId.current = item.id; setEditingItem({ ...item, unit_cost: fromMillicents(item.unit_cost || 0), total_cost: formatForDisplay(millicentsToCents(item.current_stock * (item.unit_cost || 0))) }); setAuditingItem(null); setRestockingItem(null); setActiveView('list'); }} style={menuItemStyle}>
                            <Icon icon="lucide:edit-2" style={{ fontSize: '1.15rem', color: 'var(--brand-color)' }} />{t('inv.btnEdit')}
                          </button>
                          <button role="menuitem" className="inv-menu-item" onClick={() => { setMenuOpenId(null); handleDelete(item.id, item.name); }} style={menuItemStyle}>
                            <Icon icon="lucide:trash-2" style={{ fontSize: '1.15rem', color: '#e74c3c' }} />{t('inv.btnDelete')}
                          </button>
                        </div>
                      </>
                      );
                    })()}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .hover-row:hover {
          background: rgba(0,0,0,0.01);
        }
        .inv-menu-item:hover {
          background: var(--bg-main) !important;
        }
      `}</style>
    </div>
  );
}

export default InventoryTab;
