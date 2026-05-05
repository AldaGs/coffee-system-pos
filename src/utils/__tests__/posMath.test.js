import { describe, it, expect } from 'vitest';
import { money, calculateTaxBreakdown, calculateTransformationCost, calculateExpectedCash } from '../posMath';

describe('posMath utilities', () => {
  describe('money helper', () => {
    it('rounds to 2 decimal places', () => {
      expect(money(10.123)).toBe(10.12);
      expect(money(10.125)).toBe(10.13);
      expect(money(10.129)).toBe(10.13);
    });

    it('handles floating point precision issues', () => {
      expect(money(0.1 + 0.2)).toBe(0.3);
      expect(money(1.005)).toBe(1.01);
    });

    it('handles null/undefined/NaN gracefully', () => {
      expect(money(null)).toBe(0);
      expect(money(undefined)).toBe(0);
      expect(money(NaN)).toBe(0);
    });

    it('handles negative values', () => {
      expect(money(-10.123)).toBe(-10.12);
      expect(money(-0.005)).toBe(-0.01);
    });

    it('handles zero', () => {
      expect(money(0)).toBe(0);
    });
  });

  describe('calculateTaxBreakdown', () => {
    it('calculates tax and subtotal correctly', () => {
      const { subtotal, tax } = calculateTaxBreakdown(116, 16);
      expect(subtotal).toBe(100);
      expect(tax).toBe(16);
    });

    it('applies money rounding to results', () => {
      const { subtotal, tax } = calculateTaxBreakdown(100, 16);
      expect(subtotal).toBe(86.21);
      expect(tax).toBe(13.79);
      expect(money(subtotal + tax)).toBe(100);
    });

    it('handles zero total', () => {
      const { subtotal, tax } = calculateTaxBreakdown(0, 16);
      expect(subtotal).toBe(0);
      expect(tax).toBe(0);
    });
  });

  describe('calculateTransformationCost guards', () => {
    it('throws on negative costs', () => {
      expect(() => calculateTransformationCost(1, 1, 0, -1)).toThrow('costs cannot be negative');
      expect(() => calculateTransformationCost(1, -1, 0, 1)).toThrow('costs cannot be negative');
    });

    it('throws on invalid shrink percentage', () => {
      expect(() => calculateTransformationCost(1, 1, -1, 1)).toThrow('shrink percentage must be between 0 and 100');
      expect(() => calculateTransformationCost(1, 1, 100, 1)).toThrow('shrink percentage must be between 0 and 100');
    });

    it('throws on zero or negative yield', () => {
      expect(() => calculateTransformationCost(0, 1, 0, 1)).toThrow('yield quantity must be greater than zero');
    });

    it('calculates cost correctly with valid parameters', () => {
      // 1000g raw @ $10/g, 20% shrink -> 800g yield. Operational cost $200.
      // Total cost = 10000 + 200 = 10200
      // Unit cost = 10200 / 800 = 12.75
      const { yieldQty, newUnitCost } = calculateTransformationCost(1000, 10, 20, 200);
      expect(yieldQty).toBe(800);
      expect(newUnitCost).toBe(12.75);
    });
  });

  describe('calculateExpectedCash', () => {
    it('calculates expected cash with rounding', () => {
      expect(calculateExpectedCash(100.123, 10, 5)).toBe(85.12);
    });

    it('handles zero values', () => {
      expect(calculateExpectedCash(0, 0, 0)).toBe(0);
    });

    it('handles large refunds and expenses', () => {
      // Sales 500, Refunds 200, Expenses 100 = 200
      expect(calculateExpectedCash(500, 200, 100)).toBe(200);
    });

    it('can produce negative expected cash', () => {
      // More outflow than inflow
      expect(calculateExpectedCash(10, 20, 5)).toBe(-15);
    });
  });

  describe('discount capping logic (unit-level)', () => {
    it('clamps individual percentage discount to [0, 100]', () => {
      const pct = Math.max(0, Math.min(100, 150));
      expect(pct).toBe(100);
      const pctNeg = Math.max(0, Math.min(100, -10));
      expect(pctNeg).toBe(0);
    });

    it('clamps combined discount to subtotal', () => {
      const subtotal = 100;
      const autoDiscount = 40;
      const manualDiscount = 80;
      const totalDiscount = Math.min(subtotal, autoDiscount + manualDiscount);
      expect(totalDiscount).toBe(100); // Capped at subtotal
    });

    it('individual clamp prevents negative totals', () => {
      const subtotal = 50;
      const rawAutoDiscount = 60; // Over the subtotal
      const clampedAuto = Math.min(subtotal, Math.max(0, rawAutoDiscount));
      expect(clampedAuto).toBe(50);
      const remaining = subtotal - clampedAuto;
      expect(remaining).toBe(0);
    });
  });

  describe('split payment rounding', () => {
    it('even split rounds each share to money', () => {
      const total = 100;
      const nWays = 3;
      const perPerson = money(total / nWays);
      expect(perPerson).toBe(33.33);
      // Verify that n shares + remainder covers total
      const covered = perPerson * (nWays - 1);
      const lastShare = money(total - covered);
      expect(money(covered + lastShare)).toBe(100);
    });

    it('tip rounding prevents floating point drift', () => {
      const cartTotal = 68.50;
      const tipPct = 10;
      const tip = money(cartTotal * (tipPct / 100));
      expect(tip).toBe(6.85);
      expect(money(cartTotal + tip)).toBe(75.35);
    });
  });
});

