// src/tests/vendorUtils.test.js
import { describe, it, expect } from 'vitest';
import { lineRevenueCents, allocateProportional, computeSettlement } from '../utils/vendorUtils';

const vendors = [
  { id: 'v1', name: 'AldaGs', commissionPercent: 20 },
  { id: 'v2', name: 'Roaster Co', commissionPercent: 10 },
];

// Helper: a sale whose total_amount equals the raw line sum (no discount).
const sale = (id, items, extra = {}) => {
  const total = items.reduce((s, it) => s + lineRevenueCents(it), 0);
  return { id, created_at: '2026-06-28T12:00:00.000Z', total_amount: total, refund_amount: 0, items, ...extra };
};

describe('vendorUtils — settlement math (centavos)', () => {
  describe('lineRevenueCents', () => {
    it('multiplies (base + modifiers) by qty', () => {
      expect(lineRevenueCents({ basePrice: 5000, qty: 2 })).toBe(10000);
      expect(lineRevenueCents({
        basePrice: 5000, qty: 2,
        selectedModifiers: [{ price: 500 }, { price: 250 }],
      })).toBe(11500);
    });
    it('defaults qty to 1 and ignores missing modifier prices', () => {
      expect(lineRevenueCents({ basePrice: 4200 })).toBe(4200);
    });
  });

  describe('allocateProportional', () => {
    it('sums exactly to the total even when it does not divide evenly', () => {
      const parts = allocateProportional(100, [1, 1, 1]);
      expect(parts.reduce((s, v) => s + v, 0)).toBe(100);
      expect(parts).toEqual([34, 33, 33]);
    });
    it('returns zeros when weights are empty/zero', () => {
      expect(allocateProportional(500, [0, 0])).toEqual([0, 0]);
    });
  });

  describe('computeSettlement', () => {
    it('groups gross + units by vendor and buckets unassigned into Casa', () => {
      const sales = [
        sale('s1', [
          { name: 'Bag of beans', basePrice: 30000, qty: 1, vendorId: 'v1', vendorName: 'AldaGs' },
          { name: 'House Latte', basePrice: 6000, qty: 2 }, // no vendor -> Casa
        ]),
        sale('s2', [
          { name: 'Bag of beans', basePrice: 30000, qty: 2, vendorId: 'v1', vendorName: 'AldaGs' },
        ]),
      ];
      const { rows, totals } = computeSettlement(sales, vendors);

      const alda = rows.find((r) => r.vendorId === 'v1');
      expect(alda.units).toBe(3);
      expect(alda.grossCents).toBe(90000);
      expect(alda.commissionPercent).toBe(20);
      expect(alda.commissionCents).toBe(18000);
      expect(alda.payoutCents).toBe(72000);
      expect(alda.items[0]).toMatchObject({ name: 'Bag of beans', units: 3, grossCents: 90000 });

      const house = rows.find((r) => r.isHouse);
      expect(house.vendorName).toBe('Casa');
      expect(house.grossCents).toBe(12000);
      expect(house.commissionCents).toBe(0);
      expect(house.payoutCents).toBe(12000);

      // Reconciliation: vendor gross + house gross == sum of sale totals.
      expect(totals.grossCents).toBe(90000 + 12000);
    });

    it('scales line gross to total_amount so a ticket discount reconciles', () => {
      const items = [
        { name: 'Bag', basePrice: 30000, qty: 1, vendorId: 'v1', vendorName: 'AldaGs' },
        { name: 'Latte', basePrice: 10000, qty: 1, vendorId: 'v2', vendorName: 'Roaster Co' },
      ];
      // Raw sum is 40000 but only 36000 was charged (10% off the ticket).
      const sales = [{ id: 'd1', created_at: '2026-06-28T10:00:00Z', total_amount: 36000, refund_amount: 0, items }];
      const { rows, totals } = computeSettlement(sales, vendors);
      expect(totals.grossCents).toBe(36000);
      expect(rows.find((r) => r.vendorId === 'v1').grossCents).toBe(27000);
      expect(rows.find((r) => r.vendorId === 'v2').grossCents).toBe(9000);
    });

    it('allocates refunds across vendors and commissions on the net', () => {
      const items = [
        { name: 'Bag', basePrice: 30000, qty: 1, vendorId: 'v1', vendorName: 'AldaGs' },
        { name: 'Latte', basePrice: 10000, qty: 1, vendorId: 'v2', vendorName: 'Roaster Co' },
      ];
      // Full refund of the Latte line (10000 of the 40000 total).
      const sales = [{ id: 'r1', created_at: '2026-06-28T10:00:00Z', total_amount: 40000, refund_amount: 10000, items }];
      const { rows } = computeSettlement(sales, vendors);
      const roaster = rows.find((r) => r.vendorId === 'v2');
      // 10000 gross spread; refund 10000 spread proportional to gross (30000:10000)
      // -> roaster refund = 2500, net = 7500, commission 10% = 750, payout 6750
      expect(roaster.grossCents).toBe(10000);
      expect(roaster.refundCents).toBe(2500);
      expect(roaster.netCents).toBe(7500);
      expect(roaster.commissionCents).toBe(750);
      expect(roaster.payoutCents).toBe(6750);
    });

    it('filters by date range', () => {
      const inRange = sale('a', [{ name: 'X', basePrice: 1000, qty: 1, vendorId: 'v1', vendorName: 'AldaGs' }],
        { created_at: '2026-06-28T12:00:00Z' });
      const outOfRange = sale('b', [{ name: 'X', basePrice: 9999, qty: 1, vendorId: 'v1', vendorName: 'AldaGs' }],
        { created_at: '2026-05-01T12:00:00Z' });
      const { totals } = computeSettlement([inRange, outOfRange], vendors, {
        fromMs: Date.parse('2026-06-01T00:00:00Z'),
        toMs: Date.parse('2026-06-30T23:59:59Z'),
      });
      expect(totals.grossCents).toBe(1000);
    });

    it('falls back to a 0% commission for a vendor no longer in the registry', () => {
      const items = [{ name: 'Ghost', basePrice: 5000, qty: 1, vendorId: 'gone', vendorName: 'Closed Vendor' }];
      const sales = [sale('g1', items)];
      const { rows } = computeSettlement(sales, vendors);
      const ghost = rows.find((r) => r.vendorName === 'Closed Vendor');
      expect(ghost.commissionPercent).toBe(0);
      expect(ghost.payoutCents).toBe(5000);
    });
  });

  describe('cost-recovery split (house keeps the production cost)', () => {
    const costVendors = [{ id: 'ill', name: 'Illustrator', splitType: 'cost', commissionPercent: 0 }];

    it('house recovers unit cost; vendor takes the profit (notebook 115 / cost 35)', () => {
      const items = [{ name: 'Notebook', basePrice: 11500, qty: 1, vendorId: 'ill', vendorName: 'Illustrator', vendorUnitCostCents: 3500 }];
      const { rows } = computeSettlement([sale('n1', items)], costVendors);
      const r = rows.find((x) => x.vendorId === 'ill');
      expect(r.splitType).toBe('cost');
      expect(r.grossCents).toBe(11500);
      expect(r.costCents).toBe(3500);
      expect(r.commissionCents).toBe(3500); // house cut == cost
      expect(r.payoutCents).toBe(8000);     // profit to vendor
    });

    it('multiplies cost by units', () => {
      const items = [{ name: 'Notebook', basePrice: 11500, qty: 3, vendorId: 'ill', vendorName: 'Illustrator', vendorUnitCostCents: 3500 }];
      const { rows } = computeSettlement([sale('n2', items)], costVendors);
      const r = rows.find((x) => x.vendorId === 'ill');
      expect(r.costCents).toBe(10500);
      expect(r.payoutCents).toBe(24000); // 34500 gross − 10500 cost
    });

    it('keeps cost fixed under a ticket discount (the whole point of the mode)', () => {
      const items = [{ name: 'Notebook', basePrice: 11500, qty: 1, vendorId: 'ill', vendorName: 'Illustrator', vendorUnitCostCents: 3500 }];
      // Sold for 100 instead of 115 (discounted). Cost is still 35.
      const sales = [{ id: 'd', created_at: '2026-06-28T10:00:00Z', total_amount: 10000, refund_amount: 0, items }];
      const r = computeSettlement(sales, costVendors).rows.find((x) => x.vendorId === 'ill');
      expect(r.netCents).toBe(10000);
      expect(r.commissionCents).toBe(3500); // unchanged
      expect(r.payoutCents).toBe(6500);     // profit shrinks, cost protected
    });
  });
});
