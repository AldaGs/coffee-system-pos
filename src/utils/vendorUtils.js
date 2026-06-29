// Multi-vendor settlement math. Pure functions, integer-centavos throughout
// (same discipline as posMath.js) so per-vendor payouts reconcile exactly with
// the shop's revenue total — no floating-point drift.
//
// A "settlement" groups the line items of completed sales by the vendor that
// owns each product (snapshotted onto sale.items as { vendorId, vendorName } at
// checkout), totals each vendor's sales over a date range, subtracts an
// allocated share of refunds, and applies the vendor's HOUSE CUT to produce the
// amount owed to each vendor. The house cut is computed one of two ways, per the
// vendor's splitType:
//   'percentage'  — house keeps commissionPercent of net revenue.
//   'cost'        — house keeps the per-item production cost (cost-recovery deal:
//                   the vendor takes all profit). The cost rides on each sale line
//                   as vendorUnitCostCents (snapshotted from the menu item), so a
//                   later price/cost change never rewrites historic settlements.

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

// computeSettlement(sales, vendors, { fromMs, toMs, itemVendorMap })
//   sales   : sale rows; each has items[], total_amount, refund_amount, created_at
//   vendors : registry rows { id, name, commissionPercent }
//   range   : optional inclusive [fromMs, toMs] millisecond bounds (either may be null)
//   itemVendorMap : optional Map keyed by menu-item id ->
//                   { vendorId, vendorName, vendorUnitCostCents }. Used to
//                   RETROACTIVELY attribute sale lines that have NO vendor
//                   snapshot (e.g. tickets sold before vendor tagging existed):
//                   such lines are resolved against the CURRENT menu assignment.
//                   Lines that already carry a snapshot are never overridden.
//
// Returns { rows, totals } where each row is:
//   { key, vendorId, vendorName, isHouse, commissionPercent,
//     units, grossCents, refundCents, netCents, commissionCents, payoutCents,
//     items: [{ name, units, grossCents }] }
// Rows are sorted by gross descending with House last.
export function computeSettlement(sales, vendors = [], range = {}) {
  const { fromMs = null, toMs = null, itemVendorMap = null } = range;
  const byId = new Map(vendors.map((v) => [String(v.id), v]));
  const byName = new Map(vendors.map((v) => [v.name, v]));

  // Fill vendor fields from the current menu when a line predates tagging.
  // A line is "untagged" when it has neither a vendorId nor a vendorName.
  const resolveLine = (line) => {
    if (line.vendorId || line.vendorName) return line;
    const m = itemVendorMap && line.id != null ? itemVendorMap.get(String(line.id)) : null;
    if (!m || !m.vendorId) return line;
    return {
      ...line,
      vendorId: m.vendorId,
      vendorName: m.vendorName,
      vendorUnitCostCents: line.vendorUnitCostCents != null ? line.vendorUnitCostCents : m.vendorUnitCostCents,
    };
  };

  const groups = new Map();

  const ensureGroup = (line) => {
    const key = vendorKeyFor(line);
    if (!groups.has(key)) {
      const isHouse = key === HOUSE_KEY;
      const vendor = byId.get(String(line.vendorId)) || byName.get(line.vendorName) || null;
      // Prefer the live registry name so a renamed vendor reads correctly across
      // ALL their history; fall back to the snapshot only when the vendor has
      // since been deleted (so historic settlements still show a name).
      groups.set(key, {
        key,
        vendorId: line.vendorId || null,
        vendorName: isHouse ? HOUSE_NAME : (vendor?.name || line.vendorName || HOUSE_NAME),
        isHouse,
        splitType: vendor?.splitType === 'cost' ? 'cost' : 'percentage',
        commissionPercent: isHouse ? 0 : (Number(vendor?.commissionPercent) || 0),
        units: 0,
        grossCents: 0,
        refundCents: 0,
        costCents: 0,
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
    // NOTE: refund_amount is a sale-level scalar with no line attribution, so a
    // refund of a single vendor's product is spread across EVERY vendor on the
    // ticket by gross share. This can under-pay vendors whose items weren't the
    // ones returned. It's an intentional approximation until refunds are tracked
    // per line; revisit if/when sales store which line was refunded.
    const refund = Number(sale.refund_amount) || 0;
    const refundPerLine = allocateProportional(refund, grossPerLine);

    items.forEach((rawLine, idx) => {
      const line = resolveLine(rawLine);
      const g = ensureGroup(line);
      const qty = Number(line.qty) || 1;
      const gross = grossPerLine[idx];
      g.units += qty;
      g.grossCents += gross;
      g.refundCents += refundPerLine[idx];
      g.costCents += (Number(line.vendorUnitCostCents) || 0) * qty;

      const name = line.name || 'Unknown';
      const entry = g.items.get(name) || { name, units: 0, grossCents: 0 };
      entry.units += qty;
      entry.grossCents += gross;
      g.items.set(name, entry);
    });
  }

  const rows = [...groups.values()].map((g) => {
    const netCents = g.grossCents - g.refundCents;
    // The "commission" column is the house cut, computed per splitType. For a
    // cost-recovery vendor the house keeps the production cost; the vendor takes
    // the rest (which can go negative if the item was discounted below cost or
    // largely refunded — that means the vendor owes the house).
    let commissionCents;
    if (g.isHouse) commissionCents = 0;
    else if (g.splitType === 'cost') commissionCents = g.costCents;
    else commissionCents = Math.round((netCents * g.commissionPercent) / 100);
    const payoutCents = netCents - commissionCents;
    return {
      key: g.key,
      vendorId: g.vendorId,
      vendorName: g.vendorName,
      isHouse: g.isHouse,
      splitType: g.splitType,
      commissionPercent: g.commissionPercent,
      units: g.units,
      grossCents: g.grossCents,
      refundCents: g.refundCents,
      costCents: g.costCents,
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
