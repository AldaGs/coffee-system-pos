import { printRawReceipt as printRawReceiptUtil, sendFinalMessage as sendFinalMessageUtil, saveTicketAsPNG } from '../utils/sharingUtils';

const CLOSED_LOYALTY = { isOpen: false, step: 'phone', phone: '', data: null };

// Printing, WhatsApp and PNG receipts for the open ticket.
export function useReceiptSharing({ menuData, posSettings, enrichedTicket, cartTotal, loyaltyModal, setLoyaltyModal, setPhoneError, showAlert, t, lang }) {
  const receiptSettings = (fallbackName) => menuData?.receiptSettings || {
    header: fallbackName, subheader: '', footer: '', enableTaxBreakdown: false, taxRate: 16, logo: null,
  };

  const printRawReceipt = async (ticket, total) => {
    try {
      await printRawReceiptUtil(ticket, total, { t, lang, receiptSettings: receiptSettings(posSettings?.name || '') });
    } catch (err) {
      if (err.message === 'unsupported') showAlert(t('receipt.unsupportedTitle'), t('receipt.unsupportedMsg'));
      else showAlert(t('receipt.printerErr'), t('receipt.printerErrDesc'));
    }
  };

  const sendFinalMessage = (phone, loyaltyData) => {
    sendFinalMessageUtil(phone, enrichedTicket, cartTotal, { t, lang, receiptSettings: receiptSettings(posSettings.name || 'TinyPOS'), loyaltyData });
    setLoyaltyModal(CLOSED_LOYALTY);
  };

  // Captures the hidden TicketImage rendered by the register.
  const handleSaveAsPNG = async (ticket) => {
    try {
      await saveTicketAsPNG('ticket-to-capture', `ticket-${ticket.name || 'pos'}.png`);
    } catch (err) {
      showAlert(t('common.error'), t('receipt.savePngErrorPrefix') + err.message);
    }
  };

  // WhatsApp receipt without joining loyalty.
  const handleGuestReceipt = () => {
    const cleanPhone = loyaltyModal.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) return setPhoneError(true);
    sendFinalMessage(cleanPhone, null);
  };

  return { printRawReceipt, sendFinalMessage, handleSaveAsPNG, handleGuestReceipt };
}
