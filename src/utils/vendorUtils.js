// Multi-vendor settlement math. Pure functions, integer-centavos throughout
// (same discipline as posMath.js) so per-vendor payouts reconcile exactly with
// the shop's revenue total — no floating-point drift.
//
// A "settlement" groups the line items of completed sales by the vendor that
// owns each product (snapshotted onto sale.items as { vendorId, vendorName } at
// checkout), totals each vendor's sales over a date range, subtracts an
// allocated share of refunds, and applies the vendor's commission — the cut the
// HOUSE keeps — to produce the amount owed to each vendor.

const HOUSE_KEY = '__house__';
const HOUSE_NAME = 'Casa';

// Raw revenue a single sale line represents BEFORE any ticket-level discount:
//   (basePrice + Σ modifier price deltas) * qty
// Mirrors calculateItemizedTaxBreakdown in posMath.js so the two never diverge.
export function lineRevenueCents(item) {
  const mods = (item.selectedModifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0);
  return ((Number(item.basePrice) || 0) + mods) * (Number(item.qty) || 1);
}

// Distribute an integer cents total across weights so the parts sum EXACTLY to
// total (largest-remainder method). Zero/negative weight sum → all zeros.
export function allocateProportional(totalCents, weights) {
  const sum = weights.reduce((s, w) => s + (w > 0 ? w : 0), 0);
  if (sum <= 0 || totalCents === 0) return weights.map(() => 0);

  const exact = weights.map((w) => (totalCents * (w > 0 ? w : 0)) / sum);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = totalCents - floors.reduce((s, v) => s + v, 0);

  // Hand the leftover cents to the largest fractional parts, one each.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = floors.slice();
  for (let k = 0; k < order.length && remainder > 0; k++) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
}

function vendorKeyFor(line) {
  if (line.vendorId) return String(line.vendorId);
  if (line.vendorName) return `name:${line.vendorName}`;
  return HOUSE_KEY;
}

function saleTimeMs(sale) {
  const t = Date.parse(sale.created_at);
  return Number.isNaN(t) ? null : t;
}

// computeSettlement(sales, vendors, { fromMs, toMs })
//   sales   : sale rows; each has items[], total_amount, refund_amount, created_at
//   vendors : registry rows { id, name, commissionPercent }
//   range   : optional inclusive [fromMs, toMs] millisecond bounds (either may be null)
//
// Returns { rows, totals } where each row is:
//   { key, vendorId, vendorName, isHouse, commissionPercent,
//     units, grossCents, refundCents, netCents, commissionCents, payoutCents,
//     items: [{ name, units, grossCents }] }
// Rows are sorted by gross descending with House last.
export function computeSettlement(sales, vendors = [], range = {}) {
  const { fromMs = null, toMs = null } = range;
  const byId = new Map(vendors.map((v) => [String(v.id), v]));
  const byName = new Map(vendors.map((v) => [v.name, v]));

  const groups = new Map();

  const ensureGroup = (line) => {
    const key = vendorKeyFor(line);
    if (!groups.has(key)) {
      const isHouse = key === HOUSE_KEY;
      const vendor = byId.get(String(line.vendorId)) || byName.get(line.vendorName) || null;
      groups.set(key, {
        key,
        vendorId: line.vendorId || null,
        vendorName: isHouse ? HOUSE_NAME : (line.vendorName || vendor?.name || HOUSE_NAME),
        isHouse,
        commissionPercent: isHouse ? 0 : (Number(vendor?.commissionPercent) || 0),
        units: 0,
        grossCents: 0,
        refundCents: 0,
        items: new Map(),
      });
    }
    return groups.get(key);
  };

  for (const sale of sales) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    if (items.length === 0) continue;

    const ms = saleTimeMs(sale);
    if (fromMs != null && (ms == null || ms < fromMs)) continue;
    if (toMs != null && (ms == null || ms > toMs)) continue;

    // Scale raw line revenue to what was actually charged (handles ticket-level
    // discounts) so Σ(line gross) == sale.total_amount and the report reconciles
    // to the revenue figure. total_amount already excludes the tip.
    const rawLines = items.map(lineRevenueCents);
    const charged = Number(sale.total_amount) || 0;
    const grossPerLine = allocateProportional(charged, rawLines);

    // Allocate the sale's refund across the same lines, proportional to charged.
    const refund = Number(sale.refund_amount) || 0;
    const refundPerLine = allocateProportional(refund, grossPerLine);

    items.forEach((line, idx) => {
      const g = ensureGroup(line);
      const qty = Number(line.qty) || 1;
      const gross = grossPerLine[idx];
      g.units += qty;
      g.grossCents += gross;
      g.refundCents += refundPerLine[idx];

      const name = line.name || 'Unknown';
      const entry = g.items.get(name) || { name, units: 0, grossCents: 0 };
      entry.units += qty;
      entry.grossCents += gross;
      g.items.set(name, entry);
    });
  }

  const rows = [...groups.values()].map((g) => {
    const netCents = g.grossCents - g.refundCents;
    const commissionCents = g.isHouse ? 0 : Math.round((netCents * g.commissionPercent) / 100);
    const payoutCents = netCents - commissionCents;
    return {
      key: g.key,
      vendorId: g.vendorId,
      vendorName: g.vendorName,
      isHouse: g.isHouse,
      commissionPercent: g.commissionPercent,
      units: g.units,
      grossCents: g.grossCents,
      refundCents: g.refundCents,
      netCents,
      commissionCents,
      payoutCents,
      items: [...g.items.values()].sort((a, b) => b.grossCents - a.grossCents),
    };
  });

  rows.sort((a, b) => {
    if (a.isHouse !== b.isHouse) return a.isHouse ? 1 : -1; // House last
    return b.grossCents - a.grossCents;
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.units += r.units;
      acc.grossCents += r.grossCents;
      acc.refundCents += r.refundCents;
      acc.netCents += r.netCents;
      acc.commissionCents += r.commissionCents;
      acc.payoutCents += r.payoutCents;
      return acc;
    },
    { units: 0, grossCents: 0, refundCents: 0, netCents: 0, commissionCents: 0, payoutCents: 0 }
  );

  return { rows, totals };
}
