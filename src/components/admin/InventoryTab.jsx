import { Icon } from '@iconify/react';
import { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { db } from '../../db';
import { useTranslation } from '../../hooks/useTranslation';
import { logActivity } from '../../services/activityService';

function InventoryTab({ inventoryItems, setInventoryItems, showAlert, showConfirm }) {
  const { t } = useTranslation();
  
  const [activeView, setActiveView] = useState('list'); // 'list', 'add', 'transform'
  
  const [newItem, setNewItem] = useState({ name: '', current_stock: '', unit: 'g', total_cost: '' });
  const [transformForm, setTransformForm] = useState({ sourceItemId: '', amountUsed: '', shrinkagePerc: 20, targetItemName: '', operationalCost: '' });
  const [editingItem, setEditingItem] = useState(null);
  
  // --- NEW: AUDIT STATE ---
  const [auditingItem, setAuditingItem] = useState(null);

  // --- NEW: RESTOCK STATE ---
  const [restockingItem, setRestockingItem] = useState(null);

  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  const handleAddItem = async () => {
    // 1. Removed total_cost from the strict validation
    if (!newItem.name || newItem.current_stock === '') {
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc1'));
    }

    const stockVal = parseFloat(newItem.current_stock);
    // 2. Safely fallback to 0 if left blank
    const costVal = newItem.total_cost === '' ? 0 : parseFloat(newItem.total_cost);
    const calculatedUnitCost = stockVal > 0 ? (costVal / stockVal) : 0;

    const itemToSave = {
      name: newItem.name,
      current_stock: stockVal,
      unit: newItem.unit,
      unit_cost: calculatedUnitCost
    };

    try {
      const { data, error } = await supabase.from('inventory').insert([itemToSave]).select();
      if (error) throw error;

      // 3. ONLY create an expense if they actually entered a cost > 0
      if (costVal > 0) {
        const purchaseExpense = {
          amount: costVal,
          reason: `Inventory Purchase: ${newItem.name} (${stockVal}${newItem.unit})`,
          category: 'Inventario',
          cashier_name: 'Inventory System' 
        };
        const { error: expenseError } = await supabase.from('expenses').insert([purchaseExpense]);
        if (expenseError) console.error("Failed to log purchase expense:", expenseError);
      }
      
      // LOG ACTIVITY
      logActivity('inventory_created', null, { name: itemToSave.name, stock: stockVal, unit: itemToSave.unit });

      await db.inventory.put(data[0]);
      setInventoryItems([...inventoryItems, data[0]]);
      setNewItem({ name: '', current_stock: '', unit: 'g', total_cost: '' });
      setActiveView('list');
      
      showAlert(t('inv.alertSuccess'), `${itemToSave.name} ${t('inv.added')}`);
    } catch (_UNUSED) { // eslint-disable-line no-unused-vars
      showAlert(t('inv.alertError'), t('inv.alertErrorDesc1'));
    }
  };

  // --- 2. THE ROASTER (TRANSFORM STOCK) ---
  const handleTransformStock = async () => {
    if (!transformForm.sourceItemId || !transformForm.amountUsed || !transformForm.targetItemName) {
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc2'));
    }

    const sourceItem = inventoryItems.find(i => i.id === parseInt(transformForm.sourceItemId));
    const usedQty = parseFloat(transformForm.amountUsed);
    const shrinkPerc = parseFloat(transformForm.shrinkagePerc);
    const opCost = parseFloat(transformForm.operationalCost) || 0; 

    if (usedQty > sourceItem.current_stock) {
      return showAlert(t('inv.alertNotEnough'), `Solo hay ${sourceItem.current_stock}${sourceItem.unit} de ${sourceItem.name}.`);
    }

    const yieldMultiplier = (100 - shrinkPerc) / 100;
    const finalYieldQty = usedQty * yieldMultiplier;
    
    const totalCostOfUsedRawMaterial = (usedQty * sourceItem.unit_cost) + opCost; 
    const newRoastedUnitCost = totalCostOfUsedRawMaterial / finalYieldQty;

    const existingTarget = inventoryItems.find(
      i => i.name.toLowerCase().trim() === transformForm.targetItemName.toLowerCase().trim()
    );

    let finalStockForTarget = finalYieldQty;
    let finalUnitCost = newRoastedUnitCost;

    if (existingTarget) {
      finalStockForTarget = existingTarget.current_stock + finalYieldQty;
      const oldTotalValue = existingTarget.current_stock * (existingTarget.unit_cost || 0);
      const newTotalValue = finalYieldQty * newRoastedUnitCost;
      finalUnitCost = (oldTotalValue + newTotalValue) / finalStockForTarget;
    }

    try {
      const newSourceStock = sourceItem.current_stock - usedQty;
      await supabase.from('inventory').update({ current_stock: newSourceStock }).eq('id', sourceItem.id);

      const targetItemPayload = {
        name: existingTarget ? existingTarget.name : transformForm.targetItemName.trim(),
        current_stock: finalStockForTarget,
        unit: sourceItem.unit, 
        unit_cost: finalUnitCost
      };

      const { data: upsertData, error: upsertErr } = await supabase.from('inventory').upsert([targetItemPayload], { onConflict: 'name' }).select();
      if (upsertErr) throw upsertErr;

      const updatedSource = { ...sourceItem, current_stock: newSourceStock };
      setInventoryItems(prev => {
        let next = prev.map(i => i.id === updatedSource.id ? updatedSource : i);
        if (existingTarget) {
           next = next.map(i => i.id === existingTarget.id ? upsertData[0] : i);
        } else {
           next = [...next, upsertData[0]];
        }
        return next;
      });

      setActiveView('list');
      setTransformForm({ sourceItemId: '', amountUsed: '', shrinkagePerc: 20, targetItemName: '', operationalCost: '' });
      
      const successMsg = existingTarget 
        ? `${t('inv.added')} ${finalYieldQty}g ${t('inv.to')} ${existingTarget.name}. ${t('inv.newTotal')} ${finalStockForTarget}g ${t('inv.at')} $${finalUnitCost.toFixed(4)}/g.`
        : `${t('inv.roastCompleteMsg')} ${finalYieldQty}g de ${targetItemPayload.name} ${t('inv.at')} $${finalUnitCost.toFixed(4)}/g.`;
        
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
        // 2. Safely fallback to 0 if left blank
        unit_cost: editingItem.unit_cost === '' ? 0 : parseFloat(editingItem.unit_cost)
      };

      const { data, error } = await supabase.from('inventory').update(payload).eq('id', editingItem.id).select();
      if (error) throw error;

      await db.inventory.put(data[0]);
      setInventoryItems(inventoryItems.map(item => item.id === editingItem.id ? data[0] : item));
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

    const financialImpact = variance * (auditingItem.unit_cost || 0);
    const deductionType = variance < 0 ? (auditingItem.reason || 'waste') : 'audit_correction';

    try {
      const { data, error } = await supabase.from('inventory').update({ current_stock: actualCount }).eq('id', auditingItem.id).select();
      if (error) throw error;

      const auditLog = {
        item_name: auditingItem.name,
        qty_deducted: Math.abs(variance),
        deduction_type: deductionType,
        created_at: new Date().toISOString(),
        ticket_id: `AUDIT-${Date.now()}` 
      };

      const { error: logError } = await supabase.from('inventory_logs').insert([auditLog]);
      if (logError) throw logError;

      await db.inventory.put(data[0]);
      setInventoryItems(inventoryItems.map(item => item.id === auditingItem.id ? data[0] : item));
      setAuditingItem(null); 

      const impactMsg = variance < 0 
        ? `${t('inv.loggedLoss')} ${Math.abs(variance)}${auditingItem.unit} (-$${Math.abs(financialImpact).toFixed(2)})`
        : `${t('inv.foundExtra')} ${variance}${auditingItem.unit} (+$${financialImpact.toFixed(2)})`;

      // LOG ACTIVITY
      logActivity('inventory_audit', null, { name: auditingItem.name, variance, financial_impact: financialImpact });

      showAlert(t('inv.alertAuditComplete'), impactMsg);

    } catch (err) {
      console.error("Audit error:", err);
      showAlert(t('inv.alertError'), t('inv.alertAuditFail'));
    }
  };

  // --- 5. NEW: SAVE RESTOCK LOG ---
  const handleSaveRestock = async () => {
    const qtyBought = parseFloat(restockingItem.qtyBought);
    const totalPaid = parseFloat(restockingItem.totalPaid);
    
    if (isNaN(qtyBought) || qtyBought <= 0 || isNaN(totalPaid) || totalPaid < 0) {
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc3'));
    }

    const oldStock = restockingItem.current_stock;
    const oldCost = restockingItem.unit_cost || 0;
    const oldTotalValue = oldStock * oldCost;

    const newStock = oldStock + qtyBought;
    const newTotalValue = oldTotalValue + totalPaid;
    const newUnitCost = newStock > 0 ? newTotalValue / newStock : 0;

    if (newUnitCost < 0) {
      return showAlert(t('common.error'), "Negative COGS: The calculated unit cost is negative. Please check your total paid amount.");
    }


    try {
      const { data, error } = await supabase.from('inventory')
        .update({ current_stock: newStock, unit_cost: newUnitCost })
        .eq('id', restockingItem.id).select();
      if (error) throw error;

      const restockLog = {
        item_name: restockingItem.name,
        qty_deducted: -qtyBought, // Negative means addition of stock
        deduction_type: 'restock',
        created_at: new Date().toISOString(),
        ticket_id: `RESTOCK-${Date.now()}`
      };
      await supabase.from('inventory_logs').insert([restockLog]);

      if (restockingItem.paidFromRegister && totalPaid > 0) {
        const expense = {
          amount: totalPaid,
          reason: `RESTOCK: ${restockingItem.name} (${qtyBought}${restockingItem.unit})`,
          category: 'Inventario',
          cashier_name: 'Inventory System'
        };
        await supabase.from('expenses').insert([expense]);
      }

      // LOG ACTIVITY
      logActivity('inventory_restock', null, { name: restockingItem.name, qty: qtyBought, unit: restockingItem.unit, cost: totalPaid });

      await db.inventory.put(data[0]);
      setInventoryItems(inventoryItems.map(item => item.id === restockingItem.id ? data[0] : item));
      setRestockingItem(null);

      showAlert(t('inv.alertRestockComplete'), `${qtyBought}${restockingItem.unit} ${t('inv.added')} ${t('inv.to')} ${restockingItem.name}.`);

    } catch (err) {
      console.error(err);
      showAlert(t('inv.alertError'), t('inv.alertUpdateFail'));
    }
  };

  const handleDelete = (id, name) => {
    showConfirm(t('inv.confirmDelete'), `${t('inv.confirmDeleteDesc')} ${name}?`, async () => {
      await supabase.from('inventory').delete().eq('id', id);
      await db.inventory.delete(id);
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
        <div style={{ display: 'flex', gap: '12px' }}>
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
        </div>
      </div>
      
      {activeView === 'add' && !editingItem && !auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '1px solid var(--border)', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:package-plus" style={{ color: 'var(--brand-color)' }} />
            {t('inv.receiveTitle')}
          </h3>
          <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.itemName')}</label>
              <input type="text" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.stockQty')}</label>
              <input type="number" value={newItem.current_stock} onChange={e => setNewItem({...newItem, current_stock: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.unit')}</label>
              <select value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                <option value="g">{t('inv.unitG')}</option>
                <option value="ml">{t('inv.unitMl')}</option>
                <option value="units">{t('inv.unitPieces')}</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.totalCost')}</label>
              <input type="number" placeholder={t('inv.invoiceTotal')} value={newItem.total_cost} onChange={e => setNewItem({...newItem, total_cost: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <button onClick={handleAddItem} style={{ padding: '12px 24px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(46, 204, 113, 0.2)' }}>{t('inv.btnSave')}</button>
          </div>
        </div>
      )}

      {activeView === 'transform' && !editingItem && !auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '2px solid #e67e22', boxShadow: '0 10px 20px rgba(230, 126, 34, 0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#e67e22', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:flame" />
            {t('inv.roastTitle')}
          </h3>
          <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr auto', gap: '16px', alignItems: 'flex-end' }}>
            <div style={{ minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.rawMaterial')}</label>
              <select value={transformForm.sourceItemId} onChange={e => setTransformForm({...transformForm, sourceItemId: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                <option value="">{t('inv.selectOption')}</option>
                {sortedItems.map(item => <option key={item.id} value={item.id}>{item.name} ({t('inv.has')} {item.current_stock}{item.unit})</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.usedQty')}</label>
              <input type="number" value={transformForm.amountUsed} onChange={e => setTransformForm({...transformForm, amountUsed: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.shrink')}</label>
              <input type="number" value={transformForm.shrinkagePerc} onChange={e => setTransformForm({...transformForm, shrinkagePerc: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.opCost')}</label>
              <input type="number" placeholder="e.g. 275" value={transformForm.operationalCost} onChange={e => setTransformForm({...transformForm, operationalCost: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.targetItem')}</label>
              <input 
                type="text" 
                list="inventory-names" 
                placeholder={t('inv.typeNewOrSelect')} 
                value={transformForm.targetItemName} 
                onChange={e => setTransformForm({...transformForm, targetItemName: e.target.value})} 
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

      {/* --- EDIT ITEM UI --- */}
      {editingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '1px solid var(--brand-color)', boxShadow: '0 10px 30px rgba(52, 152, 219, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
             <h3 style={{ margin: 0, color: 'var(--brand-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
               <Icon icon="lucide:edit-3" />
               {t('inv.editTitle')}
             </h3>
             <button onClick={() => setEditingItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex' }}>
               <Icon icon="lucide:x" />
             </button>
          </div>
          
          <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.itemName')}</label>
              <input type="text" value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.currentStock')}</label>
              <input type="number" value={editingItem.current_stock} onChange={e => {
                const newStock = e.target.value;
                const unitPrice = parseFloat(editingItem.unit_cost) || 0;
                setEditingItem({
                  ...editingItem, 
                  current_stock: newStock,
                  total_cost: newStock === '' ? '' : (parseFloat(newStock) * unitPrice).toFixed(2)
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
                  total_cost: newUnit === '' ? '' : (parseFloat(newUnit) * stock).toFixed(2)
                });
              }} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>

            <button onClick={handleSaveEdit} style={{ padding: '12px 24px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(52, 152, 219, 0.2)' }}>{t('inv.btnUpdate')}</button>
          </div>
        </div>
      )}

      {/* --- NEW: RESTOCK UI --- */}
      {restockingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '2px solid #27ae60', boxShadow: '0 10px 30px rgba(39, 174, 96, 0.1)' }}>
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
              <input type="number" placeholder="0" value={restockingItem.qtyBought || ''} onChange={e => setRestockingItem({...restockingItem, qtyBought: e.target.value})} style={{ width: '100%', padding: '16px', fontSize: '1.2rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.totalPaid')} ($)</label>
              <input type="number" placeholder="0.00" value={restockingItem.totalPaid || ''} onChange={e => setRestockingItem({...restockingItem, totalPaid: e.target.value})} style={{ width: '100%', padding: '16px', fontSize: '1.2rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input 
                  type="checkbox" 
                  checked={restockingItem.paidFromRegister || false} 
                  onChange={e => setRestockingItem({...restockingItem, paidFromRegister: e.target.checked})} 
                  style={{ width: '18px', height: '18px', accentColor: '#27ae60' }} 
                />
                {t('inv.paidFromRegister')}
              </label>
            </div>

            <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'flex-start' }}>
              <button onClick={handleSaveRestock} style={{ height: '55px', padding: '0 30px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(39, 174, 96, 0.2)' }}>
                {t('inv.restock')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- NEW: AUDIT / WASTAGE UI --- */}
      {auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '2px solid #e74c3c', boxShadow: '0 10px 30px rgba(231, 76, 60, 0.1)' }}>
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
              const financialImpact = Math.abs(variance * (auditingItem.unit_cost || 0));

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="mobile-flex-stack" style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, padding: '12px', background: isLoss ? 'rgba(231,76,60,0.05)' : 'rgba(46,204,113,0.05)', borderRadius: '12px', border: `1px solid ${isLoss ? 'rgba(231,76,60,0.2)' : 'rgba(46,204,113,0.2)'}`, textAlign: 'center' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', color: isLoss ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>{t('inv.variance')}</p>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isLoss ? '#e74c3c' : '#2ecc71' }}>{variance > 0 ? '+' : ''}{variance} {auditingItem.unit}</div>
                    </div>
                    <div style={{ flex: 1, padding: '12px', background: isLoss ? 'rgba(231,76,60,0.05)' : 'rgba(46,204,113,0.05)', borderRadius: '12px', border: `1px solid ${isLoss ? 'rgba(231,76,60,0.2)' : 'rgba(46,204,113,0.2)'}`, textAlign: 'center' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', color: isLoss ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>{t('inv.financialImpact')}</p>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isLoss ? '#e74c3c' : '#2ecc71' }}>{isLoss ? '-' : '+'}${financialImpact.toFixed(2)}</div>
                    </div>
                  </div>

                  {isLoss && (
                    <select value={auditingItem.reason || 'waste'} onChange={e => setAuditingItem({...auditingItem, reason: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
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
            {sortedItems.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} className="hover-row">
                <td data-label={t('inv.thName')} style={{ padding: '20px 24px', fontWeight: '700', fontSize: '1rem' }}>{item.name}</td>
                <td data-label={t('inv.thStock')} style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: item.current_stock < (item.unit === 'g' ? 2000 : 10) ? 'rgba(231, 76, 60, 0.1)' : 'rgba(46, 204, 113, 0.1)', borderRadius: '20px', color: item.current_stock < (item.unit === 'g' ? 2000 : 10) ? '#e74c3c' : '#27ae60', fontWeight: 'bold', fontSize: '0.95rem' }}>
                    <Icon icon={item.current_stock < (item.unit === 'g' ? 2000 : 10) ? 'lucide:alert-circle' : 'lucide:check-circle'} />
                    {item.current_stock} {item.unit}
                  </div>
                </td>
                <td data-label={t('inv.thCost')} style={{ padding: '20px 24px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '1rem' }}>
                  ${Number(item.unit_cost || 0).toFixed(4)} / {item.unit}
                </td>
                <td data-label={t('inv.thActions')} style={{ padding: '20px 24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={() => { 
                        setRestockingItem({ ...item, qtyBought: '', totalPaid: '', paidFromRegister: false }); 
                        setEditingItem(null);
                        setAuditingItem(null);
                        setActiveView('list'); 
                      }} 
                      title={t('inv.restock')}
                      style={{ padding: '10px', background: 'var(--bg-main)', color: '#27ae60', border: '1px solid rgba(39, 174, 96, 0.2)', borderRadius: '10px', cursor: 'pointer', display: 'flex' }}
                    >
                      <Icon icon="lucide:package-plus" style={{ fontSize: '1.2rem' }} />
                    </button>

                    <button 
                      onClick={() => { 
                        setAuditingItem({ ...item, actualCount: item.current_stock, reason: 'waste' }); 
                        setEditingItem(null);
                        setRestockingItem(null);
                        setActiveView('list'); 
                      }} 
                      title={t('inv.btnAudit')}
                      style={{ padding: '10px', background: 'var(--bg-main)', color: '#e67e22', border: '1px solid rgba(230, 126, 34, 0.2)', borderRadius: '10px', cursor: 'pointer', display: 'flex' }}
                    >
                      <Icon icon="lucide:clipboard-check" style={{ fontSize: '1.2rem' }} />
                    </button>

                    <button 
                      onClick={() => { 
                        setEditingItem({...item, total_cost: (item.current_stock * (item.unit_cost || 0)).toFixed(2)}); 
                        setAuditingItem(null);
                        setActiveView('list'); 
                      }} 
                      title={t('inv.btnEdit')}
                      style={{ padding: '10px', background: 'var(--bg-main)', color: 'var(--brand-color)', border: '1px solid rgba(52, 152, 219, 0.2)', borderRadius: '10px', cursor: 'pointer', display: 'flex' }}
                    >
                      <Icon icon="lucide:edit-2" style={{ fontSize: '1.2rem' }} />
                    </button>
                    
                    <button 
                      onClick={() => handleDelete(item.id, item.name)} 
                      title={t('inv.btnDelete')}
                      style={{ padding: '10px', background: 'rgba(231, 76, 60, 0.05)', color: '#e74c3c', border: '1px solid rgba(231, 76, 60, 0.2)', borderRadius: '10px', cursor: 'pointer', display: 'flex' }}
                    >
                      <Icon icon="lucide:trash-2" style={{ fontSize: '1.2rem' }} />
                    </button>
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
      `}</style>
    </div>
  );
}

export default InventoryTab;
