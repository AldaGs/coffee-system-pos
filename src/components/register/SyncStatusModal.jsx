function SyncStatusModal({ isSyncModalOpen, setIsSyncModalOpen, isCurrentlyOffline, syncQueue, expenseQueue, waQueue }) {
  if (!isSyncModalOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}><div className="modal-content fade-in" style={{ maxWidth: '400px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}><h2 style={{ margin: 0, color: 'var(--text-main)' }}>System Status</h2><button onClick={() => setIsSyncModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button></div>
      {isCurrentlyOffline ? (<div style={{ background: '#fdf0ed', color: '#e74c3c', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e74c3c' }}><strong>📵 You are currently offline.</strong><br />Don't worry! You can keep ringing up orders and logging expenses. Everything is saved safely on this device.</div>) : (<div style={{ background: '#eafaf1', color: '#27ae60', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #27ae60' }}><strong>🟢 Internet Connected!</strong><br />We are currently uploading your saved data to the cloud.</div>)}
      <h4 style={{ color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Pending Uploads:</h4>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px dashed var(--border)', fontSize: '1.1rem', color: 'var(--text-main)' }}><span>🛒 Sales Tickets</span><span style={{ fontWeight: 'bold' }}>{syncQueue.length}</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px dashed var(--border)', fontSize: '1.1rem', color: 'var(--text-main)' }}><span>💸 Gastos (Expenses)</span><span style={{ fontWeight: 'bold' }}>{expenseQueue.length}</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', fontSize: '1.1rem', color: 'var(--text-main)' }}><span>📱 WhatsApp Receipts</span><span style={{ fontWeight: 'bold' }}>{waQueue.length}</span></div>
      <button onClick={() => setIsSyncModalOpen(false)} style={{ width: '100%', padding: '16px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '2px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '20px' }}>Close</button>
    </div></div>
  );
}
export default SyncStatusModal;
