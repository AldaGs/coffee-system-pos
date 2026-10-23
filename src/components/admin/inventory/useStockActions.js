import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { db } from '../../../db';
import { isLocalMode } from '../../../utils/appMode';
import { useTranslation } from '../../../hooks/useTranslation';
import { logActivity } from '../../../services/activityService';
import { useUpgradeNagStore } from '../../../store/useUpgradeNagStore';
import { consumeLotsFIFO, canReachCloud } from '../../../services/inventoryService';
import { toCents, toMillicents, formatForDisplay, formatMillicentsForDisplay, millicentsToCents } from '../../../utils/moneyUtils';
import {
  persistInventory, persistInventoryLog, persistInventoryExpense, registerLot, topUpNewestLot, paymentTag, todayStr,
} from './inventoryStore';
import { blendedUnitCost, transformCosts } from './stockMath';

const emptyNewItem = () => ({ name: '', current_stock: '', unit: 'g', total_cost: '', paymentSource: 'caja', trackLots: false, madeDate: todayStr(), receivedDate: todayStr() });
const emptyTransform = () => ({ sourceItemId: '', amountUsed: '', yieldQty: '', targetItemName: '', operationalCost: '', paymentSource: 'caja', madeDate: todayStr(), receivedDate: todayStr() });

const stockLog = (itemName, qtyDeducted, type, unitCost, ticketId, createdAt = new Date().toISOString()) => ({
  item_name: itemName, qty_deducted: qtyDeducted, deduction_type: type, created_at: createdAt,
  ticket_id: ticketId, unit_cost: unitCost, local_id: crypto.randomUUID(),
});

// Inventory costs are recorded as money that left, tagged with the pocket it came from.
const inventoryExpense = (amount, label, paymentSource) => ({
  amount, reason: label, category: 'Inventario', payment_source: paymentSource, cashier_name: 'Inventory System',
});

