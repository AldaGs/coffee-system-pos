function MenuEditorTab({ menuData, newCategoryName, setNewCategoryName, handleAddCategory, newItemForm, setNewItemForm, handleAddDrink, handleDeleteCategory, handleDeleteDrink, setEditingDrink }) {
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
            <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Add New Drink / Item</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <select value={newItemForm.category} onChange={(e) => setNewItemForm({ ...newItemForm, category: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>{Object.keys(menuData.categories).map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
              <div style={{ display: 'flex', gap: '10px' }}><input type="text" maxLength="2" placeholder="☕" value={newItemForm.emoji} onChange={(e) => setNewItemForm({ ...newItemForm, emoji: e.target.value })} style={{ width: '60px', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', fontSize: '1.2rem' }} title="Item Emoji" /><input type="text" placeholder="Item Name (e.g., Cold Brew)" value={newItemForm.name} onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} /></div>
              <input type="number" placeholder="Base Price" value={newItemForm.price} onChange={(e) => setNewItemForm({ ...newItemForm, price: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
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
