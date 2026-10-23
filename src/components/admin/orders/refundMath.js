// Refund math for the Orders tab, in cents. Pure, so the money rules are testable.
// refundItems is { [lineIndex]: qtyToRefundNow } for mode 'items'.

// Charged price for ONE unit of a line: base + each modifier's price delta.
// Mirrors lineRevenueCents in vendorUtils so refund amounts reconcile.
export const lineUnitCents = (line) => {
  const mods = (line.selectedModifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0);
  return (Number(line.basePrice) || 0) + mods;
};

// Units of a line still eligible to refund (ordered qty minus units already
// refunded in prior partial refunds, read from the cumulative map).
export const lineRefundableQty = (order, idx, line) => {
  const already = Number(order.refunded_items?.[idx]?.qty) || 0;
  return Math.max(0, (Number(line.qty) || 1) - already);
};

// Cents selected to refund right now across all lines (mode 'items').
export const itemsRefundCents = (order, refundItems) =>
  (order?.items || []).reduce((s, line, idx) => s + lineUnitCents(line) * (Number(refundItems[idx]) || 0), 0);

// A line can only go back into stock if it is inventory-backed at all. Fee
// lines ("Envio") and untracked products have nothing to return.
export const isStockBacked = (line) =>
  (line.inventoryMode === 'standard' && line.linkedWarehouseId) ||
  (line.inventoryMode === 'recipe' && line.linkedRecipeId);

// Default suggestion, which the operator can always override: a standard
// (warehouse-linked) line is a sealed product — a bottle, a can, a bag of
// beans, merch — so it goes back on the shelf. A recipe line was made to
// order, so its ingredients are already consumed and it does not.
export const defaultRestock = (line) => line.inventoryMode === 'standard' && !!line.linkedWarehouseId;

// Lines being refunded right now, with the qty for each: per-line in 'items'
// mode, every remaining unit on a full refund. A custom-amount refund carries
// no line information, so it can't move stock.
export const refundedLinesFor = (order, mode, refundItems) => {
  if (!Array.isArray(order?.items)) return [];
  if (mode === 'items') {
    return order.items
      .map((line, idx) => ({ line, idx, qty: Number(refundItems[idx]) || 0 }))
      .filter(e => e.qty > 0);
  }
  if (mode === 'all') {
    return order.items
      .map((line, idx) => ({ line, idx, qty: lineRefundableQty(order, idx, line) }))
      .filter(e => e.qty > 0);
  }
  return [];
};

// Lines the operator could send back to stock for the current refund shape.
export const restockCandidates = (order, mode, refundItems) =>
  refundedLinesFor(order, mode, refundItems).filter(e => isStockBacked(e.line));

// What a refund does to the sale. Returns { error } (a translation key) or the plan:
// the amount, new status, tip given back, and the merged per-line refund map
// (so vendor settlement can attribute the refund to the exact product returned).
// tipRefundMode: 'none' = staff keeps the tip, 'proportional' = tip * (refund/total),
// 'full' = give back the whole remaining tip.
export function planRefund({ order, mode, refundItems, customCents, tipRefundMode }) {
  const isFull = mode === 'all';
  const isItems = mode === 'items';
  let rAmt = isFull
    ? (order.total_amount - (order.refund_amount || 0))
    : isItems ? itemsRefundCents(order, refundItems) : customCents;
  if (!isFull && (isNaN(rAmt) || rAmt <= 0)) return { error: isItems ? 'orders.alertNoItems' : 'orders.alertInvalidAmt' };

  let refundedItems = null;
  if (isItems) {
    refundedItems = { ...(order.refunded_items || {}) };
    (order.items || []).forEach((line, idx) => {
      const qty = Number(refundItems[idx]) || 0;
      if (qty <= 0) return;
      const prev = refundedItems[idx] || { qty: 0, amountCents: 0 };
      refundedItems[idx] = { qty: prev.qty + qty, amountCents: prev.amountCents + lineUnitCents(line) * qty };
    });
  }

  const prevRefund = order.refund_amount || 0;
  const totalAvailable = order.total_amount - prevRefund;
  rAmt = Math.min(rAmt, totalAvailable);
  if (rAmt <= 0) return { error: 'orders.alertOverload' };

  let status;
  if (order.total_amount === prevRefund + rAmt) {
    status = 'refunded';
    rAmt = totalAvailable;
  } else {
    status = 'partial_refund';
  }

  // Staff are the trustees of the tip, so it is never clawed back silently:
  // the operator picks the policy explicitly.
  const tipTotal = Number(order.tip_amount) || 0;
  const tipAlreadyRefunded = Number(order.tip_refunded) || 0;
  const tipRemaining = Math.max(0, tipTotal - tipAlreadyRefunded);
  let tipRefundDelta = 0;
  if (tipRemaining > 0) {
    if (tipRefundMode === 'full') tipRefundDelta = tipRemaining;
    else if (tipRefundMode === 'proportional') {
      const denom = order.total_amount || 0;
      tipRefundDelta = denom > 0 ? Math.round(tipTotal * (rAmt / denom)) : 0;
    }
    tipRefundDelta = Math.min(tipRefundDelta, tipRemaining);
  }

  const update = { status, refund_amount: prevRefund + rAmt };
  if (tipRefundDelta > 0) update.tip_refunded = tipAlreadyRefunded + tipRefundDelta;
  if (refundedItems) update.refunded_items = refundedItems;
  return { amount: rAmt, status, prevRefund, tipRefundDelta, update };
}