// Receiving, roasting (transform), editing, counting, restocking and deleting stock.
// qty_deducted is negative when stock is added.
export function useStockActions({ inventoryItems, setInventoryItems, showAlert, showConfirm, setActiveView }) {
  const { t } = useTranslation();
  const [newItem, setNewItem] = useState(emptyNewItem);
  const [transformForm, setTransformForm] = useState(emptyTransform);
  const [editingItem, setEditingItem] = useState(null);
  const [auditingItem, setAuditingItem] = useState(null);
  const [restockingItem, setRestockingItem] = useState(null);

  const replaceItem = (saved, id) => setInventoryItems(inventoryItems.map((item) => (item.id === id ? saved : item)));

  const handleAddItem = async () => {
    if (!newItem.name || newItem.current_stock === '') return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc1'));
    const stockVal = parseFloat(newItem.current_stock);
    const costInCents = toCents(newItem.total_cost);
    const unitCost = stockVal > 0 ? Math.round((costInCents * 100) / stockVal) : 0;
    // Received roasted coffee or batch product is lot-tracked from the start.
    const itemToSave = { name: newItem.name, current_stock: stockVal, unit: newItem.unit, unit_cost: unitCost, track_lots: !!newItem.trackLots };

    try {
      const saved = await persistInventory(itemToSave);
      if (newItem.trackLots && stockVal > 0) {
        try {
          await registerLot({ itemName: itemToSave.name, qty: stockVal, unit: newItem.unit, unitCost, madeDate: newItem.madeDate, receivedDate: newItem.receivedDate });
        } catch (e) { console.warn('Lot registration on receive skipped:', e?.message); }
      }
      await persistInventoryLog(stockLog(itemToSave.name, -stockVal, 'added', unitCost, `ADD-${Date.now()}`));
      if (costInCents > 0) {
        try {
          await persistInventoryExpense(inventoryExpense(costInCents, `Inventory Purchase${paymentTag(newItem.paymentSource)}: ${newItem.name} (${stockVal}${newItem.unit})`, newItem.paymentSource));
        } catch (e) { console.error('Failed to log purchase expense:', e); }
      }
      logActivity('inventory_created', null, { name: itemToSave.name, stock: stockVal, unit: itemToSave.unit });

      setInventoryItems([...inventoryItems, saved]);
      setNewItem(emptyNewItem());
      setActiveView('list');
      useUpgradeNagStore.getState().trigger('inventory_logged');
      showAlert(t('inv.alertSuccess'), `${itemToSave.name} ${t('inv.added')}`);
    } catch {
      showAlert(t('inv.alertError'), t('inv.alertErrorDesc1'));
    }
  };

  // Roasting: `amountUsed` of the source becomes `yieldQty` of the target (new or existing).
  const handleTransformStock = async () => {
    const f = transformForm;
    if (!f.sourceItemId || !f.amountUsed || !f.yieldQty || !f.targetItemName) return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc2'));
    const source = inventoryItems.find((i) => i.id === parseInt(f.sourceItemId));
    const used = parseFloat(f.amountUsed);
    const yieldQty = parseFloat(f.yieldQty);
    const opCost = parseFloat(f.operationalCost) || 0;
    if (used > source.current_stock) return showAlert(t('inv.alertNotEnough'), `Solo hay ${source.current_stock}${source.unit} de ${source.name}.`);
    if (!(yieldQty > 0) || yieldQty > used) return showAlert(t('inv.alertMissing'), t('inv.alertInvalidYield'));

    const existingTarget = inventoryItems.find((i) => i.name.toLowerCase().trim() === f.targetItemName.toLowerCase().trim());
    const { stock: targetStock, unitCost: targetUnitCost } = transformCosts({
      sourceUnitCost: source.unit_cost, used, yieldQty, opCostMillicents: toMillicents(opCost), existingTarget,
    });

    try {
      const updatedSource = await persistInventory({ current_stock: source.current_stock - used }, source.id);
      const target = { name: existingTarget ? existingTarget.name : f.targetItemName.trim(), current_stock: targetStock, unit: source.unit, unit_cost: targetUnitCost };

      // The cloud upserts by unique name; locally we pick update vs insert ourselves.
      let targetRow;
      if (isLocalMode()) {
        targetRow = await persistInventory(target, existingTarget ? existingTarget.id : undefined);
      } else {
        const { data, error } = await supabase.from('inventory').upsert([target], { onConflict: 'name' }).select();
        if (error) throw error;
        await db.inventory.put(data[0]);
        targetRow = data[0];
      }

      const at = new Date().toISOString();
      const ticketId = `XFR-${Date.now()}`;
      await persistInventoryLog(stockLog(source.name, used, 'transform_out', source.unit_cost, ticketId, at));
      await persistInventoryLog(stockLog(target.name, -yieldQty, 'transform_in', targetUnitCost, ticketId, at));

      setInventoryItems((prev) => {
        const next = prev.map((i) => (i.id === updatedSource.id ? updatedSource : i));
        return existingTarget ? next.map((i) => (i.id === existingTarget.id ? targetRow : i)) : [...next, targetRow];
      });

      if (opCost > 0) {
        try {
          await persistInventoryExpense(inventoryExpense(toCents(opCost), `Transform${paymentTag(f.paymentSource)}: ${target.name} (${yieldQty}${source.unit})`, f.paymentSource));
        } catch (e) { console.error('Failed to log transform cost expense:', e); }
      }

      // Lot + track_lots come after the stock change has committed, so an install
      // without the lots schema still roasts and just skips the lot.
      try {
        await registerLot({
          itemName: target.name, qty: yieldQty, unit: source.unit, unitCost: targetUnitCost,
          madeDate: f.madeDate, receivedDate: f.receivedDate, sourceName: source.name,
        });
        const tracked = await persistInventory({ track_lots: true }, targetRow.id);
        setInventoryItems((prev) => prev.map((i) => (i.id === targetRow.id ? { ...i, ...tracked, track_lots: true } : i)));
      } catch (e) {
        console.warn('Lot registry update skipped (schema 1.2 not applied?):', e?.message);
      }

      setActiveView('list');
      setTransformForm(emptyTransform());
      showAlert(t('inv.alertTransformComplete'), existingTarget
        ? `${t('inv.added')} ${yieldQty}g ${t('inv.to')} ${existingTarget.name}. ${t('inv.newTotal')} ${targetStock}g ${t('inv.at')} ${formatMillicentsForDisplay(targetUnitCost)}/g.`
        : `${t('inv.roastCompleteMsg')} ${yieldQty}g de ${target.name} ${t('inv.at')} ${formatMillicentsForDisplay(targetUnitCost)}/g.`);
    } catch (err) {
      console.error(err);
      showAlert(t('inv.alertError'), t('inv.alertTransformFail'));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem.name || editingItem.current_stock === '') return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc3'));
    try {
      const saved = await persistInventory({
        name: editingItem.name,
        current_stock: parseFloat(editingItem.current_stock),
        unit: editingItem.unit,
        unit_cost: toMillicents(editingItem.unit_cost),
        reorder_point: Math.max(0, parseFloat(editingItem.reorder_point) || 0),
      }, editingItem.id);
      replaceItem(saved, editingItem.id);
      setEditingItem(null);
    } catch (err) {
      console.error(err);
      showAlert(t('inv.alertError'), t('inv.alertUpdateFail'));
    }
  };

  // A physical count: the difference is logged as waste (or a correction when stock was found).
  const handleSaveAudit = async () => {
    const item = auditingItem;
    const actualCount = parseFloat(item.actualCount);
    if (isNaN(actualCount)) return showAlert(t('inv.alertInvalidCount'), t('inv.alertInvalidCountDesc'));
    const variance = actualCount - item.current_stock;
    if (variance === 0) {
      setAuditingItem(null);
      return showAlert(t('inv.alertVerified'), t('inv.alertVerifiedDesc'));
    }
    const unitCost = item.unit_cost || 0;
    const impactCents = millicentsToCents(variance * unitCost);

    try {
      const saved = await persistInventory({ current_stock: actualCount }, item.id);
      await persistInventoryLog(stockLog(item.name, -variance, variance < 0 ? (item.reason || 'waste') : 'audit_correction', unitCost, `AUDIT-${Date.now()}`));
      if (item.track_lots) {
        try {
          if (variance < 0) await consumeLotsFIFO(item.name, Math.abs(variance));
          else await topUpNewestLot(item.name, variance, item.unit, unitCost);
        } catch (e) { console.warn('Audit lot reconciliation skipped:', e?.message); }
      }
      replaceItem(saved, item.id);
      setAuditingItem(null);
      logActivity('inventory_audit', null, { name: item.name, variance, financial_impact: impactCents });
      showAlert(t('inv.alertAuditComplete'), variance < 0
        ? `${t('inv.loggedLoss')} ${Math.abs(variance)}${item.unit} (-${formatForDisplay(Math.abs(impactCents))})`
        : `${t('inv.foundExtra')} ${variance}${item.unit} (+${formatForDisplay(impactCents)})`);
    } catch (err) {
      console.error('Audit error:', err);
      showAlert(t('inv.alertError'), t('inv.alertAuditFail'));
    }
  };

  const handleSaveRestock = async () => {
    const item = restockingItem;
    const qtyBought = parseFloat(item.qtyBought);
    const paidCents = toCents(item.totalPaid);
    if (isNaN(qtyBought) || qtyBought <= 0 || isNaN(paidCents) || paidCents < 0) return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc3'));
    const newStock = item.current_stock + qtyBought;
    const newUnitCost = blendedUnitCost(item.current_stock, item.unit_cost, qtyBought, paidCents * 100);
    if (newUnitCost < 0) return showAlert(t('common.error'), 'Negative COGS: The calculated unit cost is negative. Please check your total paid amount.');

    try {
      const saved = await persistInventory({ current_stock: newStock, unit_cost: newUnitCost }, item.id);
      await persistInventoryLog(stockLog(item.name, -qtyBought, 'restock', newUnitCost, `RESTOCK-${Date.now()}`));
      // A restock of a lot-tracked item is a new delivery, so it opens a new lot.
      if (item.track_lots) {
        try {
          await registerLot({ itemName: item.name, qty: qtyBought, unit: item.unit, unitCost: newUnitCost, madeDate: item.madeDate, receivedDate: item.receivedDate });
        } catch (e) { console.warn('Lot registration on restock skipped:', e?.message); }
      }
      if (paidCents > 0) {
        await persistInventoryExpense(inventoryExpense(paidCents, `RESTOCK${paymentTag(item.paymentSource)}: ${item.name} (${qtyBought}${item.unit})`, item.paymentSource));
      }
      logActivity('inventory_restock', null, { name: item.name, qty: qtyBought, unit: item.unit, cost: paidCents });
      replaceItem(saved, item.id);
      setRestockingItem(null);
      useUpgradeNagStore.getState().trigger('inventory_logged');
      showAlert(t('inv.alertRestockComplete'), `${qtyBought}${item.unit} ${t('inv.added')} ${t('inv.to')} ${item.name}.`);
    } catch (err) {
      console.error(err);
      showAlert(t('inv.alertError'), t('inv.alertUpdateFail'));
    }
  };

  const handleDelete = (id, name) => {
    showConfirm(t('inv.confirmDelete'), `${t('inv.confirmDeleteDesc')} ${name}?`, async () => {
      const item = inventoryItems.find((i) => i.id === id);
      if (!isLocalMode()) await supabase.from('inventory').delete().eq('id', id);
      await db.inventory.delete(id);

      // Logs and lots link by name, so rename the old ones; otherwise a new item
      // with the same name would inherit this one's history and lots.
      const tombstone = `${name} (eliminado ${new Date().toISOString().slice(0, 10)})`;
      try {
        const oldLogs = await db.inventory_logs.where('item_name').equals(name).toArray();
        await Promise.all(oldLogs.map((l) => db.inventory_logs.update(l.id, { item_name: tombstone })));
        const oldLots = await db.inventory_lots.where('item_name').equals(name).toArray();
        await Promise.all(oldLots.map((l) => db.inventory_lots.update(l.id, { item_name: tombstone, pending_sync: true })));
        if (canReachCloud()) {
          await supabase.from('inventory_logs').update({ item_name: tombstone }).eq('item_name', name);
          await supabase.from('inventory_lots').update({ item_name: tombstone }).eq('item_name', name);
          await supabase.from('lot_consumptions').update({ item_name: tombstone }).eq('item_name', name);
        }
        const oldCons = await db.lot_consumptions.where('item_name').equals(name).toArray();
        await Promise.all(oldCons.map((c) => db.lot_consumptions.update(c.id, { item_name: tombstone })));
      } catch (e) {
        console.warn('History tombstone skipped:', e?.message);
      }

      // Records what was lost, so a deletion can still be reconciled.
      await persistInventoryLog(stockLog(tombstone, item?.current_stock ?? 0, 'removed', item?.unit_cost ?? 0, `DEL-${Date.now()}`));
      logActivity('inventory_deleted', null, {
        name, stock_at_delete: item?.current_stock ?? null, unit: item?.unit ?? null, unit_cost_at_delete: item?.unit_cost ?? null,
      });
      setInventoryItems(inventoryItems.filter((i) => i.id !== id));
    });
  };

  return {
    newItem, setNewItem, handleAddItem, transformForm, setTransformForm, handleTransformStock,
    editingItem, setEditingItem, handleSaveEdit, auditingItem, setAuditingItem, handleSaveAudit,
    restockingItem, setRestockingItem, handleSaveRestock, handleDelete,
  };
}
