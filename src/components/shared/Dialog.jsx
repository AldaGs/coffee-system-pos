function Dialog({ uiDialog, closeDialog }) {
  if (!uiDialog.isOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-content fade-in" style={{ textAlign: 'center', maxWidth: '400px', background: 'var(--bg-surface)' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>{uiDialog.type === 'alert' ? '🔔' : '⚠️'}</div>
        <h2 style={{ color: 'var(--text-main)', marginBottom: '16px', marginTop: 0 }}>{uiDialog.title}</h2>
        <p style={{ fontSize: '1.1rem', marginBottom: '24px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{uiDialog.message}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          {uiDialog.type === 'confirm' && (<button onClick={closeDialog} style={{ flex: 1, padding: '14px', background: 'transparent', color: 'var(--text-main)', border: '2px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem' }}>Cancel</button>)}
          <button onClick={() => { if (uiDialog.type === 'confirm' && uiDialog.onConfirm) { uiDialog.onConfirm(); } closeDialog(); }} style={{ flex: 1, padding: '14px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem' }}>{uiDialog.type === 'confirm' ? 'Yes, Confirm' : 'OK'}</button>
        </div>
      </div>
    </div>
  );
}
export default Dialog;
