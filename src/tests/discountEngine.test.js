// src/tests/discountEngine.test.js
import { describe, it, expect } from 'vitest';
import { evaluateDiscounts } from '../utils/discountEngine';

// Helper: build a ticket item. Prices are in cents (whole numbers), which
// normalizeMenuPrice passes through unchanged.
const item = (name, basePrice, qty = 1, uniqueId = name, selectedModifiers = []) =>
  ({ name, basePrice, qty, uniqueId, selectedModifiers });

const ticket = (...items) => ({ items });

// A fixed Tuesday for schedule tests (2026-07-28 is a Tuesday; getDay() === 2).
const TUESDAY = new Date(2026, 6, 28, 10, 0, 0);
const MONDAY = new Date(2026, 6, 27, 10, 0, 0);

describe('Discount Engine', () => {
  describe('legacy standard rules (backward compatibility)', () => {
    it('applies a cart-level percentage exactly like the old loop', () => {
      const rules = [{ id: 1, name: '10% off', isActive: true, type: 'percentage', value: 10, targetType: 'cart' }];
      const t = ticket(item('Latte', 5000, 2));
      const res = evaluateDiscounts({ rules, ticket: t, cartSubtotal: 10000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(1000);
      expect(res.autoDiscountCart).toBe(1000);
      expect(res.appliedRuleNames).toEqual(['10% off']);
    });

    it('applies a flat cart discount', () => {
      const rules = [{ id: 1, name: '$5 off', isActive: true, type: 'flat', value: 500, targetType: 'cart' }];
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(500);
    });

    it('applies an item-level percentage only to matching lines', () => {
      const rules = [{ id: 1, name: 'Muffin 20%', isActive: true, type: 'percentage', value: 20, targetType: 'item', targetValue: 'Muffin' }];
      const t = ticket(item('Latte', 5000, 1, 'u1'), item('Muffin', 3000, 2, 'u2'));
      const res = evaluateDiscounts({ rules, ticket: t, cartSubtotal: 11000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(1200); // 20% of 6000
      expect(res.autoDiscountByItemUid).toEqual({ u2: 1200 });
    });

    it('ignores inactive rules', () => {
      const rules = [{ id: 1, name: 'off', isActive: false, type: 'percentage', value: 50, targetType: 'cart' }];
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(0);
    });
  });

  describe('day-of-week scheduling', () => {
    const rules = [{
      id: 1, name: 'Tuesday 20%', isActive: true, type: 'percentage', value: 20, targetType: 'cart',
      conditions: { days: [2] },
    }];

    it('applies on the scheduled day', () => {
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(1000);
    });

    it('does not apply on other days', () => {
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: MONDAY });
      expect(res.autoDiscountAmount).toBe(0);
    });
  });

  describe('date-range window', () => {
    const rules = [{
      id: 1, name: 'Summer sale', isActive: true, type: 'flat', value: 500, targetType: 'cart',
      conditions: { startDate: '2026-07-01', endDate: '2026-07-31' },
    }];

    it('applies inside the window', () => {
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(500);
    });

    it('does not apply after the window', () => {
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: new Date(2026, 7, 1, 10, 0, 0) });
      expect(res.autoDiscountAmount).toBe(0);
    });
  });

  describe('conditional bundles', () => {
    const rules = [{
      id: 1, name: 'Tue combo', isActive: true, type: 'percentage', value: 20, targetType: 'cart',
      conditions: { days: [2], requiredItems: [{ name: 'Croissant', minQty: 1 }, { name: 'Flat White', minQty: 1 }] },
    }];

    it('applies when both required items are present on the scheduled day', () => {
      const t = ticket(item('Croissant', 4000, 1, 'u1'), item('Flat White', 6000, 1, 'u2'));
      const res = evaluateDiscounts({ rules, ticket: t, cartSubtotal: 10000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(2000);
    });

    it('does not apply when a required item is missing', () => {
      const t = ticket(item('Croissant', 4000, 1, 'u1'));
      const res = evaluateDiscounts({ rules, ticket: t, cartSubtotal: 4000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(0);
    });

    it('respects minQty on required items', () => {
      const rulesMin = [{
        id: 1, name: 'Two croissants', isActive: true, type: 'flat', value: 1000, targetType: 'cart',
        conditions: { requiredItems: [{ name: 'Croissant', minQty: 2 }] },
      }];
      const one = ticket(item('Croissant', 4000, 1));
      const two = ticket(item('Croissant', 4000, 2));
      expect(evaluateDiscounts({ rules: rulesMin, ticket: one, cartSubtotal: 4000, now: TUESDAY }).autoDiscountAmount).toBe(0);
      expect(evaluateDiscounts({ rules: rulesMin, ticket: two, cartSubtotal: 8000, now: TUESDAY }).autoDiscountAmount).toBe(1000);
    });

    it('enforces a minimum subtotal', () => {
      const rulesMin = [{
        id: 1, name: 'Min $100', isActive: true, type: 'flat', value: 1000, targetType: 'cart',
        conditions: { minSubtotal: 10000 },
      }];
      expect(evaluateDiscounts({ rules: rulesMin, ticket: ticket(item('Latte', 9000)), cartSubtotal: 9000, now: TUESDAY }).autoDiscountAmount).toBe(0);
      expect(evaluateDiscounts({ rules: rulesMin, ticket: ticket(item('Latte', 11000)), cartSubtotal: 11000, now: TUESDAY }).autoDiscountAmount).toBe(1000);
    });
  });

  describe('buy X get Y (quantity deals)', () => {
    it('2x1: one free per pair, cheapest unit free', () => {
      const rules = [{ id: 1, name: '2x1 Latte', isActive: true, kind: 'buyXgetY', bogoItem: 'Latte', buyQty: 2, payQty: 1 }];
      // 2 lattes at 5000 -> 1 free
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000, 2, 'u1')), cartSubtotal: 10000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(5000);
      expect(res.autoDiscountByItemUid).toEqual({ u1: 5000 });
    });

    it('2x1: 3 units still only free 1 (one complete pair)', () => {
      const rules = [{ id: 1, name: '2x1 Latte', isActive: true, kind: 'buyXgetY', bogoItem: 'Latte', buyQty: 2, payQty: 1 }];
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000, 3, 'u1')), cartSubtotal: 15000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(5000);
    });

    it('2x1: frees the cheapest units across differently-priced lines', () => {
      const rules = [{ id: 1, name: '2x1 Latte', isActive: true, kind: 'buyXgetY', bogoItem: 'Latte', buyQty: 2, payQty: 1 }];
      // 4 lattes total (2 pairs -> 2 free): 2 @ 4000, 2 @ 6000 -> free the two 4000s
      const t = ticket(item('Latte', 6000, 2, 'expensive'), item('Latte', 4000, 2, 'cheap'));
      const res = evaluateDiscounts({ rules, ticket: t, cartSubtotal: 20000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(8000);
      expect(res.autoDiscountByItemUid).toEqual({ cheap: 8000 });
    });

    it('3x2: one free per group of three', () => {
      const rules = [{ id: 1, name: '3x2 Muffin', isActive: true, kind: 'buyXgetY', bogoItem: 'Muffin', buyQty: 3, payQty: 2 }];
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Muffin', 3000, 6, 'u1')), cartSubtotal: 18000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(6000); // 2 groups -> 2 free
    });

    it('does nothing below the group threshold', () => {
      const rules = [{ id: 1, name: '2x1 Latte', isActive: true, kind: 'buyXgetY', bogoItem: 'Latte', buyQty: 2, payQty: 1 }];
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000, 1, 'u1')), cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(0);
    });
  });

  describe('priority combination', () => {
    it('applies only the highest-priority rule when none allow stacking', () => {
      const rules = [
        { id: 1, name: 'Small', isActive: true, type: 'percentage', value: 10, targetType: 'cart', priority: 1 },
        { id: 2, name: 'Big', isActive: true, type: 'percentage', value: 30, targetType: 'cart', priority: 5 },
      ];
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 10000)), cartSubtotal: 10000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(3000);
      expect(res.appliedRuleNames).toEqual(['Big']);
    });

    it('stacks a lower-priority rule that opts in with allowStack', () => {
      const rules = [
        { id: 1, name: 'Stackable', isActive: true, type: 'percentage', value: 10, targetType: 'cart', priority: 1, allowStack: true },
        { id: 2, name: 'Top', isActive: true, type: 'percentage', value: 20, targetType: 'cart', priority: 5 },
      ];
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 10000)), cartSubtotal: 10000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(3000); // 2000 + 1000
      expect(res.appliedRuleNames).toEqual(['Top', 'Stackable']);
    });
  });

  describe('single-use coupons', () => {
    const base = { id: 1, name: 'Coupon', isActive: true, type: 'flat', value: 500, targetType: 'cart', usage: 'once' };
    it('applies while un-consumed', () => {
      const res = evaluateDiscounts({ rules: [base], ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(500);
      expect(res.appliedRuleIds).toEqual([1]);
    });
    it('is skipped once consumed', () => {
      const consumed = { ...base, consumedAt: '2026-07-20T00:00:00Z' };
      const res = evaluateDiscounts({ rules: [consumed], ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(0);
    });
  });

  describe('subtotal clamp', () => {
    it('never discounts more than the subtotal and scales the breakdown', () => {
      const rules = [{ id: 1, name: 'Huge', isActive: true, type: 'flat', value: 99999, targetType: 'cart' }];
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(5000);
      expect(res.autoDiscountCart).toBe(5000);
    });
  });

  describe('guards', () => {
    it('returns empty for an empty ticket', () => {
      const rules = [{ id: 1, name: 'x', isActive: true, type: 'percentage', value: 10, targetType: 'cart' }];
      const res = evaluateDiscounts({ rules, ticket: ticket(), cartSubtotal: 0, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(0);
    });
    it('returns empty when there are no rules', () => {
      const res = evaluateDiscounts({ rules: [], ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(0);
    });
  });
});
