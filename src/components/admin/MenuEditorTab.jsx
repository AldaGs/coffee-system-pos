function MenuEditorTab({ 
  menuData, newCategoryName, setNewCategoryName, handleAddCategory, 
  newItemForm, setNewItemForm, handleAddDrink, handleDeleteCategory, 
  handleDeleteDrink, setEditingDrink, saveMenuToCloud, 
  recipes, inventoryItems, showAlert 
}) {
  return (
    <div>
      <h1 style={{ color: 'var(--text-main)' }}>Menu Editor</h1>
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Add New Category</h3>
            <div style={{ display: 'flex', gap: '10px' }}><input type="text" placeholder="e.g., Cold Brews" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} /><button onClick={handleAddCategory} style={{ padding: '10px 20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Add</button></div>
          </div>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Add New Item</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <select value={newItemForm.category} onChange={(e) => setNewItemForm({ ...newItemForm, category: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>{Object.keys(menuData.categories).map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
              <div style={{ display: 'flex', gap: '10px' }}><input type="text" maxLength="2" placeholder="☕" value={newItemForm.emoji} onChange={(e) => setNewItemForm({ ...newItemForm, emoji: e.target.value })} style={{ width: '60px', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', fontSize: '1.2rem' }} title="Item Emoji" /><input type="text" placeholder="Item Name (e.g., Cold Brew)" value={newItemForm.name} onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} /></div>
              <input type="number" placeholder="Base Price" value={newItemForm.price} onChange={(e) => setNewItemForm({ ...newItemForm, price: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
              

            {/* --- INVENTORY TRACKING (Dropdown A & B) --- */}
            <div style={{ marginBottom: '16px', background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              
              {/* DROPDOWN A: Strategy Selector */}
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-main)' }}>
                Inventory Strategy
              </label>
              <select
                value={newItemForm.inventoryMode || 'none'}
                onChange={(e) => {
                  const mode = e.target.value;
                  
                  if (mode === 'recipe') {
                    // 2.1: Check for existing recipe
                    if (!newItemForm.name) {
                      showAlert("Missing Name", "Please type the Item Name first so we can check for a matching recipe.");
                      return setNewItemForm({ ...newItemForm, inventoryMode: 'none' });
                    }
                    
                    const matchedRecipe = recipes?.find(r => r.name.toLowerCase() === newItemForm.name.toLowerCase());
                    
                    if (matchedRecipe) {
                      // Found it! Pre-select it.
                      setNewItemForm({ ...newItemForm, inventoryMode: 'recipe', linkedRecipeId: matchedRecipe.id, linkedWarehouseId: '' });
                    } else {
                      // Not found. Block and alert.
                      showAlert("Recipe Not Found", `Create a recipe for "${newItemForm.name}" in the Recipe Builder first!`);
                      setNewItemForm({ ...newItemForm, inventoryMode: 'none', linkedRecipeId: '', linkedWarehouseId: '' });
                    }
                  } 
                  else if (mode === 'standard') {
                    setNewItemForm({ ...newItemForm, inventoryMode: 'standard', linkedRecipeId: '', linkedWarehouseId: '' });
                  } 
                  else {
                    // 2.2: None selected
                    setNewItemForm({ ...newItemForm, inventoryMode: 'none', linkedRecipeId: '', linkedWarehouseId: '' });
                  }
                }}
                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', boxSizing: 'border-box' }}
              >
                <option value="none">None (Do not track inventory)</option>
                <option value="standard">Standard Item (1-to-1 physical product)</option>
                <option value="recipe">Recipe Based (Deducts ingredients)</option>
              </select>

              {/* DROPDOWN B: Standard Item Target (Only shows if Standard is selected) */}
              {newItemForm.inventoryMode === 'standard' && (
                <div className="fade-in" style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-main)' }}>
                    Select Physical Item (A-Z)
                  </label>
                  <select
                    value={newItemForm.linkedWarehouseId || ''}
                    onChange={(e) => setNewItemForm({ ...newItemForm, linkedWarehouseId: e.target.value })}
                    style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                  >
                    <option value="">-- Select Inventory Item --</option>
                    {[...(inventoryItems || [])]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.current_stock} {item.unit} in stock)
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* DROPDOWN B (Read-Only State): Recipe Confirmation */}
              {newItemForm.inventoryMode === 'recipe' && newItemForm.linkedRecipeId && (
                <div className="fade-in" style={{ marginTop: '16px', padding: '12px', background: 'rgba(39, 174, 96, 0.1)', color: '#27ae60', borderRadius: '6px', border: '1px solid rgba(39, 174, 96, 0.3)' }}>
                  <strong>✅ Recipe Linked:</strong> {recipes.find(r => r.id === newItemForm.linkedRecipeId)?.name}
                </div>
              )}
            </div>

            <button onClick={handleAddDrink} style={{ padding: '12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Save Item</button>
            </div>

          </div>
        </div>
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Live Menu Preview</h3>
          {Object.keys(menuData.categories).map(category => (
            <div key={category} style={{ marginBottom: '20px', padding: '10px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}><h4 style={{ color: 'var(--text-main)', margin: 0 }}>{category}</h4><button onClick={() => handleDeleteCategory(category)} style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>🗑️</button></div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {menuData.categories[category].length === 0 ? <li style={{ color: 'var(--text-muted)', fontSize: '0.9rem', paddingLeft: '10px' }}>No items yet...</li> : (menuData.categories[category].map(item => (
                  <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px dashed var(--border)', fontSize: '0.95rem', background: 'var(--bg-surface)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-main)' }}>{item.emoji || '•'} {item.name}</span><span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>${item.basePrice}</span></div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', marginTop: '4px' }}>
                      {item.inventoryMode === 'recipe' && (
                        <span style={{ background: '#e8f4fd', color: '#2980b9', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                          🥣 Recipe Based
                        </span>
                      )}
                      {item.inventoryMode === 'standard' && (
                        <span style={{ background: '#fdf3e8', color: '#e67e22', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                          📦 Standard Item
                        </span>
                      )}
                      {(!item.inventoryMode || item.inventoryMode === 'none') && (
                        <span style={{ background: '#f1f2f6', color: '#7f8c8d', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                          🚫 Untracked
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}><button onClick={() => setEditingDrink({ categoryName: category, drink: item })} style={{ background: '#e8f4fd', border: 'none', color: '#2980b9', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Edit Modifiers</button><button onClick={() => handleDeleteDrink(category, item.id, item.name)} style={{ background: '#ffeeee', border: 'none', color: '#e74c3c', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Delete</button></div>
                  </li>
                )))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export default MenuEditorTab;
