import { processCheckout } from '../services/checkoutService';
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
    clearCurrentTicket, setSuccessTicket, showAlert, showConfirm, t
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
    try {
      // 1. Call our decoupled backend service
      const { masterMethodString } = await processCheckout({
        activeTicket,
        cartTotal,
        paymentsArray,
        activeCashier,
        recipes,
        tipAmount,
        loyaltySettings
      });

      // 2. Handle the UI Side Effects (React state, animations, resets)
      if (setSuccessTicket) {
        setSuccessTicket({
          name: activeTicket.name,
          items: activeTicket.items,
          total: cartTotal,
          method: masterMethodString
        });
        setTimeout(() => setSuccessTicket(null), 2500);
      }

      // 3. Clear state
      resetCheckoutState();
      clearCurrentTicket();

      // 4. Optional: Realtime sync trigger
      attemptBackgroundSync();

      // 5. Analytics
      logActivity('sale', null, {
        amount: cartTotal,
        method: masterMethodString,
        items_count: (activeTicket?.items || []).reduce((s, it) => s + (it.qty || 1), 0)
      });

      return true;
    } catch (error) {
      console.error("Checkout failed:", error);
      showAlert("Checkout Error", error.message || "An unexpected error occurred during checkout.");
      return false;
    }
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
