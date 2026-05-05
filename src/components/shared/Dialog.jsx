import { useState, useEffect, useRef } from 'react';

function Dialog({ uiDialog, closeDialog }) {
  const [inputValue, setInputValue] = useState(uiDialog.inputValue || '');
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!uiDialog.isOpen) return;
    previousFocusRef.current = document.activeElement;
    const focusTarget = uiDialog.type === 'prompt' ? inputRef : confirmBtnRef;
    const id = setTimeout(() => focusTarget.current?.focus(), 50);
    return () => {
      clearTimeout(id);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [uiDialog.isOpen, uiDialog.type]);

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
    if (e.key === 'Tab' && dialogRef.current) {
      const focusables = dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div
        ref={dialogRef}
        className="modal-content fade-in"
        style={{ textAlign: 'center', maxWidth: '400px', background: 'var(--bg-surface)' }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
        onKeyDown={handleKeyDown}
      >
        <div style={{ fontSize: '3.5rem', marginBottom: '10px' }} aria-hidden="true">
          {uiDialog.type === 'alert' ? '🔔' : uiDialog.type === 'prompt' ? '📝' : '⚠️'}
        </div>
        <h2 id="dialog-title" style={{ color: 'var(--text-main)', marginBottom: '16px', marginTop: 0 }}>{uiDialog.title}</h2>
        <p id="dialog-message" style={{ fontSize: '1.1rem', marginBottom: uiDialog.type === 'prompt' ? '16px' : '24px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{uiDialog.message}</p>

        
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
          <button ref={confirmBtnRef} onClick={handleConfirm} style={{ flex: 1, padding: '14px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem' }}>
            {uiDialog.type === 'alert' ? 'OK' : uiDialog.confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
export default Dialog;
