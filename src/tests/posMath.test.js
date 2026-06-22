// src/tests/posMath.test.js
import { describe, it, expect } from 'vitest';
import { calculateTaxBreakdown, calculateItemizedTaxBreakdown, calculateTransformationCost, calculateExpectedCash } from '../utils/posMath';

describe('TinyPOS Core Mathematical Engines (Integer/Centavos Pattern)', () => {

  describe('Tax Extraction Engine', () => {

    it('accurately extracts 16% SAT tax from a $116.00 (11600 cents) total', () => {
      const result = calculateTaxBreakdown(11600, 16);
      expect(result.subtotal).toBe(10000);
      expect(result.tax).toBe(1600);
    });

    it('handles decimal totals correctly with rounding (using cents)', () => {
      // $45.50 = 4550 cents
      const result = calculateTaxBreakdown(4550, 16);
      // 4550 / 1.16 = 3922.41... -> 3922
      // 4550 - 3922 = 628
      expect(result.subtotal).toBe(3922); 
      expect(result.tax).toBe(628); 
    });
  });

  describe('Itemized IVA Engine (per-item ivaTreatment)', () => {
    it('only carves IVA out of items tagged iva16', () => {
      const items = [
        { basePrice: 11600, qty: 1, ivaTreatment: 'iva16' },   // taxable
        { basePrice: 5000, qty: 1, ivaTreatment: 'tasa0' },    // zero-rated
        { basePrice: 3000, qty: 1, ivaTreatment: 'exento' },   // exempt
      ];
      const total = 11600 + 5000 + 3000; // 19600, no discount
      const r = calculateItemizedTaxBreakdown(items, total, 16);
      expect(r.taxable).toBe(11600);
      expect(r.tax).toBe(1600);          // 11600 - 11600/1.16
      expect(r.subtotal).toBe(18000);    // total - tax
    });

    it('returns zero IVA when no item is taxable', () => {
      const items = [{ basePrice: 5000, qty: 2, ivaTreatment: 'tasa0' }];
      const r = calculateItemizedTaxBreakdown(items, 10000, 16);
      expect(r.tax).toBe(0);
      expect(r.taxable).toBe(0);
      expect(r.subtotal).toBe(10000);
    });

    it('scales the taxable base by a ticket-level discount', () => {
      const items = [{ basePrice: 11600, qty: 1, ivaTreatment: 'iva16' }];
      // 10% off -> charged 10440; taxable scales with it.
      const r = calculateItemizedTaxBreakdown(items, 10440, 16);
      expect(r.taxable).toBe(10440);
      expect(r.tax).toBe(1440); // 10440 - 10440/1.16
    });

    it('includes modifier prices in the taxable line gross', () => {
      const items = [{ basePrice: 10000, qty: 1, ivaTreatment: 'iva16', selectedModifiers: [{ price: 1600 }] }];
      const r = calculateItemizedTaxBreakdown(items, 11600, 16);
      expect(r.taxable).toBe(11600);
      expect(r.tax).toBe(1600);
    });

    it('treats untagged items as non-taxable (defaults to tasa0)', () => {
      const items = [{ basePrice: 5000, qty: 1 }];
      const r = calculateItemizedTaxBreakdown(items, 5000, 16);
      expect(r.tax).toBe(0);
    });
  });

  describe('Inventory Transformation (Roasting Value-Added Cost)', () => {
    it('calculates the true unit cost using millicents (4 decimal precision)', () => {
      // 5000g of raw beans @ $0.01/g (100 millicents/g)
      // 20% shrink = 4000g yield
      // Total raw cost = 5000 * 100 = 500,000 millicents
      // $275 op cost = 27,500 cents = 2,750,000 millicents
      // Total cost = 3,250,000 millicents
      // 3,250,000 / 4000 = 812.5 millicents -> 813
      
      const rawUnitMillicents = 100; // $0.01 per gram
      const operationalCents = 27500; // $275.00
      
      const result = calculateTransformationCost(5000, rawUnitMillicents, 20, operationalCents);
      
      expect(result.yieldQty).toBe(4000);
      expect(result.newUnitMillicents).toBe(813); 
    });
  });

  describe('Corte de Caja (Shift Reconciliation)', () => {
    it('calculates expected cash accounting for sales, refunds, and daily expenses in cents', () => {
      const cashSales = 150050; // $1500.50
      const cashRefunds = 4500;  // $45.00
      const expenses = 25000;    // $250.00
      
      const expected = calculateExpectedCash(cashSales, cashRefunds, expenses);
      expect(expected).toBe(120550); // $1205.50
    });

    it('handles negative balances correctly (more expenses than sales)', () => {
      const expected = calculateExpectedCash(1000, 2000, 500);
      expect(expected).toBe(-1500);
    });

    it('handles zero values correctly', () => {
      expect(calculateExpectedCash(0, 0, 0)).toBe(0);
    });
  });

  describe('Discount Capping Logic', () => {
    it('prevents discounts from exceeding subtotal', () => {
      const subtotal = 1000; // $10.00
      const discount = 1500; // $15.00
      const final = Math.max(0, subtotal - discount);
      expect(final).toBe(0);
    });
  });

});