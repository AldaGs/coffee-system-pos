import { describe, it, expect, beforeEach, vi } from 'vitest';

// The register clears the ticket from processCheckout's onSaved callback. It
// must fire only once the sale is durable in Dexie, so a failed save leaves the
// ticket open to retry instead of losing both.
const { salesAdd, queueAdd } = vi.hoisted(() => ({ salesAdd: vi.fn(), queueAdd: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: null }));
vi.mock('../db', () => ({
  db: {
    sales: { add: (r) => salesAdd(r) },
    syncQueue: { add: (r) => queueAdd(r) },
    inventory: { toArray: async () => [] },
    inventory_logs: { add: async () => {}, bulkPut: async () => {} },
  },
}));
vi.mock('../utils/appMode', () => ({ isLocalMode: () => true }));
vi.mock('../utils/network', () => ({ isCloudReachable: () => false }));
vi.mock('../store/useUpgradeNagStore', () => ({
  useUpgradeNagStore: { getState: () => ({ trigger: () => {} }) },
}));

import { processCheckout } from '../services/checkoutService';

const args = (onSaved) => ({
  activeTicket: { id: 't1', items: [{ name: 'Latte', basePrice: 5000, price: 5000, qty: 1 }] },
  cartTotal: 5000,
  paymentsArray: [{ amount: 5000, method: 'Cash' }],
  activeCashier: { name: 'A' },
  recipes: [],
  onSaved,
});

describe('processCheckout onSaved', () => {
  beforeEach(() => { salesAdd.mockReset(); queueAdd.mockReset(); });

  it('fires once the sale is written', async () => {
    const onSaved = vi.fn();
    await processCheckout(args(onSaved));
    expect(salesAdd).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the sale could not be saved anywhere', async () => {
    salesAdd.mockRejectedValue(new Error('quota'));
    queueAdd.mockRejectedValue(new Error('quota'));
    const onSaved = vi.fn();
    await expect(processCheckout(args(onSaved))).rejects.toThrow('quota');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
