import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { printRawReceipt, sendFinalMessage, saveTicketAsPNG } from '../../../utils/sharingUtils';
import { buildCfdiUrl, ensureCfdiConfig, getCfdiPeriodWarning } from '../../../utils/cfdiUrl';
import { logActivity } from '../../../services/activityService';
import { isCloudReachable } from '../../../utils/network';
import { gateRegisterAction } from '../../../utils/actionGate';
import { reopenSale } from '../../../services/reopenService';
import { consumePendingAuthorizer } from '../../../utils/overrideAuthorizer';
import { queueSaleUpdate, saveSaleUpdate, ticketLabel } from './saleUpdate';

// The ticket a stored sale prints/shares as. Legacy sales only kept item names.
export const getOrderTicket = (order) => {
  if (order.items && Array.isArray(order.items)) {
    return { name: order.order_name || String(order.id), items: order.items, discount: order.discount, created_at: order.created_at };
  }
  return {
    name: order.order_name || String(order.id),
    // We don't have historical item prices in legacy sales.
    items: (order.items_sold || []).map(name => ({ name, basePrice: 0, qty: 1, emoji: '☕', selectedModifiers: [] })),
    created_at: order.created_at
  };
};

// Per-order actions other than refunds: reopen, CFDI folio, print and share.
export function useOrderActions({ menuData, generalSettings, posSettings, activeCashier, requirePin, recipes, showAlert, showPrompt, showConfirm, t, lang }) {
  const [sharingOrder, setSharingOrder] = useState(null);
  const [cfdiModal, setCfdiModal] = useState({ isOpen: false, order: null });
  const [cfdiFolio, setCfdiFolio] = useState('');
  const closeCfdi = () => { setCfdiModal({ isOpen: false, order: null }); setCfdiFolio(''); };

  // Put a ticket closed by mistake back on the register (not a refund).
  const handleReopen = (order) => {
    gateRegisterAction({
      posSettings, activeCashier, requirePin,
      title: t('orders.promptPin'),
      run: () => showConfirm(t('orders.reopenTitle'), t('orders.reopenDesc'), async () => {
        try {
          const { warnings } = await reopenSale({ sale: order, recipes });
          logActivity('ticket_reopened', null, {
            ticket_id: order.ticket_id || null,
            ticket_label: ticketLabel(order),
            sale_local_id: order.local_id || null,
            total_amount: order.total_amount,
            original_cashier: order.cashier_name || null
          }, consumePendingAuthorizer());
          showAlert(t('orders.btnReopen'), warnings.length ? `${t('orders.reopenWarn')}\n${warnings.join('\n')}` : t('orders.reopenDone'));
        } catch (e) {
          showAlert(t('common.error'), e?.message || String(e));
        }
      }),
    });
  };

  const handleProcessCfdi = async () => {
    const { order } = cfdiModal;
    if (!order || !cfdiFolio.trim()) return showAlert(t('common.error'), "Ingresa el folio del CFDI");
    const data = { cfdi_status: 'issued', cfdi_folio: cfdiFolio.trim() };
    try {
      await saveSaleUpdate(order, data);
      closeCfdi();
      showAlert(t('toast.success'), 'CFDI Marcado como Emitido');
    } catch (err) {
      if (!isCloudReachable()) {
        await queueSaleUpdate(order, data);
        closeCfdi();
        return showAlert(t('toast.success'), 'CFDI Marcado (Offline)');
      }
      showAlert(t('common.error'), err.message);
    }
  };

  const receiptSettings = (fallback) => menuData?.receiptSettings || fallback;

  const handlePrint = async (order) => {
    const settings = receiptSettings({ header: generalSettings?.name || "", subheader: "", footer: "", enableTaxBreakdown: false, taxRate: 16, logo: null });
    try {
      await printRawReceipt(getOrderTicket(order), order.total_amount, { t, lang, receiptSettings: settings });
    } catch (err) {
      if (err.message !== "unsupported") showAlert(t('common.error'), t('receipt.printerErrorPrefix') + err.message);
      else showAlert(t('receipt.unsupportedTitle'), t('receipt.unsupportedMsg'));
    }
  };

  const handleSharePNG = (order) => {
    setSharingOrder(order);
    // Wait for the DOM to update so the hidden TicketImage is rendered.
    setTimeout(async () => {
      try {
        await saveTicketAsPNG(`order-capture-${order.id}`, `ticket-${order.id}.png`);
      } catch (err) {
        showAlert(t('common.error'), t('receipt.capturePngErrorPrefix') + err.message);
      } finally {
        setSharingOrder(null);
      }
    }, 300);
  };

  const handleShareWA = (order) => {
    showPrompt(t('wa.promptPhone') || "Enter WhatsApp Phone (10 digits):", "", (phone) => {
      if (!phone || phone.length !== 10) return showAlert(t('common.error'), t('wa.invalidPhone'));
      const settings = receiptSettings({ header: generalSettings.name || 'TinyPOS', subheader: '', footer: '', enableTaxBreakdown: false, taxRate: 16 });
      sendFinalMessage(phone, getOrderTicket(order), order.total_amount, { t, lang, receiptSettings: settings });
    });
  };

  const doShareCFDI = (order) => {
    const cfdiUrl = buildCfdiUrl(order.local_id || order.id);
    ensureCfdiConfig(supabase);
    if (navigator.share) {
      navigator.share({ title: 'Solicitud de Factura CFDI', text: 'Enlace para solicitar factura', url: cfdiUrl }).catch(console.error);
    } else {
      navigator.clipboard.writeText(cfdiUrl);
      showAlert('Copiado', 'Enlace CFDI copiado al portapapeles');
    }
  };

  const handleShareCFDI = (order) => {
    // Warn before sharing when the sale was paid in a previous calendar month —
    // invoicing it now may require refacturación (see getCfdiPeriodWarning).
    const warn = getCfdiPeriodWarning(order.created_at);
    if (warn?.crossMonth) {
      showConfirm(
        'Ticket de un mes anterior',
        `Este ticket fue pagado el ${warn.paidStr} (${warn.monthName}), un mes anterior al actual. ` +
        `Facturarlo ahora puede requerir refacturación o quedar fuera de la declaración mensual. ` +
        `¿Compartir el enlace de todos modos?`,
        () => doShareCFDI(order)
      );
      return;
    }
    doShareCFDI(order);
  };

  return {
    sharingOrder, cfdiModal, setCfdiModal, cfdiFolio, setCfdiFolio, closeCfdi,
    handleReopen, handleProcessCfdi, handlePrint, handleSharePNG, handleShareWA, handleShareCFDI,
  };
}
