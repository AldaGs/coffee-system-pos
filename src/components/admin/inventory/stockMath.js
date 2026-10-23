// Pure stock and cost math for the inventory tab. Costs are millicents per unit.

// Reorder point: the item's own reorder_point, or the old default (2000 g / 10 units) when unset.
export function reorderThreshold(item) {
  const rp = Number(item.reorder_point) || 0;
  if (rp > 0) return rp;
  return item.unit === 'g' ? 2000 : 10;
}
export function isLowStock(item) {
  return Number(item.current_stock) <= reorderThreshold(item);
}

// Weighted average unit cost after adding `qty` that cost `addedMillicents` in total.
export function blendedUnitCost(stock, unitCost, qty, addedMillicents) {
  const total = stock + qty;
  return total > 0 ? Math.round((Math.round(stock * (unitCost || 0)) + addedMillicents) / total) : 0;
}

// A roast/transform: `used` of the source becomes `yieldQty` of the target. The
// target's unit cost carries the source cost plus the operational cost, blended
// with whatever target stock already exists.
export function transformCosts({ sourceUnitCost, used, yieldQty, opCostMillicents, existingTarget }) {
  const batchUnitCost = Math.round((Math.round(used * sourceUnitCost) + opCostMillicents) / yieldQty);
  if (!existingTarget) return { stock: yieldQty, unitCost: batchUnitCost };
  return {
    stock: existingTarget.current_stock + yieldQty,
    unitCost: blendedUnitCost(existingTarget.current_stock, existingTarget.unit_cost, yieldQty, Math.round(yieldQty * batchUnitCost)),
  };
}
