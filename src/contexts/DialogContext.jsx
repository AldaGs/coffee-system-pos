import { createContext, useState, useContext } from 'react';
import Dialog from '../components/shared/Dialog'; // Adjust path if your Dialog is elsewhere!

const DialogContext = createContext();

export const useDialog = () => useContext(DialogContext);

export const DialogProvider = ({ children }) => {
  const [uiDialog, setUiDialog] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });

  const showAlert = (title, message) => {
    setUiDialog({ isOpen: true, type: 'alert', title, message, onConfirm: null });
  };

  const showConfirm = (title, message, onConfirmAction) => {
    setUiDialog({ isOpen: true, type: 'confirm', title, message, onConfirm: onConfirmAction });
  };

  const showPrompt = (title, message, onConfirmAction, defaultValue = '', confirmText = '', cancelText = '') => {
    setUiDialog({ isOpen: true, type: 'prompt', title, message, onConfirm: onConfirmAction, inputValue: defaultValue, confirmText, cancelText });
  };

  const closeDialog = () => {
    setUiDialog({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null, inputValue: '' });
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {/* The actual modal renders here, at the top level of the app! */}
      <Dialog uiDialog={uiDialog} closeDialog={closeDialog} />
    </DialogContext.Provider>
  );
};