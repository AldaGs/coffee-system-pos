import { describe, expect, it } from 'vitest';
import { cartTotals, shiftTotals } from '../utils/registerTotals';

const line = (basePrice, qty = 1, mods = []) => ({ basePrice, qty, selectedModifiers: mods.map((price) => ({ price })) });

describe('cartTotals', () => {
  it('sums lines with modifiers and quantities', () => {
    const t = cartTotals({ id: 1, items: [line(5500, 2, [500]), line(3000)] });
    expect(t.cartSubtotal).toBe(15000);
    expect(t.cartTotal).toBe(15000);
    expect(t.enrichedTicket).toMatchObject({ autoDiscountAmount: 0, manualDiscountAmount: 0, autoDiscountRuleName: null });
  });

  it('applies a manual percentage or a capped flat discount', () => {
    const items = [line(10000)];
    expect(cartTotals({ items, discount: { type: 'percentage', value: 15 } }).cartTotal).toBe(8500);
    expect(cartTotals({ items, discount: { type: 'percentage', value: 150 } }).cartTotal).toBe(0);
    expect(cartTotals({ items, discount: { type: 'flat', value: 2500 } }).cartTotal).toBe(7500);
    expect(cartTotals({ items, discount: { type: 'flat', value: 99999 } }).manualDiscountAmount).toBe(10000);
  });

  it('runs automatic rules only in Advanced mode', () => {
    const rules = [{ id: 'r1', name: '10% off', isActive: true, trigger: 'auto', kind: 'standard', type: 'percentage', value: 10, targetType: 'cart' }];
    const ticket = { items: [line(10000)] };
    expect(cartTotals(ticket, { rules, advanced: false }).cartTotal).toBe(10000);
    const on = cartTotals(ticket, { rules, advanced: true });
    expect(on.cartTotal).toBe(9000);
    expect(on.activeAutoRuleName).toBe('10% off');
  });

  it('handles no ticket', () => {
    expect(cartTotals(null)).toMatchObject({ cartSubtotal: 0, cartTotal: 0, enrichedTicket: null });
  });
});

describe('shiftTotals', () => {
  it('reconciles the drawer since the last corte', () => {
    const corte = '2026-10-22T08:00:00Z';
    const sales = [
      { created_at: '2026-10-22T07:00:00Z', total_amount: 99999, payment_method: 'Cash' }, // before the corte
      { created_at: '2026-10-22T09:00:00Z', total_amount: 10000, payment_method: 'Cash' },
      { created_at: '2026-10-22T09:10:00Z', total_amount: 5000, payment_method: 'Card' },
      { created_at: '2026-10-22T09:20:00Z', total_amount: 4000, payment_method: 'Split', splits: [{ method: 'Cash', amount: 1000 }, { method: 'Clip', amount: 3000 }] },
      { created_at: '2026-10-22T09:30:00Z', total_amount: 2000, payment_method: 'Cash', status: 'partial_refund', refund_amount: 500 },
      { created_at: '2026-10-22T09:40:00Z', total_amount: 3000, payment_method: 'Transfer', status: 'refunded', refund_amount: 3000 },
    ];
    const expenses = [
      { timestamp: '2026-10-22T10:00:00Z', amount: 700 },
      { timestamp: '2026-10-22T10:00:00Z', amount: 9000, payment_source: 'banco' },
    ];
    const s = shiftTotals(sales, expenses, corte);
    expect(s.shiftOrders).toHaveLength(5);
    expect([s.shiftCashSales, s.shiftCardSales, s.shiftTransferSales, s.shiftClipSales]).toEqual([12500, 5000, 0, 3000]);
    expect(s.shiftTotalExpenses).toBe(700);
    // 13,000 cash in (10,000 + 1,000 split + 2,000) - the 500 refund once - 700 expense.
    expect(s.shiftCashRefunds).toBe(500);
    expect(s.expectedCash).toBe(11800);
  });

  it('subtracts a dated refund in the shift it was paid out, whatever shift the sale was from', () => {
    const corte = '2026-10-22T08:00:00Z';
    const sales = [
      // Yesterday's cash sale, 300 refunded today and 200 before the corte.
      { created_at: '2026-10-21T12:00:00Z', total_amount: 5000, payment_method: 'Cash', status: 'partial_refund', refund_amount: 500,
        refund_log: [{ at: '2026-10-21T13:00:00Z', cents: 200 }, { at: '2026-10-22T09:00:00Z', cents: 300 }] },
      // Today's card sale refunded today: not cash.
      { created_at: '2026-10-22T09:00:00Z', total_amount: 4000, payment_method: 'Card', status: 'refunded', refund_amount: 4000,
        refund_log: [{ at: '2026-10-22T09:30:00Z', cents: 4000 }] },
      // Today's cash sale fully refunded today: in and out cancel.
      { created_at: '2026-10-22T10:00:00Z', total_amount: 1500, payment_method: 'Cash', status: 'refunded', refund_amount: 1500,
        refund_log: [{ at: '2026-10-22T10:05:00Z', cents: 1500 }] },
    ];
    const s = shiftTotals(sales, [], corte);
    expect(s.shiftCashRefunds).toBe(1800);
    expect(s.expectedCash).toBe(1500 - 1800);
  });
});
