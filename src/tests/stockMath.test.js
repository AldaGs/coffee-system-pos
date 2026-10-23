import { describe, expect, it } from 'vitest';
import { isLowStock, blendedUnitCost, transformCosts } from '../components/admin/inventory/stockMath';

describe('stockMath', () => {
  it('uses the reorder point, else 2000 g / 10 units', () => {
    expect(isLowStock({ current_stock: 5, reorder_point: 5 })).toBe(true);
    expect(isLowStock({ current_stock: 6, reorder_point: 5 })).toBe(false);
    expect(isLowStock({ current_stock: 2000, unit: 'g' })).toBe(true);
    expect(isLowStock({ current_stock: 11, unit: 'pz' })).toBe(false);
  });

  it('blends unit cost on restock', () => {
    // 1000 g at 50 mc/g + 1000 g for $1.00 (100,000 mc) -> 75 mc/g
    expect(blendedUnitCost(1000, 50, 1000, 100_000)).toBe(75);
    expect(blendedUnitCost(0, 0, 0, 0)).toBe(0);
  });

  it('costs a roast into a new or existing target', () => {
    // 1000 g green at 20 mc/g + 4000 mc gas -> 800 g roasted = 30 mc/g
    expect(transformCosts({ sourceUnitCost: 20, used: 1000, yieldQty: 800, opCostMillicents: 4000 })).toEqual({ stock: 800, unitCost: 30 });
    expect(transformCosts({ sourceUnitCost: 20, used: 1000, yieldQty: 800, opCostMillicents: 4000, existingTarget: { current_stock: 800, unit_cost: 50 } }))
      .toEqual({ stock: 1600, unitCost: 40 });
  });
});
