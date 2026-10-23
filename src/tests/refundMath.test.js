import { describe, it, expect } from 'vitest';
import { planRefund, itemsRefundCents, restockCandidates, lineRefundableQty } from '../components/admin/orders/refundMath';

const latte = { name: 'Latte', basePrice: 5000, qty: 2, selectedModifiers: [{ price: 1000 }], inventoryMode: 'recipe', linkedRecipeId: 'r1' };
const water = { name: 'Agua', basePrice: 2000, qty: 1, inventoryMode: 'standard', linkedWarehouseId: 'w1' };
const fee = { name: 'Envío', basePrice: 3000, qty: 1 };
const order = { total_amount: 17000, tip_amount: 2000, items: [latte, water, fee] };

describe('planRefund', () => {
  it('full refund returns the rest of the total and the whole tip', () => {
    const p = planRefund({ order, mode: 'all', refundItems: {}, tipRefundMode: 'full' });
    expect(p).toMatchObject({ amount: 17000, status: 'refunded', tipRefundDelta: 2000 });
    expect(p.update).toEqual({ status: 'refunded', refund_amount: 17000, tip_refunded: 2000 });
  });

  it('per-item refund prices modifiers and merges into earlier refunds', () => {
    const prior = { ...order, refund_amount: 6000, refunded_items: { 0: { qty: 1, amountCents: 6000 } } };
    expect(lineRefundableQty(prior, 0, latte)).toBe(1);
    expect(itemsRefundCents(prior, { 0: 1, 1: 1 })).toBe(8000);
    const p = planRefund({ order: prior, mode: 'items', refundItems: { 0: 1, 1: 1 }, tipRefundMode: 'proportional' });
    expect(p).toMatchObject({ amount: 8000, status: 'partial_refund', tipRefundDelta: Math.round(2000 * 8000 / 17000) });
    expect(p.update.refund_amount).toBe(14000);
    expect(p.update.refunded_items).toEqual({ 0: { qty: 2, amountCents: 12000 }, 1: { qty: 1, amountCents: 2000 } });
  });

  it('custom amount is capped at what is left; the last cents make it refunded', () => {
    const p = planRefund({ order: { ...order, refund_amount: 16000 }, mode: 'custom', refundItems: {}, customCents: 5000, tipRefundMode: 'none' });
    expect(p).toMatchObject({ amount: 1000, status: 'refunded', tipRefundDelta: 0 });
  });

  it('rejects empty or exhausted refunds', () => {
    expect(planRefund({ order, mode: 'items', refundItems: {}, tipRefundMode: 'none' }).error).toBe('orders.alertNoItems');
    expect(planRefund({ order, mode: 'custom', refundItems: {}, customCents: NaN, tipRefundMode: 'none' }).error).toBe('orders.alertInvalidAmt');
    expect(planRefund({ order: { ...order, refund_amount: 17000 }, mode: 'all', refundItems: {}, tipRefundMode: 'none' }).error).toBe('orders.alertOverload');
  });

  it('only stock-backed lines can go back on the shelf', () => {
    expect(restockCandidates(order, 'all', {}).map(e => e.line.name)).toEqual(['Latte', 'Agua']);
    expect(restockCandidates(order, 'custom', {})).toEqual([]);
  });
});
