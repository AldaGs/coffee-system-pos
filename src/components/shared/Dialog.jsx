import { useState, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Icon } from '@iconify/react';

function Dialog({ uiDialog, closeDialog }) {
  const [inputValue, setInputValue] = useState(uiDialog.inputValue || '');
  const previousFocus = useRef(null);
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

  return (
    <DialogPrimitive.Root open={uiDialog.isOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-overlay" style={{ zIndex: 9999 }}>
          <DialogPrimitive.Content
            className="modal-content fade-in"
            style={{ textAlign: 'center', maxWidth: '400px', background: 'var(--bg-surface)' }}
            role="alertdialog"
            aria-modal="true"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              previousFocus.current = document.activeElement;
              const content = event.currentTarget;
              (content.querySelector('input') || content.querySelector('button:last-child'))?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              previousFocus.current?.focus();
            }}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <div style={{ fontSize: '3.5rem', marginBottom: '10px', color: 'var(--brand-color)' }} aria-hidden="true">
              {uiDialog.type === 'alert' && <Icon icon="lucide:alert-circle" />}
              {uiDialog.type === 'prompt' && <Icon icon="lucide:plus-circle" />}
              {uiDialog.type === 'confirm' && <Icon icon="lucide:alert-triangle" />}
            </div>
            <DialogPrimitive.Title asChild><h2 style={{ color: 'var(--text-main)', marginBottom: '16px', marginTop: 0 }}>{uiDialog.title}</h2></DialogPrimitive.Title>
            <DialogPrimitive.Description asChild><p style={{ fontSize: '1.1rem', marginBottom: uiDialog.type === 'prompt' ? '16px' : '24px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{uiDialog.message}</p></DialogPrimitive.Description>


            {uiDialog.type === 'prompt' && (
              <input
                type={uiDialog.inputMode === 'decimal' ? 'text' : 'text'}
                inputMode={uiDialog.inputMode || 'text'}
                value={inputValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (uiDialog.inputMode === 'decimal') {
                    // Allow only digits, one dot, up to 2 decimal places
                    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                      setInputValue(val);
                    }
                  } else {
                    setInputValue(val);
                  }
                }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleConfirm(); } }}
                style={{ width: '100%', padding: '14px', fontSize: '1.4rem', fontWeight: 'bold', textAlign: uiDialog.inputMode === 'decimal' ? 'center' : 'left', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', marginBottom: '24px', outline: 'none' }}
                placeholder={uiDialog.inputMode === 'decimal' ? '0.00' : '...'}
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
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export default Dialog;
