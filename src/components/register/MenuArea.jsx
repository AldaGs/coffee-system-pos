function MenuArea({ activeCategory, setActiveCategory, menuData, isCurrentlyOffline, totalOfflineRecords, setIsSyncModalOpen, isMobileMenuOpen, setIsMobileMenuOpen, activeCashier, requirePin, setIsExpenseModalOpen, posSettings, shiftOrders, shiftExpenses, showAlert, showConfirm, setIsCorteModalOpen, tickets, setIsLocked, navigate, handleItemClick }) {
  return (
    <main className="menu-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative' }}>
        <h2 style={{ margin: 0 }}>{activeCategory}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(isCurrentlyOffline || totalOfflineRecords > 0) && (<button onClick={() => setIsSyncModalOpen(true)} className={`pop-in ${isCurrentlyOffline ? 'status-badge-offline' : 'status-badge-syncing'}`} style={{ padding: '8px 12px', background: isCurrentlyOffline ? '#e74c3c' : '#f39c12', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>{isCurrentlyOffline ? '📵' : '☁️'}{totalOfflineRecords > 0 && (<span style={{ background: 'white', color: 'black', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' }}>{totalOfflineRecords}</span>)}</button>)}
          <button className="mobile-hamburger desktop-hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>☰</button>
          <div className={`action-buttons-container ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
            <span style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '9999px', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--brand-color)', border: '1px solid var(--border)' }}>👤 {activeCashier?.name}</span>
            <button onClick={() => { requirePin("Authorize Gasto", () => setIsExpenseModalOpen(true)); setIsMobileMenuOpen(false); }} style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>💸 Gasto</button>
            {posSettings.enableCorte !== false && (<button onClick={() => { setIsMobileMenuOpen(false); if (shiftOrders.length === 0 && shiftExpenses.length === 0) { return showAlert("No Activity", "There are no sales or expenses to report for this shift yet."); } const hasPendingCash = tickets.some(t => t.savedSplitPayments && t.savedSplitPayments.some(p => p.method === 'Cash')); if (hasPendingCash) { return showConfirm("Pending Cash Warning", "There are open tickets with 'Saved Partial Payments' in Cash. This physical cash is currently in your drawer but is NOT counted in the Corte report until those tickets are finalized. Close shift anyway?", () => { requirePin("Authorize Corte de Caja", () => setIsCorteModalOpen(true)); }); } requirePin("Authorize Corte de Caja", () => setIsCorteModalOpen(true)); }} style={{ padding: '8px 16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>📊 Corte</button>)}
            <button onClick={() => { setIsLocked(true); setIsMobileMenuOpen(false); }} className="lock-btn">🔒 Lock</button>
            <button onClick={() => { navigate('/admin'); setIsMobileMenuOpen(false); }} className="admin-btn">⚙️ Admin</button>
          </div>
        </div>
      </div>
      <div className="category-tabs">{Object.keys(menuData.categories).map(category => (<button key={category} onClick={() => setActiveCategory(category)} className={`tab-btn ${activeCategory === category ? 'active' : ''}`}>{category}</button>))}</div>
      <div className="menu-grid">{menuData.categories[activeCategory].map(item => (<button key={item.id} onClick={() => handleItemClick(item)} className="item-btn"><span className="item-name">{item.emoji || ''} {item.name}</span><span className="item-price">${item.basePrice}</span></button>))}</div>
    </main>
  );
}
export default MenuArea;
