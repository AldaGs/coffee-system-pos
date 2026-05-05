// src/tests/posMath.test.js
import { describe, it, expect } from 'vitest';
import { calculateTaxBreakdown, calculateTransformationCost, calculateExpectedCash, money } from '../utils/posMath';

describe('TinyPOS Core Mathematical Engines', () => {

  describe('Precision Money Rounding (The EPSILON fix)', () => {
    it('correctly rounds 1.005 to 1.01 (the classic floating point trap)', () => {
      // Standard Math.round(1.005 * 100) / 100 usually fails and returns 1.00
      expect(money(1.005)).toBe(1.01);
    });

    it('correctly rounds 1.105 to 1.11', () => {
      expect(money(1.105)).toBe(1.11);
    });

    it('preserves integers', () => {
      expect(money(100)).toBe(100);
    });

    it('handles negative numbers safely', () => {
      expect(money(-1.005)).toBe(-1.01);
    });
  });

  describe('Tax Extraction Engine', () => {

    it('accurately extracts 16% SAT tax from a $116.00 total', () => {
      const result = calculateTaxBreakdown(116.00, 16);
      expect(result.subtotal).toBe(100.00);
      expect(result.tax).toBe(16.00);
    });

    it('handles decimal totals correctly with rounding', () => {
      const result = calculateTaxBreakdown(45.50, 16);
      expect(result.subtotal).toBe(39.22); 
      expect(result.tax).toBe(6.28); 
    });
  });

  describe('Inventory Transformation (Roasting Value-Added Cost)', () => {
    it('calculates the true unit cost of roasted beans including $275 service fee and 20% shrinkage', () => {
      // 5000g of raw beans @ $0.01/g ($50 total raw cost)
      // 20% shrink = 4000g yield
      // $50 raw cost + $275 op cost = $325 total cost
      // $325 / 4000g = $0.0812 per gram
      const result = calculateTransformationCost(5000, 0.01, 20, 275);
      
      expect(result.yieldQty).toBe(4000);
      expect(result.newUnitCost).toBe(0.0813); // Rounds to 4 decimal places
    });
  });

  describe('Corte de Caja (Shift Reconciliation)', () => {
    it('calculates expected cash accounting for sales, refunds, and daily expenses (gastos)', () => {
      const cashSales = 1500.50;
      const cashRefunds = 45.00;
      const expenses = 250.00; // e.g., buying milk from petty cash
      
      const expected = calculateExpectedCash(cashSales, cashRefunds, expenses);
      expect(expected).toBe(1205.50);
    });
  });

});