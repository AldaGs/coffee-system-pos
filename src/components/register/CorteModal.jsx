function CorteModal({ isCorteModalOpen, setIsCorteModalOpen, shiftCashSales, shiftCardSales, shiftTransferSales, shiftTotalExpenses, expectedCash, countedCash, setCountedCash, handleProcessCorte }) {
  if (!isCorteModalOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}><div className="modal-content fade-in" style={{ maxWidth: '450px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}><h2 style={{ margin: 0, color: 'var(--text-main)' }}>Corte de Caja</h2><button onClick={() => setIsCorteModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button></div>
      <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Shift Breakdown</h4>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--text-main)' }}><span>💵 Cash Sales:</span> <span>${shiftCashSales.toFixed(2)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--text-main)' }}><span>💳 Card Sales:</span> <span>${shiftCardSales.toFixed(2)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--text-main)' }}><span>📱 Transfer Sales:</span> <span>${shiftTransferSales.toFixed(2)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: '#e74c3c' }}><span>💸 Cash Expenses:</span> <span>-${shiftTotalExpenses.toFixed(2)}</span></div>
        <div style={{ borderTop: '2px dashed var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-main)' }}><span>Expected Cash in Drawer:</span><span style={{ color: '#27ae60' }}>${expectedCash.toFixed(2)}</span></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}><label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>Actual Cash Counted ($)</label><input type="number" step="0.01" placeholder="How much physical money is there?" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} style={{ width: '100%', padding: '15px', fontSize: '1.5rem', textAlign: 'center', borderRadius: '8px', border: '2px solid var(--brand-color)', background: 'var(--bg-surface)', color: 'var(--text-main)' }} /></div>
      <button onClick={handleProcessCorte} style={{ width: '100%', padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '20px' }}>Close Shift</button>
    </div></div>
  );
}
export default CorteModal;
