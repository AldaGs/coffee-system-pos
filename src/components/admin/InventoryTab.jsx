import { Icon } from '@iconify/react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { db } from '../../db';
import { useTranslation } from '../../hooks/useTranslation';
import { isLocalMode } from '../../utils/appMode';
import InfoTip from '../shared/InfoTip';
import { useLots } from './inventory/useLots';
import { useStockActions } from './inventory/useStockActions';
import { AddItemForm, TransformForm } from './inventory/StockForms';
import { LotsView } from './inventory/LotsView';
import { DeletedView, HistoryModal } from './inventory/HistoryViews';
import { EditPanel, RestockPanel, AuditPanel } from './inventory/ItemPanels';
import { LowStockAlert, InventoryList } from './inventory/InventoryList';

function InventoryTab({ inventoryItems, setInventoryItems, showAlert, showConfirm }) {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState('list'); // 'list' | 'add' | 'transform' | 'lots' | 'deleted'
  const {
    lots, lotFilterItem, setLotFilterItem, expandedLotId, lotConsumptions, toggleLotExpand,
    addingLot, setAddingLot, lotForm, setLotForm, lottedRemaining, handleAddBatch, fetchLots,
  } = useLots({ inventoryItems, setInventoryItems, showAlert });
  const {
    newItem, setNewItem, handleAddItem, transformForm, setTransformForm, handleTransformStock,
    editingItem, setEditingItem, handleSaveEdit, auditingItem, setAuditingItem, handleSaveAudit,
    restockingItem, setRestockingItem, handleSaveRestock, handleDelete,
  } = useStockActions({ inventoryItems, setInventoryItems, showAlert, showConfirm, setActiveView });

  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  // The open row menu and its screen position. It renders position:fixed so the
  // card's overflow:hidden and .admin-section's overflow can't clip it.
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);

  // Opening edit/restock/audit scrolls to the panel; closing it scrolls back to
  // the row it came from. Only one panel is open at a time, so they share panelRef.
  const panelRef = useRef(null);
  const rowRefs = useRef(new Map());
  const returnToItemId = useRef(null);
  useEffect(() => {
    if (editingItem || restockingItem || auditingItem) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const id = returnToItemId.current;
    if (!id) return;
    returnToItemId.current = null;
    rowRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editingItem, restockingItem, auditingItem]);

  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyFilterItem, setHistoryFilterItem] = useState('');
  const [historyModalItem, setHistoryModalItem] = useState(null);
  const fetchHistoryLogs = async () => {
    try {
      if (isLocalMode()) {
        setHistoryLogs((await db.inventory_logs.reverse().sortBy('created_at')) || []);
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

  // Rows for the sortable table: plain sort keys plus the original item for rendering.
  const inventoryRows = useMemo(() => inventoryItems.map(item => ({
    id: String(item.id),
    item,
    name: item.name,
    current_stock: parseFloat(item.current_stock) || 0,
    unit_cost: parseFloat(item.unit_cost) || 0,
    actions: '',
  })), [inventoryItems]);

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
        <h2 style={{ margin: 0, fontWeight: '800', fontSize: '1.8rem' }}>{t('inv.title')}{' '}<InfoTip text={t('pageInfo.inventory')} section="inventory" /></h2>
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

      {activeView === 'add' && !editingItem && !auditingItem && <AddItemForm handleAddItem={handleAddItem} newItem={newItem} setNewItem={setNewItem} />}

      {activeView === 'transform' && !editingItem && !auditingItem && <TransformForm handleTransformStock={handleTransformStock} setTransformForm={setTransformForm} sortedItems={sortedItems} transformForm={transformForm} />}

      {activeView === 'lots' && <LotsView addingLot={addingLot} expandedLotId={expandedLotId} handleAddBatch={handleAddBatch} inventoryItems={inventoryItems} lotConsumptions={lotConsumptions} lotFilterItem={lotFilterItem} lotForm={lotForm} lots={lots} lottedRemaining={lottedRemaining} setAddingLot={setAddingLot} setLotFilterItem={setLotFilterItem} setLotForm={setLotForm} sortedItems={sortedItems} toggleLotExpand={toggleLotExpand} />}

      {activeView === 'deleted' && <DeletedView historyFilterItem={historyFilterItem} historyLogs={historyLogs} inventoryItems={inventoryItems} setHistoryFilterItem={setHistoryFilterItem} />}

      {/* --- NEW: PER-ITEM HISTORY MODAL --- */}
      {historyModalItem && <HistoryModal historyLogs={historyLogs} historyModalItem={historyModalItem} setHistoryModalItem={setHistoryModalItem} />}

      {/* --- EDIT ITEM UI --- */}
      {editingItem && <EditPanel editingItem={editingItem} handleSaveEdit={handleSaveEdit} panelRef={panelRef} setEditingItem={setEditingItem} />}

      {/* --- NEW: RESTOCK UI --- */}
      {restockingItem && <RestockPanel handleSaveRestock={handleSaveRestock} panelRef={panelRef} restockingItem={restockingItem} setRestockingItem={setRestockingItem} />}

      {/* --- NEW: AUDIT / WASTAGE UI --- */}
      {auditingItem && <AuditPanel auditingItem={auditingItem} handleSaveAudit={handleSaveAudit} panelRef={panelRef} setAuditingItem={setAuditingItem} />}

      {/* --- LOW-STOCK / REORDER ALERT --- */}
      <LowStockAlert returnToItemId={returnToItemId} setActiveView={setActiveView} setAuditingItem={setAuditingItem} setEditingItem={setEditingItem} setRestockingItem={setRestockingItem} sortedItems={sortedItems} />

      {/* --- INVENTORY LIST --- */}
      <InventoryList fetchHistoryLogs={fetchHistoryLogs} handleDelete={handleDelete} inventoryRows={inventoryRows} menuAnchor={menuAnchor} menuOpenId={menuOpenId} returnToItemId={returnToItemId} rowRefs={rowRefs} setActiveView={setActiveView} setAuditingItem={setAuditingItem} setEditingItem={setEditingItem} setHistoryModalItem={setHistoryModalItem} setMenuAnchor={setMenuAnchor} setMenuOpenId={setMenuOpenId} setRestockingItem={setRestockingItem} setSortConfig={setSortConfig} sortConfig={sortConfig} />
    </div>
  );
}

export default InventoryTab;
