function DiscountsTab({ menuData, newRule, setNewRule, saveMenuToCloud, showAlert, showConfirm }) {
  return (
    <div className="admin-section fade-in">
      <h1 style={{ color: 'var(--text-main)' }}>Automated Discount Rules</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Create rules that automatically apply discounts to the cart without the cashier doing anything.</p>
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Create New Rule</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input type="text" placeholder="Rule Name (e.g., Happy Hour)" value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            <div style={{ display: 'flex', gap: '10px' }}><select value={newRule.type} onChange={(e) => setNewRule({ ...newRule, type: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}><option value="percentage">% Percentage</option><option value="flat">$ Flat Amount</option></select><input type="number" placeholder="Value (e.g., 10)" value={newRule.value} onChange={(e) => setNewRule({ ...newRule, value: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}><label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>What does this apply to?</label><select value={newRule.targetType} onChange={(e) => setNewRule({ ...newRule, targetType: e.target.value, targetValue: '' })} style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}><option value="cart">The Entire Order</option><option value="item">A Specific Item</option></select></div>
            {newRule.targetType === 'item' && (<select value={newRule.targetValue} onChange={(e) => setNewRule({ ...newRule, targetValue: e.target.value })} style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}><option value="">Select an Item...</option>{Object.keys(menuData.categories).map(cat => menuData.categories[cat].map(item => (<option key={item.id} value={item.name}>{item.name} (from {cat})</option>)))}</select>)}
            <button onClick={() => { if (!newRule.name || !newRule.value || (newRule.targetType === 'item' && !newRule.targetValue)) return showAlert("Error", "Please fill all fields."); const updatedMenu = { ...menuData }; if (!updatedMenu.discountRules) updatedMenu.discountRules = []; updatedMenu.discountRules.push({ ...newRule, id: Date.now(), value: parseFloat(newRule.value), isActive: true }); saveMenuToCloud(updatedMenu); setNewRule({ name: '', type: 'percentage', value: '', targetType: 'cart', targetValue: '' }); showAlert("Success", "Automated rule created!"); }} style={{ padding: '14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Rule</button>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Active Rules</h3>
          {(!menuData.discountRules || menuData.discountRules.length === 0) ? (<p style={{ color: 'var(--text-muted)' }}>No automated rules exist yet.</p>) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {menuData.discountRules.map(rule => (
                <div key={rule.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: rule.isActive ? 'var(--bg-main)' : 'var(--bg-surface)', opacity: rule.isActive ? 1 : 0.6 }}>
                  <div><div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>{rule.name}</div><div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{rule.type === 'percentage' ? `${rule.value}% off` : `$${rule.value.toFixed(2)} off`} • {rule.targetType === 'cart' ? 'Entire Order' : `Item: ${rule.targetValue}`}</div></div>
                  <div style={{ display: 'flex', gap: '10px' }}><button onClick={() => { const updatedMenu = { ...menuData }; const ruleIndex = updatedMenu.discountRules.findIndex(r => r.id === rule.id); updatedMenu.discountRules[ruleIndex].isActive = !rule.isActive; saveMenuToCloud(updatedMenu); }} style={{ padding: '8px 12px', background: 'transparent', color: 'var(--brand-color)', border: '1px solid var(--brand-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>{rule.isActive ? 'Pause' : 'Activate'}</button><button onClick={() => { showConfirm("Delete Rule", "Are you sure you want to delete this discount rule?", () => { const updatedMenu = { ...menuData }; updatedMenu.discountRules = updatedMenu.discountRules.filter(r => r.id !== rule.id); saveMenuToCloud(updatedMenu); }); }} style={{ padding: '8px 12px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default DiscountsTab;
