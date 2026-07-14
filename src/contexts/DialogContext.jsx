import { useState, useCallback, useMemo } from 'react';
import { DialogContext } from './dialog-context';
import Dialog from '../components/shared/Dialog';

export const DialogProvider = ({ children }) => {
  const [uiDialog, setUiDialog] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });

  // These are handed to context consumers and used as effect dependencies
  // (e.g. usePresence). They MUST keep a stable identity — an unstable
  // showAlert re-ran usePresence's effect on every render, rebuilding the
  // Supabase presence channel each time; on a flaky link the old channel's
  // socket never finished unsubscribing, leaking until the tab OOM-crashed.
  // setUiDialog is stable, so empty deps are correct.
  const showAlert = useCallback((title, message) => {
    setUiDialog({ isOpen: true, type: 'alert', title, message, onConfirm: null, timestamp: Date.now() });
  }, []);

  const showConfirm = useCallback((title, message, onConfirmAction) => {
    setUiDialog({ isOpen: true, type: 'confirm', title, message, onConfirm: onConfirmAction, timestamp: Date.now() });
  }, []);

  const showPrompt = useCallback((title, message, onConfirmAction, defaultValue = '', confirmText = '', cancelText = '', inputMode = 'text') => {
    setUiDialog({ isOpen: true, type: 'prompt', title, message, onConfirm: onConfirmAction, inputValue: defaultValue, confirmText, cancelText, inputMode, timestamp: Date.now() });
  }, []);

  const closeDialog = useCallback(() => {
    setUiDialog({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null, inputValue: '', timestamp: 0 });
  }, []);

  const value = useMemo(
    () => ({ showAlert, showConfirm, showPrompt }),
    [showAlert, showConfirm, showPrompt]
  );

  return (
    <DialogContext.Provider value={value}>
      {children}
      {/* The actual modal renders here, at the top level of the app! */}
      <Dialog key={uiDialog.timestamp} uiDialog={uiDialog} closeDialog={closeDialog} />
    </DialogContext.Provider>
  );
};