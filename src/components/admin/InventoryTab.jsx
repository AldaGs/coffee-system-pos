// src/components/admin/InventoryTab.jsx
import { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { db } from '../../db';

function InventoryTab({ inventoryItems, setInventoryItems, showAlert, showConfirm }) {
  const [activeView, setActiveView] = useState('list'); // 'list', 'add', 'transform'
  
  // State for Receiving New Stock
  const [newItem, setNewItem] = useState({ name: '', current_stock: '', unit: 'g', total_cost: '' });
  
  // State for Roasting/Transforming
  const [transformForm, setTransformForm] = useState({ sourceItemId: '', amountUsed: '', shrinkagePerc: 20, targetItemName: '' });

  // --- NEW: State for Editing an existing item ---
  const [editingItem, setEditingItem] = useState(null);

  // --- 1. RECEIVE NEW STOCK ---
  const handleAddItem = async () => {
    if (!newItem.name || newItem.current_stock === '' || newItem.total_cost === '') {
      return showAlert("Missing Info", "Please provide a name, stock amount, and total invoice cost.");
    }

    const stockVal = parseFloat(newItem.current_stock);
    const costVal = parseFloat(newItem.total_cost);
    const calculatedUnitCost = costVal / stockVal; // The magic math!

    const itemToSave = {
      name: newItem.name,
      current_stock: stockVal,
      unit: newItem.unit,
      unit_cost: calculatedUnitCost
    };

    try {
      const { data, error } = await supabase.from('inventory').insert([itemToSave]).select();
      if (error) throw error;

      await db.inventory.put(data[0]);
      setInventoryItems([...inventoryItems, data[0]]);
      setNewItem({ name: '', current_stock: '', unit: 'g', total_cost: '' });
      setActiveView('list');
      showAlert("Success", `${itemToSave.name} added at $${calculatedUnitCost.toFixed(4)} per ${itemToSave.unit}`);
    } catch (err) {
      showAlert("Error", "Could not save inventory item. Ensure the name is unique.");
    }
  };

  // --- 2. THE ROASTER (TRANSFORM STOCK) ---
  const handleTransformStock = async () => {
    if (!transformForm.sourceItemId || !transformForm.amountUsed || !transformForm.targetItemName) {
      return showAlert("Missing Info", "Please fill out all transformation fields.");
    }

    const sourceItem = inventoryItems.find(i => i.id === parseInt(transformForm.sourceItemId));
    const usedQty = parseFloat(transformForm.amountUsed);
    const shrinkPerc = parseFloat(transformForm.shrinkagePerc);

    if (usedQty > sourceItem.current_stock) {
      return showAlert("Not Enough Stock", `You only have ${sourceItem.current_stock}${sourceItem.unit} of ${sourceItem.name} available.`);
    }

    // 1. Calculate Shrinkage Math
    const yieldMultiplier = (100 - shrinkPerc) / 100;
    const finalYieldQty = usedQty * yieldMultiplier;
    
    // 2. Calculate Cost Math
    const totalCostOfUsedRawMaterial = usedQty * sourceItem.unit_cost; 
    const newRoastedUnitCost = totalCostOfUsedRawMaterial / finalYieldQty;

    // --- NEW: CHECK FOR EXISTING TARGET ITEM AND MERGE ---
    // This looks to see if you typed a name that already exists in your warehouse
    const existingTarget = inventoryItems.find(
      i => i.name.toLowerCase().trim() === transformForm.targetItemName.toLowerCase().trim()
    );

    let finalStockForTarget = finalYieldQty;
    let finalUnitCost = newRoastedUnitCost;

    if (existingTarget) {
      // Add the new yield to the old stock
      finalStockForTarget = existingTarget.current_stock + finalYieldQty;
      
      // Calculate Weighted Average Cost (True ERP Math!)
      const oldTotalValue = existingTarget.current_stock * (existingTarget.unit_cost || 0);
      const newTotalValue = finalYieldQty * newRoastedUnitCost;
      finalUnitCost = (oldTotalValue + newTotalValue) / finalStockForTarget;
    }

    try {
      // Step A: Deduct from Raw Beans
      const newSourceStock = sourceItem.current_stock - usedQty;
      await supabase.from('inventory').update({ current_stock: newSourceStock }).eq('id', sourceItem.id);

      // Step B: Create (or update) the Roasted Beans
      const targetItemPayload = {
        name: existingTarget ? existingTarget.name : transformForm.targetItemName.trim(),
        current_stock: finalStockForTarget,
        unit: sourceItem.unit, 
        unit_cost: finalUnitCost
      };

      const { data: upsertData, error: upsertErr } = await supabase.from('inventory').upsert([targetItemPayload], { onConflict: 'name' }).select();
      if (upsertErr) throw upsertErr;

      // Update Local State organically
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
      setTransformForm({ sourceItemId: '', amountUsed: '', shrinkagePerc: 20, targetItemName: '' });
      
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

      // 1. Push to Cloud
      const { data, error } = await supabase
        .from('inventory')
        .update(payload)
        .eq('id', editingItem.id)
        .select();

      if (error) throw error;

      // 2. Cache Locally
      await db.inventory.put(data[0]);

      // 3. Update UI
      setInventoryItems(inventoryItems.map(item => item.id === editingItem.id ? data[0] : item));
      setEditingItem(null); // Close the edit form
      
    } catch (err) {
      console.error(err);
      showAlert("Error", "Could not update item. Ensure the name isn't already taken by another item.");
    }
  };

  const handleDelete = (id, name) => {
    showConfirm("Delete Item", `Are you sure you want to delete ${name}?`, async () => {
      await supabase.from('inventory').delete().eq('id', id);
      await db.inventory.delete(id);
      setInventoryItems(inventoryItems.filter(item => item.id !== id));
    });
  };

  return (
    <div className="fade-in" style={{ maxWidth: '900px', margin: '0 auto', color: 'var(--text-main)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>Warehouse Inventory</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => { setActiveView(activeView === 'transform' ? 'list' : 'transform'); setEditingItem(null); }}
            style={{ padding: '10px 20px', background: activeView === 'transform' ? '#95a5a6' : '#e67e22', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {activeView === 'transform' ? 'Cancel' : '🔥 Roast / Transform'}
          </button>
          <button 
            onClick={() => { setActiveView(activeView === 'add' ? 'list' : 'add'); setEditingItem(null); }}
            style={{ padding: '10px 20px', background: activeView === 'add' ? '#95a5a6' : 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {activeView === 'add' ? 'Cancel' : '+ Receive Stock'}
          </button>
        </div>
      </div>

      {/* --- ADD NEW STOCK UI --- */}
      {activeView === 'add' && !editingItem && (
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

            {/* Dynamic Unit Cost Preview Helper */}
            {newItem.current_stock > 0 && newItem.total_cost > 0 && (
              <div style={{ width: '100%', marginTop: '16px', padding: '12px', background: 'rgba(46, 204, 113, 0.1)', color: '#27ae60', borderRadius: '6px', border: '1px solid #2ecc71', fontWeight: 'bold' }}>
                💡 Live Calculation: The system will save this as ${(parseFloat(newItem.total_cost) / parseFloat(newItem.current_stock)).toFixed(4)} per {newItem.unit}.
              </div>
            )}

          </div>
        </div>
      )}

      {/* --- TRANSFORM / ROAST UI --- */}
      {activeView === 'transform' && !editingItem && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '2px solid #e67e22' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#e67e22' }}>🔥 Batch Transformation (Roasting / Syrups)</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Raw Material (Source)</label>
              <select value={transformForm.sourceItemId} onChange={e => setTransformForm({...transformForm, sourceItemId: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                <option value="">-- Select --</option>
                {inventoryItems.map(item => <option key={item.id} value={item.id}>{item.name} (Has {item.current_stock}{item.unit})</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Amount to Use</label>
              <input type="number" value={transformForm.amountUsed} onChange={e => setTransformForm({...transformForm, amountUsed: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Shrinkage (%)</label>
              <input type="number" value={transformForm.shrinkagePerc} onChange={e => setTransformForm({...transformForm, shrinkagePerc: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Target Item Name</label>
              
              {/* Added a 'list' attribute to bind it to the datalist below */}
              <input 
                type="text" 
                list="inventory-names" 
                placeholder="Type new OR select existing..." 
                value={transformForm.targetItemName} 
                onChange={e => setTransformForm({...transformForm, targetItemName: e.target.value})} 
                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
              />
              
              {/* This magically creates a dropdown menu of your existing inventory! */}
              <datalist id="inventory-names">
                {inventoryItems.map(item => <option key={item.id} value={item.name} />)}
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
                // Keep the unit cost the same, but lower the total value if stock is lost!
                setEditingItem({
                  ...editingItem, 
                  current_stock: newStock,
                  total_cost: newStock === '' ? '' : (parseFloat(newStock) * unitPrice).toFixed(2)
                })
              }} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold' }}>Unit</label>
              <select value={editingItem.unit} onChange={e => setEditingItem({...editingItem, unit: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                <option value="g">Grams (g)</option>
                <option value="ml">Milliliters (ml)</option>
                <option value="units">Units / Pieces</option>
              </select>
            </div>

            {/* THE TWO-WAY CALCULATOR */}
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold', color: '#e67e22' }}>Total Value ($)</label>
              <input type="number" step="0.01" value={editingItem.total_cost} onChange={e => {
                const newTotal = e.target.value;
                const stock = parseFloat(editingItem.current_stock) || 1;
                // If they type the Total Invoice, calculate the Unit Cost instantly
                setEditingItem({
                  ...editingItem,
                  total_cost: newTotal,
                  unit_cost: newTotal === '' ? '' : (parseFloat(newTotal) / stock).toFixed(4)
                });
              }} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #e67e22', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 'bold', color: '#3498db' }}>Unit Cost ($)</label>
              <input type="number" step="0.0001" value={editingItem.unit_cost} onChange={e => {
                const newUnit = e.target.value;
                const stock = parseFloat(editingItem.current_stock) || 0;
                // If they type the Unit Cost, calculate the Total Invoice instantly
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

      {/* --- INVENTORY LIST --- */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
            <tr>
              <th style={{ padding: '16px', borderBottom: '2px solid var(--border)' }}>Item Name</th>
              <th style={{ padding: '16px', borderBottom: '2px solid var(--border)' }}>Stock Level</th>
              <th style={{ padding: '16px', borderBottom: '2px solid var(--border)' }}>Unit Cost</th>
              <th style={{ padding: '16px', borderBottom: '2px solid var(--border)', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {inventoryItems.map(item => (
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
                  <button 
                    onClick={() => { 
                      setEditingItem({
                        ...item,
                        // Instantly calculate the total value of their current stock
                        total_cost: (item.current_stock * (item.unit_cost || 0)).toFixed(2)
                      }); 
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
            {inventoryItems.length === 0 && (
              <tr>
                <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No inventory items found. Add your first ingredient!</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default InventoryTab;