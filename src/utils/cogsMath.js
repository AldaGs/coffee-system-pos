import { millicentsToCents, normalizeUnitCostToMillicents } from './moneyUtils';

// Returns true if the log's created_at falls inside the active time filter.
// Shared by the Analytics aggregation and the Excel export so wastage totals
// can never drift between the two surfaces.
function isLogInTimeFilter(log, timeFilter, dateRange, now = new Date()) {
  if (timeFilter === 'all') return true;
  const logDateStr = log.created_at || log.timestamp;
  if (!logDateStr) return false;
  const logDate = new Date(logDateStr);
  if (timeFilter === 'today') return logDate.toDateString() === now.toDateString();
  if (timeFilter === 'custom') {
    if (!dateRange?.start || !dateRange?.end) return true;
    const start = new Date(dateRange.start); start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end); end.setHours(23, 59, 59, 999);
    return logDate >= start && logDate <= end;
  }
  const daysDiff = (now - logDate) / (1000 * 60 * 60 * 24);
  if (timeFilter === 'week') return daysDiff <= 7;
  if (timeFilter === 'month') return daysDiff <= 30;
  if (timeFilter === '6months') return daysDiff <= 180;
  if (timeFilter === 'year') return daysDiff <= 365;
  return true;
}

// Single source of truth for COGS + wastage. Mirrors the rules documented in
// AnalyticsTab: skip restock/audit_correction, prefer ticket_id match, treat 0
// historical cost on non-sale logs as missing so legacy rows fall back to the
// current inventory cost.
export function computeCogsAndWastage({
  filteredSales,
  inventoryLogs,
  inventoryItems,
  timeFilter,
  dateRange
}) {
  const relevantTicketIds = new Set(
    (filteredSales || [])
      .map(sale => sale.ticket_id)
      .filter(tid => tid !== undefined && tid !== null && tid !== '')
      .map(String)
  );
  const relevantTimestamps = new Set((filteredSales || []).map(sale => sale.created_at));

  let cogs = 0;
  let waste = 0;
  const now = new Date();

  (inventoryLogs || []).forEach(log => {
    if (log.deduction_type === 'restock' || log.deduction_type === 'audit_correction') return;

    const matchedItem = (inventoryItems || []).find(i => i.name === log.item_name);
    const fallbackCost = matchedItem ? matchedItem.unit_cost : 0;
    const isSale = log.deduction_type === 'sale';
    const hasCost = log.unit_cost !== undefined && log.unit_cost !== null && (isSale || log.unit_cost > 0);
    const rawCost = hasCost ? log.unit_cost : fallbackCost;
    const unitCost = normalizeUnitCostToMillicents(rawCost);
    const impact = millicentsToCents(log.qty_deducted * unitCost);

    if (isSale) {
      const hasTicket = log.ticket_id !== undefined && log.ticket_id !== null && log.ticket_id !== '';
      const matched = hasTicket
        ? relevantTicketIds.has(String(log.ticket_id))
        : relevantTimestamps.has(log.created_at);
      if (matched) cogs += impact;
    } else if (isLogInTimeFilter(log, timeFilter, dateRange, now)) {
      waste += impact;
    }
  });

  return { totalCOGS: cogs, totalWastage: waste };
}

export { isLogInTimeFilter };
