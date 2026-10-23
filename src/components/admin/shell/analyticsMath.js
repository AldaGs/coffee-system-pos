import { localDayRange } from '../../../utils/localDayRange';

const DAYS = { week: 7, month: 30, '6months': 180, year: 365 };

// Whether a row's date falls in the selected period. 'today' is the calendar
// day; week/month/... count back from now. A custom range with an end missing shows everything.
export function inPeriod(date, timeFilter, dateRange, now = new Date()) {
  if (timeFilter === 'all') return true;
  const d = new Date(date);
  if (timeFilter === 'custom') {
    if (!dateRange.start || !dateRange.end) return true;
    const [start, end] = localDayRange(dateRange);
    return d >= start && d <= end;
  }
  if (timeFilter === 'today') return d.toDateString() === now.toDateString();
  if (DAYS[timeFilter]) return (now - d) / 86_400_000 <= DAYS[timeFilter];
  return true;
}

// Net of refunds; fully refunded sales count as zero.
export const netRevenue = (sales) => sales.reduce((sum, s) => (
  s.status === 'refunded' ? sum : sum + (Number(s.total_amount) || 0) - (Number(s.refund_amount) || 0)
), 0);

export const refundTotal = (sales) => sales.reduce((sum, s) => {
  if (s.status === 'refunded') return sum + Number(s.total_amount);
  if (s.status === 'partial_refund') return sum + Number(s.refund_amount || 0);
  return sum;
}, 0);

// Restock rows are inventory bought, which COGS already counts when it sells.
export const operatingExpenses = (expenses) => expenses
  .filter((e) => {
    const r = e.reason || '';
    return !r.startsWith('RESTOCK:') && !r.startsWith('Inventory Purchase:');
  })
  .reduce((sum, e) => sum + e.amount, 0);

// Per tender, matching the shift corte: partial refunds come off their tender
// and each leg of a split sale counts toward its own method.
export function salesByTender(sales) {
  const totals = Object.fromEntries(['Cash', 'Card', 'Transfer', 'Clip'].map((m) => [m, { amount: 0, count: 0 }]));
  sales.forEach((sale) => {
    if (sale.status === 'refunded') return;
    if (sale.payment_method === 'Split' && Array.isArray(sale.splits)) {
      sale.splits.forEach((s) => {
        if (!totals[s.method]) return;
        totals[s.method].amount += Number(s.amount) || 0;
        totals[s.method].count += 1;
      });
      return;
    }
    if (!totals[sale.payment_method]) return;
    totals[sale.payment_method].amount += (sale.total_amount || 0) - (sale.status === 'partial_refund' ? (sale.refund_amount || 0) : 0);
    totals[sale.payment_method].count += 1;
  });
  return totals;
}

export function topItems(sales, n = 5) {
  const counts = {};
  sales.forEach((sale) => {
    if (Array.isArray(sale.items_sold)) sale.items_sold.forEach((name) => { counts[name] = (counts[name] || 0) + 1; });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}
