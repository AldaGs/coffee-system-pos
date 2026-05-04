import { useState } from 'react';
import { DialogContext } from './dialog-context';
import Dialog from '../components/shared/Dialog';

export const DialogProvider = ({ children }) => {
  const [uiDialog, setUiDialog] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });

  const showAlert = (title, message) => {
    setUiDialog({ isOpen: true, type: 'alert', title, message, onConfirm: null, timestamp: Date.now() });
  };

  const showConfirm = (title, message, onConfirmAction) => {
    setUiDialog({ isOpen: true, type: 'confirm', title, message, onConfirm: onConfirmAction, timestamp: Date.now() });
  };

  const showPrompt = (title, message, onConfirmAction, defaultValue = '', confirmText = '', cancelText = '') => {
    setUiDialog({ isOpen: true, type: 'prompt', title, message, onConfirm: onConfirmAction, inputValue: defaultValue, confirmText, cancelText, timestamp: Date.now() });
  };

  const closeDialog = () => {
    setUiDialog({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null, inputValue: '', timestamp: 0 });
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {/* The actual modal renders here, at the top level of the app! */}
      <Dialog key={uiDialog.timestamp} uiDialog={uiDialog} closeDialog={closeDialog} />
    </DialogContext.Provider>
  );
};