import { describe, expect, it } from 'vitest';
import { inPeriod, netRevenue, refundTotal, operatingExpenses, salesByTender, topItems } from '../components/admin/shell/analyticsMath';

const now = new Date('2026-10-22T12:00:00');

describe('analyticsMath', () => {
  it('filters by period', () => {
    expect(inPeriod('2020-01-01', 'all', {}, now)).toBe(true);
    expect(inPeriod('2026-10-22T01:00:00', 'today', {}, now)).toBe(true);
    expect(inPeriod('2026-10-21T23:00:00', 'today', {}, now)).toBe(false);
    expect(inPeriod('2026-10-16T12:00:00', 'week', {}, now)).toBe(true);
    expect(inPeriod('2026-10-14T12:00:00', 'week', {}, now)).toBe(false);
    expect(inPeriod('2026-10-03T12:00:00', 'custom', { start: '2026-10-01', end: '2026-10-05' }, now)).toBe(true);
    expect(inPeriod('2026-10-08T12:00:00', 'custom', { start: '2026-10-01', end: '2026-10-05' }, now)).toBe(false);
    expect(inPeriod('2020-01-01', 'custom', { start: '2026-10-01', end: '' }, now)).toBe(true);
  });

  it('totals revenue, refunds, expenses and tenders', () => {
    const sales = [
      { total_amount: 1000, payment_method: 'Cash', items_sold: ['Latte'] },
      { total_amount: 500, status: 'refunded', refund_amount: 500, payment_method: 'Card' },
      { total_amount: 800, status: 'partial_refund', refund_amount: 300, payment_method: 'Card', items_sold: ['Latte', 'Mocha'] },
      { total_amount: 600, payment_method: 'Split', splits: [{ method: 'Cash', amount: 200 }, { method: 'Clip', amount: 400 }] },
    ];
    expect(netRevenue(sales)).toBe(2100);
    expect(refundTotal(sales)).toBe(800);
    expect(salesByTender(sales)).toEqual({
      Cash: { amount: 1200, count: 2 }, Card: { amount: 500, count: 1 },
      Transfer: { amount: 0, count: 0 }, Clip: { amount: 400, count: 1 },
    });
    expect(topItems(sales)).toEqual([['Latte', 2], ['Mocha', 1]]);
    expect(operatingExpenses([{ amount: 100, reason: 'Rent' }, { amount: 50, reason: 'RESTOCK: milk' }, { amount: 70, reason: 'Inventory Purchase: beans' }])).toBe(100);
  });
});
