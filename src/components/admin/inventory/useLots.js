import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { db } from '../../../db';
import { isLocalMode } from '../../../utils/appMode';
import { useTranslation } from '../../../hooks/useTranslation';
import { persistInventory, registerLot, todayStr } from './inventoryStore';

const newestFirst = (key) => (rows) => [...rows].sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')));
const emptyLotForm = () => ({ itemId: '', qty: '', madeDate: todayStr(), receivedDate: todayStr() });

// The lot (batch) registry: received or roasted batches of lot-tracked items,
// and which sales drew from each one.
export function useLots({ inventoryItems, setInventoryItems, showAlert }) {
  const { t } = useTranslation();
  const [lots, setLots] = useState([]);
  const [lotFilterItem, setLotFilterItem] = useState('');
  const [expandedLotId, setExpandedLotId] = useState(null);
  const [lotConsumptions, setLotConsumptions] = useState([]);
  // "Add batch" backfills stock that predates lot tracking; it doesn't change the stock count.
  const [addingLot, setAddingLot] = useState(false);
  const [lotForm, setLotForm] = useState(emptyLotForm);

  // Cloud is the source of truth when reachable and is mirrored to Dexie for offline reads.
  const fetchLots = async () => {
    const sortLocal = newestFirst('made_date');
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

  const fetchLotConsumptions = async (lot) => {
    const sortLocal = newestFirst('created_at');
    const fromDexie = async () => sortLocal(await db.lot_consumptions.where('lot_id').equals(lot.id).toArray());
    try {
      if (isLocalMode()) { setLotConsumptions(await fromDexie()); return; }
      const { data, error } = await supabase.from('lot_consumptions').select('*').eq('lot_id', lot.id).order('created_at', { ascending: false });
      if (error) throw error;
      setLotConsumptions(data || []);
    } catch (err) {
      console.error('Failed to load lot draw-downs:', err);
      try { setLotConsumptions(await fromDexie()); } catch { setLotConsumptions([]); }
    }
  };

  const toggleLotExpand = (lot) => {
    setLotConsumptions([]);
    if (expandedLotId === lot.id) { setExpandedLotId(null); return; }
    setExpandedLotId(lot.id);
    fetchLotConsumptions(lot);
  };

  // Quantity already covered by lots, so the backfill can prefill only the untracked rest.
  const lottedRemaining = (itemName) =>
    lots.filter((l) => l.item_name === itemName).reduce((s, l) => s + (Number(l.qty_remaining) || 0), 0);

  const handleAddBatch = async () => {
    const item = inventoryItems.find((i) => String(i.id) === String(lotForm.itemId));
    const qty = parseFloat(lotForm.qty);
    if (!item || isNaN(qty) || qty <= 0) return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc2'));
    try {
      await registerLot({
        itemName: item.name, qty, unit: item.unit, unitCost: item.unit_cost || 0,
        madeDate: lotForm.madeDate, receivedDate: lotForm.receivedDate,
      });
      // Backfilling makes the item lot-tracked from now on.
      if (!item.track_lots) {
        const saved = await persistInventory({ track_lots: true }, item.id);
        setInventoryItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...saved, track_lots: true } : i)));
      }
      setAddingLot(false);
      setLotForm(emptyLotForm());
      fetchLots();
      showAlert(t('inv.lotAddedTitle'), `${t('inv.thLotCode')}: ${item.name} — ${qty}${item.unit}.`);
    } catch (err) {
      console.error('Add batch failed:', err);
      showAlert(t('inv.alertError'), t('inv.alertError'));
    }
  };

  return {
    lots, lotFilterItem, setLotFilterItem, expandedLotId, lotConsumptions, toggleLotExpand,
    addingLot, setAddingLot, lotForm, setLotForm, lottedRemaining, handleAddBatch, fetchLots,
  };
}
