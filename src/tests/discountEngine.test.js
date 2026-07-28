// src/tests/discountEngine.test.js
import { describe, it, expect } from 'vitest';
import { evaluateDiscounts, dayKey } from '../utils/discountEngine';

// Helper: build a ticket item. Prices are in cents (whole numbers), which
// normalizeMenuPrice passes through unchanged.
const item = (name, basePrice, qty = 1, uniqueId = name, selectedModifiers = []) =>
  ({ name, basePrice, qty, uniqueId, selectedModifiers });

const ticket = (...items) => ({ items });

// A fixed Tuesday for schedule tests (2026-07-28 is a Tuesday; getDay() === 2).
const TUESDAY = new Date(2026, 6, 28, 10, 0, 0);
const MONDAY = new Date(2026, 6, 27, 10, 0, 0);
// Fixed clock helper: same Tuesday at HH:MM.
const at = (h, m = 0) => new Date(2026, 6, 28, h, m, 0);

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

  describe('time-of-day (happy hour)', () => {
    const rules = [{
      id: 1, name: 'Happy Hour', isActive: true, type: 'percentage', value: 20, targetType: 'cart',
      conditions: { startTime: '15:00', endTime: '17:00' },
    }];
    const run = (now) => evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now });

    it('applies inside the window', () => {
      expect(run(at(16, 0)).autoDiscountAmount).toBe(1000);
      expect(run(at(15, 0)).autoDiscountAmount).toBe(1000); // inclusive start
      expect(run(at(17, 0)).autoDiscountAmount).toBe(1000); // inclusive end
    });
    it('does not apply before or after the window', () => {
      expect(run(at(14, 59)).autoDiscountAmount).toBe(0);
      expect(run(at(17, 1)).autoDiscountAmount).toBe(0);
    });
    it('handles an overnight window that wraps past midnight', () => {
      const overnight = [{ id: 1, name: 'Late', isActive: true, type: 'percentage', value: 10, targetType: 'cart', conditions: { startTime: '22:00', endTime: '02:00' } }];
      const runOn = (now) => evaluateDiscounts({ rules: overnight, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now });
      expect(runOn(at(23, 0)).autoDiscountAmount).toBe(500);
      expect(runOn(at(1, 0)).autoDiscountAmount).toBe(500);
      expect(runOn(at(12, 0)).autoDiscountAmount).toBe(0);
    });
    it('combines with a day-of-week gate', () => {
      const dayAndTime = [{ id: 1, name: 'Tue HH', isActive: true, type: 'percentage', value: 20, targetType: 'cart', conditions: { days: [2], startTime: '15:00', endTime: '17:00' } }];
      expect(evaluateDiscounts({ rules: dayAndTime, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: at(16) }).autoDiscountAmount).toBe(1000);
      expect(evaluateDiscounts({ rules: dayAndTime, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: new Date(2026, 6, 27, 16, 0, 0) }).autoDiscountAmount).toBe(0); // Monday
    });
  });

  describe('per-rule breakdown (reporting)', () => {
    it('returns each applied rule with its amount', () => {
      const rules = [
        { id: 1, name: 'Top', isActive: true, type: 'percentage', value: 20, targetType: 'cart', priority: 5 },
        { id: 2, name: 'Stack', isActive: true, type: 'percentage', value: 10, targetType: 'cart', priority: 1, allowStack: true },
      ];
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 10000)), cartSubtotal: 10000, now: TUESDAY });
      expect(res.appliedRules).toEqual([
        { id: 1, name: 'Top', amount: 2000 },
        { id: 2, name: 'Stack', amount: 1000 },
      ]);
    });
    it('scales the breakdown on clamp so it still sums to the total', () => {
      const rules = [
        { id: 1, name: 'A', isActive: true, type: 'flat', value: 4000, targetType: 'cart', priority: 2, allowStack: true },
        { id: 2, name: 'B', isActive: true, type: 'flat', value: 4000, targetType: 'cart', priority: 1, allowStack: true },
      ];
      const res = evaluateDiscounts({ rules, ticket: ticket(item('Latte', 5000)), cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(5000);
      expect(res.appliedRules.reduce((s, r) => s + r.amount, 0)).toBe(5000);
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

  describe('attended (manual-trigger) presets', () => {
    const rule = { id: 7, name: 'Cyclist 10%', isActive: true, trigger: 'manual', type: 'percentage', value: 10, targetType: 'cart' };
    const t = ticket(item('Latte', 5000));

    it('does not fire on its own', () => {
      const res = evaluateDiscounts({ rules: [rule], ticket: t, cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(0);
    });
    it('fires once the cashier activates it', () => {
      const res = evaluateDiscounts({ rules: [rule], ticket: t, cartSubtotal: 5000, now: TUESDAY, activatedRuleIds: [7] });
      expect(res.autoDiscountAmount).toBe(500);
      expect(res.appliedRuleNames).toEqual(['Cyclist 10%']);
    });
    it('still respects its own conditions when activated', () => {
      const conditioned = { ...rule, conditions: { days: [2] } };
      expect(evaluateDiscounts({ rules: [conditioned], ticket: t, cartSubtotal: 5000, now: MONDAY, activatedRuleIds: [7] }).autoDiscountAmount).toBe(0);
      expect(evaluateDiscounts({ rules: [conditioned], ticket: t, cartSubtotal: 5000, now: TUESDAY, activatedRuleIds: [7] }).autoDiscountAmount).toBe(500);
    });
    it('an auto rule is unaffected by activation state', () => {
      const auto = { id: 8, name: 'Auto', isActive: true, type: 'percentage', value: 5, targetType: 'cart' };
      const res = evaluateDiscounts({ rules: [auto], ticket: t, cartSubtotal: 5000, now: TUESDAY });
      expect(res.autoDiscountAmount).toBe(250);
    });
  });

  describe('usage caps & budget', () => {
    const base = { id: 9, name: 'Capped', isActive: true, type: 'flat', value: 500, targetType: 'cart' };
    const t = ticket(item('Latte', 5000));
    const run = (rule, now = TUESDAY) => evaluateDiscounts({ rules: [rule], ticket: t, cartSubtotal: 5000, now });

    it('applies while under the total-redemptions cap', () => {
      expect(run({ ...base, caps: { maxRedemptions: 10 }, redemptions: 3 }).autoDiscountAmount).toBe(500);
    });
    it('stops at the total-redemptions cap', () => {
      expect(run({ ...base, caps: { maxRedemptions: 10 }, redemptions: 10 }).autoDiscountAmount).toBe(0);
    });
    it('stops at the budget cap', () => {
      expect(run({ ...base, caps: { maxBudget: 5000 }, spent: 5000 }).autoDiscountAmount).toBe(0);
      expect(run({ ...base, caps: { maxBudget: 5000 }, spent: 4000 }).autoDiscountAmount).toBe(500);
    });
    it('enforces the per-day cap only against today’s count', () => {
      const today = dayKey(TUESDAY);
      // 5 uses today, cap 5 -> blocked
      expect(run({ ...base, caps: { maxPerDay: 5 }, dayCount: 5, dayKey: today }).autoDiscountAmount).toBe(0);
      // 5 uses but from a prior day -> today's count resets to 0 -> allowed
      expect(run({ ...base, caps: { maxPerDay: 5 }, dayCount: 5, dayKey: '2000-01-01' }).autoDiscountAmount).toBe(500);
    });
  });

  describe('loyalty / customer targeting', () => {
    const items = [item('Latte', 5000)];
    const member = { items, loyalty_phone: '5551234' };
    const guest = { items };

    it('members-only applies only when a loyalty phone is attached', () => {
      const rules = [{ id: 1, name: 'Member 15%', isActive: true, type: 'percentage', value: 15, targetType: 'cart', conditions: { customer: 'member' } }];
      expect(evaluateDiscounts({ rules, ticket: member, cartSubtotal: 5000, now: TUESDAY }).autoDiscountAmount).toBe(750);
      expect(evaluateDiscounts({ rules, ticket: guest, cartSubtotal: 5000, now: TUESDAY }).autoDiscountAmount).toBe(0);
    });
    it('non-members-only applies only without a loyalty phone', () => {
      const rules = [{ id: 1, name: 'Welcome 10%', isActive: true, type: 'percentage', value: 10, targetType: 'cart', conditions: { customer: 'nonmember' } }];
      expect(evaluateDiscounts({ rules, ticket: guest, cartSubtotal: 5000, now: TUESDAY }).autoDiscountAmount).toBe(500);
      expect(evaluateDiscounts({ rules, ticket: member, cartSubtotal: 5000, now: TUESDAY }).autoDiscountAmount).toBe(0);
    });
    it("'any' (or unset) ignores membership", () => {
      const rules = [{ id: 1, name: 'All', isActive: true, type: 'percentage', value: 5, targetType: 'cart', conditions: { customer: 'any' } }];
      expect(evaluateDiscounts({ rules, ticket: member, cartSubtotal: 5000, now: TUESDAY }).autoDiscountAmount).toBe(250);
      expect(evaluateDiscounts({ rules, ticket: guest, cartSubtotal: 5000, now: TUESDAY }).autoDiscountAmount).toBe(250);
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
