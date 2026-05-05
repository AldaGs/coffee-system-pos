import { processCheckout } from '../services/checkoutService';
import { attemptBackgroundSync } from '../services/syncService';
import { logActivity } from '../services/activityService';
import { useCartStore } from '../store/useCartStore';
import { useMenuStore } from '../store/useMenuStore';

/**
 * Hook to manage the checkout lifecycle.
 * Issue 3.6: Extract from Register.jsx.
 */
export const useCheckout = (posState) => {
  const {
    activeTicket, cartTotal, activeCashier, tipAmount = 0,
    clearCurrentTicket, setSuccessTicket, showAlert
  } = posState;

  const { resetCheckoutState } = useCartStore();
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
        tipAmount
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

  return { handleConfirmPayment };
};

