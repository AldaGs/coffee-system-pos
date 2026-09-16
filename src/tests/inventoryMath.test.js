// src/tests/inventoryMath.test.js
import { describe, it, expect } from 'vitest';
import { buildDeductionPlan, aggregateDeductions, findInventoryItem } from '../utils/inventoryMath';

// A small warehouse: ids are what menu items link to, names are what recipes
// and legacy modifier targets link by.
const inventory = [
  { id: 1, name: 'Agua 600ml', current_stock: 24, unit_cost: 500 },
  { id: 2, name: 'Leche entera', current_stock: 5000, unit_cost: 2 },
  { id: 3, name: 'Café tostado', current_stock: 3000, unit_cost: 40 },
  { id: 4, name: 'Leche de avena', current_stock: 2000, unit_cost: 6 },
  { id: 5, name: 'Shot extra', current_stock: 500, unit_cost: 40 },
];

const latteRecipe = {
  id: 'r-latte',
  ingredients: [
    { id: 3, name: 'Café tostado', qty: '18' },
    { id: 2, name: 'Leche entera', qty: '200' },
  ],
};

const standardLine = (over = {}) => ({
  name: 'Agua 600ml', inventoryMode: 'standard', linkedWarehouseId: 1, qty: 1, ...over,
});
const recipeLine = (over = {}) => ({
  name: 'Latte', inventoryMode: 'recipe', linkedRecipeId: 'r-latte', qty: 1, ...over,
});

const qtyOf = (plan, name) =>
  plan.deductions.filter(d => d.name === name).reduce((s, d) => s + d.qty, 0);

describe('buildDeductionPlan', () => {
  it('deducts a standard item once per unit sold', () => {
    const plan = buildDeductionPlan({ items: [standardLine({ qty: 3 })], recipes: [], inventory });
    expect(qtyOf(plan, 'Agua 600ml')).toBe(3);
    expect(plan.unresolved).toHaveLength(0);
  });

  it('scales every recipe ingredient by the line qty', () => {
    const plan = buildDeductionPlan({ items: [recipeLine({ qty: 2 })], recipes: [latteRecipe], inventory });
    expect(qtyOf(plan, 'Café tostado')).toBe(36);
    expect(qtyOf(plan, 'Leche entera')).toBe(400);
  });

  // The bug this util was extracted to fix: an additive modifier deducted a
  // flat 1 no matter how many units the line had, so "3 lattes, extra shot
  // each" consumed a single shot.
  it('scales an additive modifier on a recipe item by the line qty', () => {
    const line = recipeLine({
      qty: 3,
      selectedModifiers: [{ name: 'Shot extra', deductionTargetId: 5 }],
    });
    const plan = buildDeductionPlan({ items: [line], recipes: [latteRecipe], inventory });
    expect(qtyOf(plan, 'Shot extra')).toBe(3);
  });

  it('scales an additive modifier on a standard item by the line qty', () => {
    const line = standardLine({
      qty: 4,
      selectedModifiers: [{ name: 'Shot extra', deductionTargetId: 5 }],
    });
    const plan = buildDeductionPlan({ items: [line], recipes: [], inventory });
    expect(qtyOf(plan, 'Shot extra')).toBe(4);
  });

  it('substitutes an ingredient at the replaced ingredient\'s qty', () => {
    const line = recipeLine({
      qty: 2,
      selectedModifiers: [{
        name: 'Con avena',
        substitutionTargetId: 2,
        deductionTargetId: 4,
      }],
    });
    const plan = buildDeductionPlan({ items: [line], recipes: [latteRecipe], inventory });
    expect(qtyOf(plan, 'Leche entera')).toBe(0);
    expect(qtyOf(plan, 'Leche de avena')).toBe(400);
    expect(qtyOf(plan, 'Café tostado')).toBe(36);
  });

  it('flags a substitution whose base ingredient is missing, and still deducts the substitute', () => {
    const line = recipeLine({
      qty: 2,
      selectedModifiers: [{
        name: 'Con avena',
        substitutionTarget: 'Leche que ya no existe',
        deductionTargetId: 4,
      }],
    });
    const plan = buildDeductionPlan({ items: [line], recipes: [latteRecipe], inventory });
    expect(qtyOf(plan, 'Leche de avena')).toBe(2);
    expect(plan.unresolved.some(u => u.source === 'substitution')).toBe(true);
  });

  it('reports a stale warehouse link instead of silently skipping it', () => {
    const plan = buildDeductionPlan({
      items: [standardLine({ linkedWarehouseId: 999, name: 'Agua fantasma' })],
      recipes: [],
      inventory,
    });
    expect(plan.deductions).toHaveLength(0);
    expect(plan.unresolved).toEqual([
      { source: 'item', target: '999', lineName: 'Agua fantasma' },
    ]);
  });

  it('reports a recipe ingredient that no longer exists in inventory', () => {
    const recipe = { id: 'r-x', ingredients: [{ id: 77, name: 'Jarabe descontinuado', qty: '10' }] };
    const plan = buildDeductionPlan({
      items: [recipeLine({ linkedRecipeId: 'r-x' })],
      recipes: [recipe],
      inventory,
    });
    expect(plan.deductions).toHaveLength(0);
    expect(plan.unresolved[0].source).toBe('ingredient');
  });

  it('ignores lines with no inventory linkage (fees, untracked products)', () => {
    const plan = buildDeductionPlan({
      items: [{ name: 'Envío', inventoryMode: 'none', qty: 1 }],
      recipes: [],
      inventory,
    });
    expect(plan.deductions).toHaveLength(0);
    expect(plan.unresolved).toHaveLength(0);
  });

  it('skips zero-qty ingredients rather than writing empty movements', () => {
    const recipe = { id: 'r-0', ingredients: [{ id: 2, name: 'Leche entera', qty: '0' }] };
    const plan = buildDeductionPlan({
      items: [recipeLine({ linkedRecipeId: 'r-0' })],
      recipes: [recipe],
      inventory,
    });
    expect(plan.deductions).toHaveLength(0);
  });

  it('treats a non-numeric ingredient qty as zero instead of NaN', () => {
    const recipe = { id: 'r-bad', ingredients: [{ id: 2, name: 'Leche entera', qty: '' }] };
    const plan = buildDeductionPlan({
      items: [recipeLine({ linkedRecipeId: 'r-bad' })],
      recipes: [recipe],
      inventory,
    });
    expect(plan.deductions).toHaveLength(0);
  });
});

describe('aggregateDeductions', () => {
  it('sums the same item drawn from several lines', () => {
    const plan = buildDeductionPlan({
      items: [recipeLine({ qty: 2 }), recipeLine({ qty: 1 })],
      recipes: [latteRecipe],
      inventory,
    });
    // 3 lattes total: 54g of coffee, 600ml of milk — the pre-flight check must
    // see the combined draw, not each line in isolation.
    expect(aggregateDeductions(plan.deductions).get('3')).toBe(54);
    expect(aggregateDeductions(plan.deductions).get('2')).toBe(600);
  });
});

describe('findInventoryItem', () => {
  it('prefers the id over the name', () => {
    expect(findInventoryItem(inventory, 2, 'Café tostado').id).toBe(2);
  });

  it('falls back to the name when no id is given', () => {
    expect(findInventoryItem(inventory, null, 'Café tostado').id).toBe(3);
  });

  it('returns null when neither resolves', () => {
    expect(findInventoryItem(inventory, 999, 'Nada')).toBeNull();
  });
});
