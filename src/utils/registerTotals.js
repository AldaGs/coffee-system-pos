// Money the register shows: the open ticket's total after discounts, and the
// shift totals the corte reconciles against. All amounts are cents.
import { normalizeMenuPrice } from './moneyUtils';
import { evaluateDiscounts } from './discountEngine';
import { calculateExpectedCash } from './posMath';

const NO_AUTO = { autoDiscountAmount: 0, autoDiscountCart: 0, autoDiscountByItemUid: {}, appliedRuleNames: [], appliedRuleIds: [], appliedRules: [] };

// Automatic rules run only in Advanced mode; the manual discount applies after them.
export function cartTotals(ticket, { rules = [], advanced = false } = {}) {
  const cartSubtotal = ticket ? ticket.items.reduce((total, item) => {
    let itemCost = normalizeMenuPrice(item.basePrice);
    item.selectedModifiers.forEach((mod) => { itemCost += normalizeMenuPrice(mod.price); });
    return total + itemCost * (item.qty || 1);
  }, 0) : 0;

  const auto = advanced
    ? evaluateDiscounts({ rules, ticket, cartSubtotal, activatedRuleIds: ticket?.activatedManualRuleIds || [] })
    : NO_AUTO;

  let manualDiscountAmount = 0;
  if (ticket?.discount) {
    const afterAuto = Math.max(0, cartSubtotal - auto.autoDiscountAmount);
    if (ticket.discount.type === 'percentage') {
      manualDiscountAmount = Math.round(afterAuto * (Math.max(0, Math.min(ticket.discount.value, 100)) / 100));
    } else if (ticket.discount.type === 'flat') {
      // Flat discounts are stored in cents already.
      manualDiscountAmount = Math.max(0, Math.min(ticket.discount.value, afterAuto));
    }
  }

  const cartTotal = Math.max(0, cartSubtotal - auto.autoDiscountAmount - manualDiscountAmount);
  const activeAutoRuleName = auto.appliedRuleNames[0] || '';
  // What checkout and receipts read: the ticket plus the discounts that applied.
  const enrichedTicket = ticket ? {
    ...ticket,
    autoDiscountRuleName: activeAutoRuleName || null,
    autoDiscountRuleNames: auto.appliedRuleNames.length ? auto.appliedRuleNames : null,
    appliedDiscountRuleIds: auto.appliedRuleIds.length ? auto.appliedRuleIds : null,
    appliedDiscountBreakdown: auto.appliedRules.length ? auto.appliedRules : null,
    autoDiscountAmount: auto.autoDiscountAmount || 0,
    manualDiscountAmount: manualDiscountAmount || 0,
  } : null;

  return {
    cartSubtotal, cartTotal, manualDiscountAmount, activeAutoRuleName, enrichedTicket,
    autoDiscountAmount: auto.autoDiscountAmount, autoDiscountCart: auto.autoDiscountCart, autoDiscountByItemUid: auto.autoDiscountByItemUid,
  };
}

// Only petty-cash expenses leave the drawer; bank- or owner-paid ones are in the
// books but not in the cash count. Expenses without a source count as drawer cash.
const leftTheDrawer = (e) => e.payment_source !== 'banco' && e.payment_source !== 'dueno';

// Everything since the last corte, by tender. Split sales count each leg toward its method.
export function shiftTotals(sales, expenses, lastCorteTimestamp) {
  const since = new Date(lastCorteTimestamp);
  const shiftOrders = sales.filter((o) => new Date(o.created_at) > since);
  const shiftExpenses = expenses.filter((e) => new Date(e.timestamp) > since);

  const byMethod = (method) => shiftOrders.reduce((sum, o) => {
    if (o.status === 'refunded') return sum;
    const net = (o.total_amount || 0) - (o.status === 'partial_refund' ? (o.refund_amount || 0) : 0);
    if (o.payment_method === method) return sum + net;
    if (o.payment_method === 'Split' && o.splits) return sum + o.splits.filter((s) => s.method === method).reduce((acc, s) => acc + s.amount, 0);
    return sum;
  }, 0);

  const shiftCashSales = byMethod('Cash');
  const shiftTotalExpenses = shiftExpenses.reduce((sum, e) => sum + (leftTheDrawer(e) ? e.amount : 0), 0);
  const shiftCashRefunds = shiftOrders.reduce((sum, o) => {
    const refunded = o.status === 'refunded' || o.status === 'partial_refund';
    const touchedCash = o.payment_method === 'Cash' || (o.payment_method === 'Split' && o.splits?.some((s) => s.method === 'Cash'));
    return refunded && touchedCash ? sum + (o.refund_amount || 0) : sum;
  }, 0);

  return {
    shiftOrders, shiftExpenses, shiftCashSales,
    shiftCardSales: byMethod('Card'), shiftTransferSales: byMethod('Transfer'), shiftClipSales: byMethod('Clip'),
    shiftTotalExpenses,
    expectedCash: calculateExpectedCash(shiftCashSales, shiftCashRefunds, shiftTotalExpenses),
  };
}
