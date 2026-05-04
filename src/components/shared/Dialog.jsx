import { useState, useEffect, useRef } from 'react';

function Dialog({ uiDialog, closeDialog }) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (uiDialog.isOpen) {
      setInputValue(uiDialog.inputValue || '');
      if (uiDialog.type === 'prompt') {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [uiDialog]);

  if (!uiDialog.isOpen) return null;

  const handleConfirm = () => {
    if (uiDialog.onConfirm) {
      if (uiDialog.type === 'prompt') {
        uiDialog.onConfirm(inputValue);
      } else {
        uiDialog.onConfirm();
      }
    }
    closeDialog();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') closeDialog();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-content fade-in" style={{ textAlign: 'center', maxWidth: '400px', background: 'var(--bg-surface)' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>
          {uiDialog.type === 'alert' ? '🔔' : uiDialog.type === 'prompt' ? '📝' : '⚠️'}
        </div>
        <h2 style={{ color: 'var(--text-main)', marginBottom: '16px', marginTop: 0 }}>{uiDialog.title}</h2>
        <p style={{ fontSize: '1.1rem', marginBottom: uiDialog.type === 'prompt' ? '16px' : '24px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{uiDialog.message}</p>
        
        {uiDialog.type === 'prompt' && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ width: '100%', padding: '14px', fontSize: '1.1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', marginBottom: '24px', outline: 'none' }}
            placeholder="..."
          />
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          {(uiDialog.type === 'confirm' || uiDialog.type === 'prompt') && (
            <button onClick={closeDialog} style={{ flex: 1, padding: '14px', background: 'transparent', color: 'var(--text-main)', border: '2px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem' }}>
              {uiDialog.cancelText || 'Cancel'}
            </button>
          )}
          <button onClick={handleConfirm} style={{ flex: 1, padding: '14px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem' }}>
            {uiDialog.type === 'alert' ? 'OK' : uiDialog.confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
export default Dialog;
