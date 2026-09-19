import { processCheckout, validateStockLocally } from '../services/checkoutService';
import { attemptBackgroundSync } from '../services/syncService';
import { logActivity } from '../services/activityService';
import { updateDiscountRule } from '../api/menu';
import { dayKey } from '../utils/discountEngine';
import { useCartStore } from '../store/useCartStore';
import { useMenuStore } from '../store/useMenuStore';
import { db } from '../db';

// Record discount-rule usage after a completed sale. Only rules that opt into a
// cap or are single-use are tracked, so uncapped rules incur no extra writes.
// For each tracked rule we bump redemptions/spent/per-day counters, deactivate
// single-use ('once') rules, and update the store optimistically so the register
// reflects caps/consumption immediately, then persist (cloud or local per app
// mode). Known limitation: offline, two registers could each redeem past a cap
// before sync reconciles.
const recordRuleUsage = async (ticket) => {
  const ids = ticket?.appliedDiscountRuleIds;
  if (!Array.isArray(ids) || ids.length === 0) return;

  const store = useMenuStore.getState();
  const rules = store.menuData?.discountRules || [];
  const tracked = rules.filter(r => ids.includes(r.id) && r._id && (r.caps || r.usage === 'once'));
  if (tracked.length === 0) return;

  // Per-rule discounted amounts (for the budget counter).
  const amountById = {};
  (ticket.appliedDiscountBreakdown || []).forEach(b => { amountById[b.id] = (amountById[b.id] || 0) + (b.amount || 0); });

  const now = new Date();
  const today = dayKey(now);
  const nextById = {};
  tracked.forEach(r => {
    const sameDay = r.dayKey === today;
    const next = {
      ...r,
      redemptions: (r.redemptions || 0) + 1,
      spent: (r.spent || 0) + (amountById[r.id] || 0),
      dayCount: (sameDay ? (r.dayCount || 0) : 0) + 1,
      dayKey: today,
    };
    if (r.usage === 'once') { next.isActive = false; next.consumedAt = now.toISOString(); }
    nextById[r.id] = next;
  });

  store.setMenuData({
    ...store.menuData,
    discountRules: rules.map(r => nextById[r.id] || r),
  });
  await Promise.all(tracked.map(r =>
    updateDiscountRule(r._id, nextById[r.id])
      .catch(err => console.error('Failed to record discount-rule usage:', err))
  ));
};

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
    const autoDiscountAmount = activeTicket?.autoDiscountAmount || 0;
    const manualDiscountAmount = activeTicket?.manualDiscountAmount || 0;
    const ticketSnapshot = {
      name: activeTicket?.name,
      items: activeTicket?.items,
      total: cartTotal,
      // Carry the discount breakdown so the success flyout can show the
      // subtotal → discounts → total the cashier just charged, instead of
      // implying the un-discounted subtotal was collected.
      subtotal: cartTotal + autoDiscountAmount + manualDiscountAmount,
      autoDiscountAmount,
      manualDiscountAmount,
      autoDiscountRuleNames: activeTicket?.autoDiscountRuleNames || null,
      discount: activeTicket?.discount || null,
    };
    const itemsCount = (activeTicket?.items || []).reduce((s, it) => s + (it.qty || 1), 0);
    const isSplit = paymentsArray.length > 1;
    const masterMethodString = isSplit ? 'Split' : paymentsArray[0].method;

    if (setSuccessTicket) {
      setSuccessTicket({
        name: ticketSnapshot.name,
        items: ticketSnapshot.items,
        total: ticketSnapshot.total,
        subtotal: ticketSnapshot.subtotal,
        autoDiscountAmount: ticketSnapshot.autoDiscountAmount,
        manualDiscountAmount: ticketSnapshot.manualDiscountAmount,
        autoDiscountRuleNames: ticketSnapshot.autoDiscountRuleNames,
        discount: ticketSnapshot.discount,
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
    // the offline syncQueue on cloud failures, and reports a failed stock
    // deduction as result.deductionError (the sale is still recorded).
    processCheckout({
      activeTicket,
      cartTotal,
      paymentsArray,
      activeCashier,
      recipes,
      tipAmount,
      loyaltySettings
    })
      .then((result) => {
        // The sale went through, but one or more lines pointed at an inventory
        // item that no longer exists, so stock did NOT move for them. Silent
        // drift here is how counts quietly go wrong, so tell the cashier.
        const unresolved = result?.unresolvedTargets || [];
        if (result?.deductionError) {
          // The sale is saved and the ticket already closed — say so plainly,
          // or "Checkout Error" reads as a failed sale and gets rung up again.
          showAlert(
            t ? t('register.stockFailedTitle') : 'Sale saved — inventory not updated',
            (t ? t('register.stockFailedDesc') : 'The sale was recorded. Do not charge it again. Stock was not deducted: {{reason}}')
              .replace('{{reason}}', result.deductionError)
          );
        } else if (unresolved.length > 0) {
          const names = [...new Set(unresolved.map(u => u.lineName || u.target))].join(', ');
          showAlert(
            t ? t('register.stockNotMovedTitle') : 'Inventory not updated',
            (t ? t('register.stockNotMovedDesc') : 'The sale was saved, but stock was not deducted for: {{items}}. Check the inventory links for these products.')
              .replace('{{items}}', names)
          );
        }
        recordRuleUsage(activeTicket);
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

  // Paid lines are tracked by item.uniqueId (per-line) rather than item.id
  // (per-menu-product), so two lines of the same product stay independent.
  // Tickets saved before that change stored product ids: claim one matching
  // line each, in order, so an in-flight split isn't silently reopened.
  const migratePaidIds = (savedIds, items) => {
    const uniqueIds = new Set(items.map(i => i.uniqueId));
    const claimed = new Set();
    return savedIds.reduce((acc, savedId) => {
      if (uniqueIds.has(savedId)) {
        acc.push(savedId);
        return acc;
      }
      const match = items.find(i => i.id === savedId && !claimed.has(i.uniqueId));
      if (match) {
        claimed.add(match.uniqueId);
        acc.push(match.uniqueId);
      }
      return acc;
    }, []);
  };

  const handleOpenCheckout = () => {
    if (!activeTicket) return;
    setSplitPayments(activeTicket.savedSplitPayments || []);
    setPaidProductIds(migratePaidIds(activeTicket.savedPaidProductIds || [], activeTicket.items || []));
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
