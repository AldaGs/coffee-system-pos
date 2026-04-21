import { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { db } from '../../db';
import { useTranslation } from '../../hooks/useTranslation';

function InventoryTab({ inventoryItems, setInventoryItems, showAlert, showConfirm }) {
  const { t } = useTranslation();
  
  const [activeView, setActiveView] = useState('list'); // 'list', 'add', 'transform'
  
  const [newItem, setNewItem] = useState({ name: '', current_stock: '', unit: 'g', total_cost: '' });
  const [transformForm, setTransformForm] = useState({ sourceItemId: '', amountUsed: '', shrinkagePerc: 20, targetItemName: '', operationalCost: '' });
  const [editingItem, setEditingItem] = useState(null);
  
  // --- NEW: AUDIT STATE ---
  const [auditingItem, setAuditingItem] = useState(null);

  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  const handleAddItem = async () => {
    if (!newItem.name || newItem.current_stock === '' || newItem.total_cost === '') {
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc1'));
    }

    const stockVal = parseFloat(newItem.current_stock);
    const costVal = parseFloat(newItem.total_cost);
    const calculatedUnitCost = costVal / stockVal;

    const itemToSave = {
      name: newItem.name,
      current_stock: stockVal,
      unit: newItem.unit,
      unit_cost: calculatedUnitCost
    };

    try {
      // 1. Save to Inventory Table
      const { data, error } = await supabase.from('inventory').insert([itemToSave]).select();
      if (error) throw error;

      // 2. FIXED: Save to Expenses Table using the correct column names
      const purchaseExpense = {
        amount: costVal,
        reason: `Inventory Purchase: ${newItem.name} (${stockVal}${newItem.unit})`, // Standardized to 'reason'
        cashier_name: 'Inventory System' // Standardized to match Register schema
      };

      const { error: expenseError } = await supabase.from('expenses').insert([purchaseExpense]);
      if (expenseError) console.error("Failed to log purchase expense:", expenseError);
      
      // 3. Update local states
      await db.inventory.put(data[0]);
      setInventoryItems([...inventoryItems, data[0]]);
      setNewItem({ name: '', current_stock: '', unit: 'g', total_cost: '' });
      setActiveView('list');
      
      showAlert(t('inv.alertSuccess'), `${itemToSave.name} ${t('inv.added')} ${t('inv.at')} $${calculatedUnitCost.toFixed(4)}/${itemToSave.unit}.`);
    } catch (err) {
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
    if (!editingItem.name || editingItem.current_stock === '' || editingItem.unit_cost === '') {
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc3'));
    }

    try {
      const payload = {
        name: editingItem.name,
        current_stock: parseFloat(editingItem.current_stock),
        unit: editingItem.unit,
        unit_cost: parseFloat(editingItem.unit_cost)
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

      showAlert(t('inv.alertAuditComplete'), impactMsg);

    } catch (err) {
      console.error("Audit error:", err);
      showAlert(t('inv.alertError'), t('inv.alertAuditFail'));
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
    <div className="fade-in" style={{ maxWidth: '900px', margin: '0 auto', color: 'var(--text-main)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>{t('inv.title')}</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => { setActiveView(activeView === 'transform' ? 'list' : 'transform'); setEditingItem(null); setAuditingItem(null); }}
            style={{ padding: '10px 20px', background: activeView === 'transform' ? '#95a5a6' : '#e67e22', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {activeView === 'transform' ? t('inv.btnCancel') : t('inv.btnRoast')}
          </button>
          <button 
            onClick={() => { setActiveView(activeView === 'add' ? 'list' : 'add'); setEditingItem(null); setAuditingItem(null); }}
            style={{ padding: '10px 20px', background: activeView === 'add' ? '#95a5a6' : 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {activeView === 'add' ? t('inv.btnCancel') : t('inv.btnReceive')}
          </button>
        </div>
      </div>
      
      {activeView === 'add' && !editingItem && !auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>{t('inv.receiveTitle')}</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.itemName')}</label>
              <input type="text" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.stockQty')}</label>
              <input type="number" value={newItem.current_stock} onChange={e => setNewItem({...newItem, current_stock: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.unit')}</label>
              <select value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                <option value="g">{t('inv.unitG')}</option>
                <option value="ml">{t('inv.unitMl')}</option>
                <option value="units">{t('inv.unitPieces')}</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.totalCost')}</label>
              <input type="number" placeholder={t('inv.invoiceTotal')} value={newItem.total_cost} onChange={e => setNewItem({...newItem, total_cost: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <button onClick={handleAddItem} style={{ padding: '12px 24px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>{t('inv.btnSave')}</button>
          </div>
        </div>
      )}

      {activeView === 'transform' && !editingItem && !auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '2px solid #e67e22' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#e67e22' }}>{t('inv.roastTitle')}</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.rawMaterial')}</label>
              <select value={transformForm.sourceItemId} onChange={e => setTransformForm({...transformForm, sourceItemId: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                <option value="">{t('inv.selectOption')}</option>
                {sortedItems.map(item => <option key={item.id} value={item.id}>{item.name} ({t('inv.has')} {item.current_stock}{item.unit})</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '90px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.usedQty')}</label>
              <input type="number" value={transformForm.amountUsed} onChange={e => setTransformForm({...transformForm, amountUsed: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <div style={{ flex: 1, minWidth: '90px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.shrink')}</label>
              <input type="number" value={transformForm.shrinkagePerc} onChange={e => setTransformForm({...transformForm, shrinkagePerc: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            
            <div style={{ flex: 1, minWidth: '90px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.opCost')}</label>
              <input type="number" placeholder="e.g. 275" value={transformForm.operationalCost} onChange={e => setTransformForm({...transformForm, operationalCost: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ flex: 2, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.targetItem')}</label>
              <input 
                type="text" 
                list="inventory-names" 
                placeholder={t('inv.typeNewOrSelect')} 
                value={transformForm.targetItemName} 
                onChange={e => setTransformForm({...transformForm, targetItemName: e.target.value})} 
                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
              />
              <datalist id="inventory-names">
                {sortedItems.map(item => <option key={item.id} value={item.name} />)}
              </datalist>
            </div>
            <button onClick={handleTransformStock} style={{ padding: '12px 24px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>{t('inv.btnProcess')}</button>
          </div>
        </div>
      )}

      {/* --- EDIT ITEM UI --- */}
      {editingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '2px solid #3498db', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
             <h3 style={{ margin: 0, color: '#3498db' }}>{t('inv.editTitle')}</h3>
             <button onClick={() => setEditingItem(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.itemName')}</label>
              <input type="text" value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>{t('inv.currentStock')}</label>
              <input type="number" value={editingItem.current_stock} onChange={e => {
                const newStock = e.target.value;
                const unitPrice = parseFloat(editingItem.unit_cost) || 0;
                setEditingItem({
                  ...editingItem, 
                  current_stock: newStock,
                  total_cost: newStock === '' ? '' : (parseFloat(newStock) * unitPrice).toFixed(2)
                })
              }} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold', color: '#3498db' }}>{t('inv.unitCost')}</label>
              <input type="number" step="0.0001" value={editingItem.unit_cost} onChange={e => {
                const newUnit = e.target.value;
                const stock = parseFloat(editingItem.current_stock) || 0;
                setEditingItem({
                  ...editingItem,
                  unit_cost: newUnit,
                  total_cost: newUnit === '' ? '' : (parseFloat(newUnit) * stock).toFixed(2)
                });
              }} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #3498db', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>

            <button onClick={handleSaveEdit} style={{ padding: '12px 24px', background: '#3498db', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>{t('inv.btnUpdate')}</button>
          </div>
        </div>
      )}

      {/* --- NEW: AUDIT / WASTAGE UI --- */}
      {auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '2px solid #e74c3c', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
             <h3 style={{ margin: 0, color: '#e74c3c' }}>{t('inv.auditTitle')}</h3>
             <button onClick={() => setAuditingItem(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            
            <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>{t('inv.expectedStock')}</p>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{auditingItem.current_stock} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>{auditingItem.unit}</span></div>
            </div>

            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold', color: '#e74c3c' }}>{t('inv.actualCount')}</label>
              <input type="number" autoFocus value={auditingItem.actualCount || ''} onChange={e => {
                setAuditingItem({ ...auditingItem, actualCount: e.target.value })
              }} style={{ width: '100%', padding: '16px', borderRadius: '8px', border: '2px solid #e74c3c', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 'bold' }} />
            </div>

            {auditingItem.actualCount !== undefined && auditingItem.actualCount !== '' && (() => {
              const variance = parseFloat(auditingItem.actualCount) - auditingItem.current_stock;
              const isLoss = variance < 0;
              const financialImpact = Math.abs(variance * (auditingItem.unit_cost || 0));

              return (
                <div style={{ flex: 2, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, padding: '16px', background: isLoss ? 'rgba(231,76,60,0.1)' : 'rgba(46,204,113,0.1)', borderRadius: '8px', border: `1px solid ${isLoss ? '#e74c3c' : '#2ecc71'}` }}>
                      <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: isLoss ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>{t('inv.variance')}</p>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: isLoss ? '#e74c3c' : '#2ecc71' }}>{variance > 0 ? '+' : ''}{variance} {auditingItem.unit}</div>
                    </div>
                    <div style={{ flex: 1, padding: '16px', background: isLoss ? 'rgba(231,76,60,0.1)' : 'rgba(46,204,113,0.1)', borderRadius: '8px', border: `1px solid ${isLoss ? '#e74c3c' : '#2ecc71'}` }}>
                      <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: isLoss ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>{t('inv.financialImpact')}</p>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: isLoss ? '#e74c3c' : '#2ecc71' }}>{isLoss ? '-' : '+'}${financialImpact.toFixed(2)}</div>
                    </div>
                  </div>

                  {isLoss && (
                    <select value={auditingItem.reason || 'waste'} onChange={e => setAuditingItem({...auditingItem, reason: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                      <option value="waste">{t('inv.reasonWaste')}</option>
                      <option value="expired">{t('inv.reasonExpired')}</option>
                      <option value="comp">{t('inv.reasonComp')}</option>
                      <option value="audit_correction">{t('inv.reasonAudit')}</option>
                    </select>
                  )}
                  
                  <button onClick={handleSaveAudit} style={{ padding: '16px', background: isLoss ? '#e74c3c' : '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem' }}>
                    {isLoss ? t('inv.btnConfirmLoss') : t('inv.btnConfirmAdj')}
                  </button>
                </div>
              );
            })()}

          </div>
        </div>
      )}

      {/* --- INVENTORY LIST --- */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
            <tr>
              <th onClick={() => handleSort('name')} style={{ padding: '16px', borderBottom: '2px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}>
                {t('inv.thName')} {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('current_stock')} style={{ padding: '16px', borderBottom: '2px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}>
                {t('inv.thStock')} {sortConfig.key === 'current_stock' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('unit_cost')} style={{ padding: '16px', borderBottom: '2px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}>
                {t('inv.thCost')} {sortConfig.key === 'unit_cost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{ padding: '16px', borderBottom: '2px solid var(--border)', textAlign: 'right' }}>{t('inv.thActions')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '16px', fontWeight: 'bold' }}>{item.name}</td>
                <td style={{ padding: '16px' }}>
                  <span style={{ fontSize: '1.1rem', color: item.current_stock < (item.unit === 'g' ? 2000 : 10) ? '#e74c3c' : 'inherit' }}>
                    {item.current_stock} {item.unit}
                  </span>
                </td>
                <td style={{ padding: '16px', color: 'var(--text-muted)' }}>
                  ${Number(item.unit_cost || 0).toFixed(4)} / {item.unit}
                </td>
                <td style={{ padding: '16px', textAlign: 'right' }}>
                  
                  {/* NEW: AUDIT BUTTON */}
                  <button 
                    onClick={() => { 
                      setAuditingItem({ ...item, actualCount: item.current_stock, reason: 'waste' }); 
                      setEditingItem(null);
                      setActiveView('list'); 
                    }} 
                    style={{ padding: '8px 16px', background: '#fdf3e8', color: '#e67e22', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginRight: '8px' }}
                  >
                    {t('inv.btnAudit')}
                  </button>

                  <button 
                    onClick={() => { 
                      setEditingItem({...item, total_cost: (item.current_stock * (item.unit_cost || 0)).toFixed(2)}); 
                      setAuditingItem(null);
                      setActiveView('list'); 
                    }} 
                    style={{ padding: '8px 16px', background: '#e8f4fd', color: '#2980b9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginRight: '8px' }}
                  >
                    {t('inv.btnEdit')}
                  </button>
                  <button 
                    onClick={() => handleDelete(item.id, item.name)} 
                    style={{ padding: '8px 16px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    {t('inv.btnDelete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default InventoryTab;