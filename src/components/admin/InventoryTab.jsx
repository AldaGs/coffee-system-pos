import { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { db } from '../../db';

function InventoryTab({ inventoryItems, setInventoryItems, showAlert, showConfirm }) {
  const [activeView, setActiveView] = useState('list'); // 'list', 'add', 'transform'
  
  const [newItem, setNewItem] = useState({ name: '', current_stock: '', unit: 'g', total_cost: '' });
  const [transformForm, setTransformForm] = useState({ sourceItemId: '', amountUsed: '', shrinkagePerc: 20, targetItemName: '', operationalCost: '' });
  const [editingItem, setEditingItem] = useState(null);
  
  // --- NEW: AUDIT STATE ---
  const [auditingItem, setAuditingItem] = useState(null);

  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  // --- 1. RECEIVE NEW STOCK & LOG PURCHASE ---
  const handleAddItem = async () => {
    if (!newItem.name || newItem.current_stock === '' || newItem.total_cost === '') {
      return showAlert("Missing Info", "Please provide a name, stock amount, and total invoice cost.");
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
      // 1. Save the physical item to the warehouse
      const { data, error } = await supabase.from('inventory').insert([itemToSave]).select();
      if (error) throw error;

      // --- NEW: AUTOMATED EXPENSE LOGGING ---
      // 2. Create a financial expense record for the purchase
      const purchaseExpense = {
        amount: costVal,
        category: 'Inventory Purchase',
        description: `Restock: ${stockVal}${newItem.unit} of ${newItem.name}`,
        timestamp: new Date().toISOString()
      };

      // Push the expense to Supabase
      const { error: expenseError } = await supabase.from('expenses').insert([purchaseExpense]);
      if (expenseError) console.error("Failed to log purchase expense:", expenseError);
      
      // If you are tracking expenses locally in Dexie or localStorage, you would also push it there:
      // e.g., const savedExpenses = JSON.parse(localStorage.getItem('tinypos_expenses') || '[]');
      // localStorage.setItem('tinypos_expenses', JSON.stringify([...savedExpenses, purchaseExpense]));
      // ----------------------------------------

      // 3. Update UI
      await db.inventory.put(data[0]);
      setInventoryItems([...inventoryItems, data[0]]);
      setNewItem({ name: '', current_stock: '', unit: 'g', total_cost: '' });
      setActiveView('list');
      
      showAlert("Success", `${itemToSave.name} added at $${calculatedUnitCost.toFixed(4)}/${itemToSave.unit}. \n\nA purchase expense of $${costVal.toFixed(2)} was logged.`);
    } catch (err) {
      showAlert("Error", "Could not save inventory item. Ensure the name is unique.");
    }
  };

  // --- 2. THE ROASTER (TRANSFORM STOCK) ---
  const handleTransformStock = async () => {
    if (!transformForm.sourceItemId || !transformForm.amountUsed || !transformForm.targetItemName) {
      return showAlert("Missing Info", "Please fill out all required transformation fields.");
    }

    const sourceItem = inventoryItems.find(i => i.id === parseInt(transformForm.sourceItemId));
    const usedQty = parseFloat(transformForm.amountUsed);
    const shrinkPerc = parseFloat(transformForm.shrinkagePerc);
    const opCost = parseFloat(transformForm.operationalCost) || 0; 

    if (usedQty > sourceItem.current_stock) {
      return showAlert("Not Enough Stock", `You only have ${sourceItem.current_stock}${sourceItem.unit} of ${sourceItem.name} available.`);
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
        ? `Added ${finalYieldQty}g to ${existingTarget.name}. New total: ${finalStockForTarget}g at $${finalUnitCost.toFixed(4)}/g.`
        : `Roast Complete. Yielded ${finalYieldQty}g of ${targetItemPayload.name} at $${finalUnitCost.toFixed(4)}/g.`;
        
      showAlert("Transformation Complete", successMsg);

    } catch (err) {
      console.error(err);
      showAlert("Error", "Transformation failed.");
    }
  };

  // --- 3. EDIT EXISTING STOCK ---
  const handleSaveEdit = async () => {
    if (!editingItem.name || editingItem.current_stock === '' || editingItem.unit_cost === '') {
      return showAlert("Missing Info", "Please ensure name, stock, and unit cost are filled out.");
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
      showAlert("Error", "Could not update item.");
    }
  };

  // --- 4. NEW: SAVE AUDIT / WASTAGE LOG ---
  const handleSaveAudit = async () => {
    const actualCount = parseFloat(auditingItem.actualCount);
    if (isNaN(actualCount)) return showAlert("Invalid Count", "Please enter a valid numerical count.");

    const variance = actualCount - auditingItem.current_stock;
    
    if (variance === 0) {
      setAuditingItem(null);
      return showAlert("Stock Verified", "No variance detected. Inventory is perfectly accurate.");
    }

    const financialImpact = variance * (auditingItem.unit_cost || 0);
    const deductionType = variance < 0 ? (auditingItem.reason || 'waste') : 'audit_correction';

    try {
      // 1. Update the actual inventory table
      const { data, error } = await supabase.from('inventory').update({ current_stock: actualCount }).eq('id', auditingItem.id).select();
      if (error) throw error;

      // 2. Log the variance in the logs for Analytics to catch
      const auditLog = {
        item_name: auditingItem.name,
        qty_deducted: Math.abs(variance),
        deduction_type: deductionType,
        created_at: new Date().toISOString(),
        ticket_id: `AUDIT-${Date.now()}` // Special ID so we know it wasn't a sale
      };

      const { error: logError } = await supabase.from('inventory_logs').insert([auditLog]);
      if (logError) throw logError;

      // 3. Update Local State
      await db.inventory.put(data[0]);
      setInventoryItems(inventoryItems.map(item => item.id === auditingItem.id ? data[0] : item));
      setAuditingItem(null); 

      const impactMsg = variance < 0 
        ? `Logged a loss of ${Math.abs(variance)}${auditingItem.unit} (-$${Math.abs(financialImpact).toFixed(2)})`
        : `Found an extra ${variance}${auditingItem.unit} (+$${financialImpact.toFixed(2)})`;

      showAlert("Audit Complete", impactMsg);

    } catch (err) {
      console.error("Audit error:", err);
      showAlert("Error", "Could not process the inventory audit.");
    }
  };

  const handleDelete = (id, name) => {
    showConfirm("Delete Item", `Are you sure you want to delete ${name}?`, async () => {
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
        <h2 style={{ margin: 0 }}>Warehouse Inventory</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => { setActiveView(activeView === 'transform' ? 'list' : 'transform'); setEditingItem(null); setAuditingItem(null); }}
            style={{ padding: '10px 20px', background: activeView === 'transform' ? '#95a5a6' : '#e67e22', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {activeView === 'transform' ? 'Cancel' : '🔥 Roast / Transform'}
          </button>
          <button 
            onClick={() => { setActiveView(activeView === 'add' ? 'list' : 'add'); setEditingItem(null); setAuditingItem(null); }}
            style={{ padding: '10px 20px', background: activeView === 'add' ? '#95a5a6' : 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {activeView === 'add' ? 'Cancel' : '+ Receive Stock'}
          </button>
        </div>
      </div>

      {/* ... (ADD NEW STOCK UI & TRANSFORM UI STAY EXACTLY THE SAME - Omitted for brevity but keep your current code for them) ... */}
      
      {activeView === 'add' && !editingItem && !auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Receive Delivery</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Item Name</label>
              <input type="text" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Stock Qty</label>
              <input type="number" value={newItem.current_stock} onChange={e => setNewItem({...newItem, current_stock: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Unit</label>
              <select value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                <option value="g">Grams (g)</option>
                <option value="ml">Milliliters (ml)</option>
                <option value="units">Units / Pieces</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Total Cost ($)</label>
              <input type="number" placeholder="Invoice Total" value={newItem.total_cost} onChange={e => setNewItem({...newItem, total_cost: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <button onClick={handleAddItem} style={{ padding: '12px 24px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      )}

      {activeView === 'transform' && !editingItem && !auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '2px solid #e67e22' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#e67e22' }}>🔥 Batch Transformation (Roasting / Syrups)</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Raw Material (Source)</label>
              <select value={transformForm.sourceItemId} onChange={e => setTransformForm({...transformForm, sourceItemId: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                <option value="">-- Select --</option>
                {sortedItems.map(item => <option key={item.id} value={item.id}>{item.name} (Has {item.current_stock}{item.unit})</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '90px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Used Qty</label>
              <input type="number" value={transformForm.amountUsed} onChange={e => setTransformForm({...transformForm, amountUsed: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <div style={{ flex: 1, minWidth: '90px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Shrink (%)</label>
              <input type="number" value={transformForm.shrinkagePerc} onChange={e => setTransformForm({...transformForm, shrinkagePerc: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            
            <div style={{ flex: 1, minWidth: '90px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Op. Cost ($)</label>
              <input type="number" placeholder="e.g. 275" value={transformForm.operationalCost} onChange={e => setTransformForm({...transformForm, operationalCost: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ flex: 2, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Target Item Name</label>
              <input 
                type="text" 
                list="inventory-names" 
                placeholder="Type new OR select existing..." 
                value={transformForm.targetItemName} 
                onChange={e => setTransformForm({...transformForm, targetItemName: e.target.value})} 
                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
              />
              <datalist id="inventory-names">
                {sortedItems.map(item => <option key={item.id} value={item.name} />)}
              </datalist>
            </div>
            <button onClick={handleTransformStock} style={{ padding: '12px 24px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Process</button>
          </div>
        </div>
      )}

      {/* --- EDIT ITEM UI --- */}
      {editingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '2px solid #3498db', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
             <h3 style={{ margin: 0, color: '#3498db' }}>✏️ Edit Warehouse Item</h3>
             <button onClick={() => setEditingItem(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Item Name</label>
              <input type="text" value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Current Stock</label>
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
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold', color: '#3498db' }}>Unit Cost ($)</label>
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

            <button onClick={handleSaveEdit} style={{ padding: '12px 24px', background: '#3498db', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Update</button>
          </div>
        </div>
      )}

      {/* --- NEW: AUDIT / WASTAGE UI --- */}
      {auditingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '2px solid #e74c3c', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
             <h3 style={{ margin: 0, color: '#e74c3c' }}>📋 Perform Stocktake / Log Wastage</h3>
             <button onClick={() => setAuditingItem(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            
            <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Expected Stock in System</p>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{auditingItem.current_stock} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>{auditingItem.unit}</span></div>
            </div>

            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold', color: '#e74c3c' }}>Actual Physical Count</label>
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
                      <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: isLoss ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>Variance</p>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: isLoss ? '#e74c3c' : '#2ecc71' }}>{variance > 0 ? '+' : ''}{variance} {auditingItem.unit}</div>
                    </div>
                    <div style={{ flex: 1, padding: '16px', background: isLoss ? 'rgba(231,76,60,0.1)' : 'rgba(46,204,113,0.1)', borderRadius: '8px', border: `1px solid ${isLoss ? '#e74c3c' : '#2ecc71'}` }}>
                      <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: isLoss ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>Financial Impact</p>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: isLoss ? '#e74c3c' : '#2ecc71' }}>{isLoss ? '-' : '+'}${financialImpact.toFixed(2)}</div>
                    </div>
                  </div>

                  {isLoss && (
                    <select value={auditingItem.reason || 'waste'} onChange={e => setAuditingItem({...auditingItem, reason: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                      <option value="waste">Spilled / Dropped / Wasted</option>
                      <option value="expired">Expired Product</option>
                      <option value="comp">Staff Comp / Given Away</option>
                      <option value="audit_correction">Initial Miscount / Unknown Shrinkage</option>
                    </select>
                  )}
                  
                  <button onClick={handleSaveAudit} style={{ padding: '16px', background: isLoss ? '#e74c3c' : '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem' }}>
                    Confirm & Log {isLoss ? 'Loss' : 'Adjustment'}
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
                Item Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('current_stock')} style={{ padding: '16px', borderBottom: '2px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}>
                Stock Level {sortConfig.key === 'current_stock' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('unit_cost')} style={{ padding: '16px', borderBottom: '2px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}>
                Unit Cost {sortConfig.key === 'unit_cost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{ padding: '16px', borderBottom: '2px solid var(--border)', textAlign: 'right' }}>Actions</th>
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
                    📋 Audit
                  </button>

                  <button 
                    onClick={() => { 
                      setEditingItem({...item, total_cost: (item.current_stock * (item.unit_cost || 0)).toFixed(2)}); 
                      setAuditingItem(null);
                      setActiveView('list'); 
                    }} 
                    style={{ padding: '8px 16px', background: '#e8f4fd', color: '#2980b9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginRight: '8px' }}
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(item.id, item.name)} 
                    style={{ padding: '8px 16px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Delete
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