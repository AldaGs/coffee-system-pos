function ModifierLibraryTab({ 
  menuData, 
  inventoryItems = [], 
  newModGroupName, 
  setNewModGroupName, 
  handleAddModifierGroup, 
  newModOption, 
  setNewModOption, 
  handleAddModifierOption, 
  handleDeleteModifierGroup, 
  handleDeleteModifierOption 
}) {
  return (
    <div className="admin-section fade-in">
      <h1 style={{ color: 'var(--text-main)' }}>Modifier Library</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Create groups and link options directly to your warehouse inventory.</p>
      
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        
        {/* LEFT COLUMN - CREATION FORMS */}
        <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Create Modifier Group</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="text" placeholder="e.g., Milk Selection" value={newModGroupName} onChange={(e) => setNewModGroupName(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
              <button onClick={handleAddModifierGroup} style={{ padding: '10px 20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Create</button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Add Option to Group</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <select value={newModOption.groupKey} onChange={(e) => setNewModOption({ ...newModOption, groupKey: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                <option value="">Select a Group...</option>
                {Object.keys(menuData.modifierGroups).map(key => <option key={key} value={key}>{key.replace('_', ' ').toUpperCase()}</option>)}
              </select>
              
              <input type="text" placeholder="e.g., Almond Milk" value={newModOption.name} onChange={(e) => setNewModOption({ ...newModOption, name: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={newModOption.isTextInput} onChange={(e) => setNewModOption({ ...newModOption, isTextInput: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>This is a Text Input Field</span>
              </label>

              {!newModOption.isTextInput && (
                <>
                  <input type="number" placeholder="Additional Price (0 if free)" value={newModOption.price} onChange={(e) => setNewModOption({ ...newModOption, price: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                  
                  {/* NEW: INVENTORY LINKING UI */}
                  <div style={{ padding: '16px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ margin: 0, color: 'var(--text-main)' }}>Inventory Actions (Optional)</h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>1. Item to Deduct (e.g., Almond Milk Carton)</label>
                      <select value={newModOption.deductionTarget || ""} onChange={(e) => setNewModOption({ ...newModOption, deductionTarget: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)' }}>
                        <option value="">-- No Deduction --</option>
                        {inventoryItems.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>2. Base Ingredient to Replace (e.g., Whole Milk)</label>
                      <select value={newModOption.substitutionTarget || ""} onChange={(e) => setNewModOption({ ...newModOption, substitutionTarget: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)' }}>
                        <option value="">-- No Substitution (Addition Only) --</option>
                        {inventoryItems.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <button onClick={handleAddModifierOption} style={{ padding: '12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Add Option</button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - RENDERED GROUPS */}
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Global Modifier Groups</h3>
          
          {Object.keys(menuData.modifierGroups).map(groupKey => (
            <div key={groupKey} style={{ marginBottom: '20px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 'bold', textTransform: 'capitalize', color: 'var(--text-main)' }}>{groupKey.replace('_', ' ')}</span>
                <button onClick={() => handleDeleteModifierGroup(groupKey)} style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '1.2rem' }} title="Delete Entire Group">🗑️</button>
              </div>
              
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {menuData.modifierGroups[groupKey].length === 0 ? <li style={{ padding: '12px', color: 'var(--text-muted)' }}>No options added.</li> : (
                  menuData.modifierGroups[groupKey].map(opt => (
                    <li key={opt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid var(--border)', color: 'var(--text-main)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 'bold' }}>{opt.name}</span>
                          {opt.isTextInput ? (
                            <span style={{ background: '#3498db', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>TEXT FIELD ✍️</span>
                          ) : (
                            <span style={{ color: '#27ae60', fontWeight: 'bold' }}>+${opt.price}</span>
                          )}
                        </div>
                        
                        {/* INVENTORY BADGE UI */}
                        {(opt.deductionTarget || opt.substitutionTarget) && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {opt.substitutionTarget ? `Swaps [${opt.substitutionTarget}] for ` : `Consumes `} 
                            <strong style={{ color: 'var(--brand-color)' }}>{opt.deductionTarget}</strong>
                          </span>
                        )}
                      </div>
                      <button onClick={() => handleDeleteModifierOption(groupKey, opt.id, opt.name)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>✕</button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default ModifierLibraryTab;