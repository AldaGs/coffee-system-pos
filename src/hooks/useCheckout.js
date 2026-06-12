import { processCheckout, validateStockLocally } from '../services/checkoutService';
import { attemptBackgroundSync } from '../services/syncService';
import { logActivity } from '../services/activityService';
import { useCartStore } from '../store/useCartStore';
import { useMenuStore } from '../store/useMenuStore';
import { db } from '../db';

/**
 * Hook to manage the checkout lifecycle.
 * Issue 3.6: Extract from Register.jsx.
 */
export const useCheckout = (posState) => {
  const {
    activeTicket, cartTotal, activeCashier, tipAmount = 0, loyaltySettings = null,
    clearCurrentTicket, setSuccessTicket, showAlert, showConfirm, t,
    onAfterCheckout
  } = posState;

  const { 
    resetCheckoutState, 
    splitPayments, setSplitPayments, 
    paidProductIds, setPaidProductIds, 
    splitMode, setSplitMode, 
    nWays, setNWays, 
    setIsCheckoutModalOpen 
  } = useCartStore();

  const { recipes } = useMenuStore();

  const handleConfirmPayment = async (paymentsArray) => {
    // Pre-flight stock check against local Dexie inventory so we can abort
    // before the success flyout animates in. The server-side RPC remains the
    // source of truth (and may still reject during background sync).
    const stockError = await validateStockLocally({ activeTicket, recipes });
    if (stockError) {
      showAlert("Checkout Error", stockError);
      return false;
    }

    // Snapshot ticket data for the flyout before we clear state. The success
    // flyout and state reset run immediately so the cashier sees instant
    // feedback; the actual checkout (Dexie write + inventory deduction +
    // cloud sync) runs in the background, and any pending cloud work is
    // surfaced via PendingSyncCard / the offline syncQueue.
    const ticketSnapshot = {
      name: activeTicket?.name,
      items: activeTicket?.items,
      total: cartTotal,
    };
    const itemsCount = (activeTicket?.items || []).reduce((s, it) => s + (it.qty || 1), 0);
    const isSplit = paymentsArray.length > 1;
    const masterMethodString = isSplit ? 'Split' : paymentsArray[0].method;

    if (setSuccessTicket) {
      setSuccessTicket({
        name: ticketSnapshot.name,
        items: ticketSnapshot.items,
        total: ticketSnapshot.total,
        method: masterMethodString
      });
      setTimeout(() => setSuccessTicket(null), 2500);
    }

    resetCheckoutState();
    clearCurrentTicket();
    // Layouts can override the post-checkout destination (e.g. orders mode
    // wants to land back on the tickets list instead of auto-jumping into
    // whatever ticket clearCurrentTicket happened to select next).
    if (onAfterCheckout) onAfterCheckout();

    // Fire-and-forget the heavy work. processCheckout already falls back to
    // the offline syncQueue on cloud failures, so the only error we still
    // need to surface synchronously to the cashier is insufficient stock.
    processCheckout({
      activeTicket,
      cartTotal,
      paymentsArray,
      activeCashier,
      recipes,
      tipAmount,
      loyaltySettings
    })
      .then(() => {
        attemptBackgroundSync();
        logActivity('sale', null, {
          amount: cartTotal,
          method: masterMethodString,
          items_count: itemsCount
        });
      })
      .catch((error) => {
        console.error("Checkout failed:", error);
        showAlert("Checkout Error", error.message || "An unexpected error occurred during checkout.");
      });

    return true;
  };

  const handleOpenCheckout = () => {
    if (!activeTicket) return;
    setSplitPayments(activeTicket.savedSplitPayments || []);
    setPaidProductIds(activeTicket.savedPaidProductIds || []);
    setSplitMode(activeTicket.savedSplitMode || 'full');
    setNWays(activeTicket.savedNWays || 2);
    setIsCheckoutModalOpen(true);
  };

  const handleSavePartialPayments = async () => {
    if (activeTicket) {
      await db.active_tickets.update(activeTicket.id, { 
        savedSplitPayments: splitPayments, 
        savedPaidProductIds: paidProductIds, 
        savedSplitMode: splitMode, 
        savedNWays: nWays 
      });
    }
    setIsCheckoutModalOpen(false);
  };

  const handleVoidPartialPayments = () => {
    showConfirm(t('checkout.voidPartialTitle'), t('checkout.voidPartialDesc'), async () => {
      if (activeTicket) {
        await db.active_tickets.update(activeTicket.id, { 
          savedSplitPayments: [], 
          savedPaidProductIds: [], 
          savedSplitMode: null, 
          savedNWays: 2 
        });
      }
      setSplitPayments([]);
      setPaidProductIds([]);
      setSplitMode('full');
      setNWays(2);
      setIsCheckoutModalOpen(false);
    });
  };

  const handlePartialPayment = (amountToPay, method, itemsToMark = []) => {
    // 1. Log the new payment slice
    const newPayments = [...splitPayments, { amount: amountToPay, method }];
    setSplitPayments(newPayments);

    // 2. Mark any purchased items (For Product splitting mode)
    if (itemsToMark?.length > 0) setPaidProductIds([...paidProductIds, ...itemsToMark]);

    // 3. Test if the ticket is completed
    const totalDue = cartTotal + (Number(tipAmount) || 0);
    const totalPaidSoFar = newPayments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(totalDue - totalPaidSoFar) < 0.01 || totalPaidSoFar >= totalDue) {
      handleConfirmPayment(newPayments);
    }
  };

  const handleCancelCheckout = () => {
    resetCheckoutState();
  };

  return { 
    handleConfirmPayment, 
    handleOpenCheckout, 
    handleSavePartialPayments, 
    handleVoidPartialPayments, 
    handlePartialPayment, 
    handleCancelCheckout 
  };
};
