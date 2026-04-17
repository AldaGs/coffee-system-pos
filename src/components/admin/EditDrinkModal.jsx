function EditDrinkModal({ editingDrink, setEditingDrink, menuData, toggleModifierForDrink }) {
  if (!editingDrink) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}>
      <div className="modal-content" style={{ maxWidth: '500px', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, color: 'var(--text-main)' }}>Edit Drink Details</h2>
          <button onClick={() => setEditingDrink(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
          Select which modifier groups should be available when a cashier rings up a <strong>{editingDrink.drink.name}</strong>.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
          {Object.keys(menuData.modifierGroups).map(groupKey => {
            const isAssigned = editingDrink.drink.allowedModifiers.includes(groupKey);
            return (
              <label key={groupKey} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: `2px solid ${isAssigned ? 'var(--brand-color)' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', background: isAssigned ? 'var(--bg-main)' : 'var(--bg-surface)', transition: 'all 0.1s' }}>
                <input type="checkbox" checked={isAssigned} onChange={() => toggleModifierForDrink(groupKey)} style={{ width: '20px', height: '20px' }} />
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'capitalize', color: 'var(--text-main)' }}>{groupKey.replace('_', ' ')}</span>
              </label>
            );
          })}
        </div>
        <button onClick={() => setEditingDrink(null)} style={{ width: '100%', padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '24px' }}>
          Done
        </button>
      </div>
    </div>
  );
}

export default EditDrinkModal;
