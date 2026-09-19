import { describe, it, expect, beforeEach, vi } from 'vitest';

// Offline sale replay: a deduction the cloud can't apply (stock too low) must
// stay queued, not be deleted as done. deduct_inventory_log signals that with an
// empty result and no error.
const { rpc, logDelete } = vi.hoisted(() => ({ rpc: vi.fn(), logDelete: vi.fn() }));
vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: {} }, error: null }) },
    from: () => ({
      select: async () => ({ data: [{ id: 7, name: 'Beans' }] }),
      upsert: async () => ({ error: null }),
    }),
    rpc: (...args) => rpc(...args),
  },
}));

vi.mock('../db', () => ({
  db: {
    syncQueue: { toArray: async () => [] },
    inventory_lots: { toArray: async () => [] },
    lot_consumptions: { toArray: async () => [] },
    updateQueue: { toArray: async () => [] },
    inventory_logs: {
      toArray: async () => [{ id: 1, item_name: 'Beans', qty_deducted: 2, deduction_type: 'sale', local_id: 'L1' }],
      delete: (id) => logDelete(id),
    },
  },
}));
vi.mock('../utils/appMode', () => ({ isLocalMode: () => false }));
vi.mock('../utils/network', () => ({ isCloudReachable: () => true }));

globalThis.localStorage = { getItem: () => null, setItem: () => {} };

import { attemptBackgroundSync } from '../services/syncService';

describe('inventory log replay', () => {
  beforeEach(() => { rpc.mockReset(); logDelete.mockClear(); });

  it('keeps the log queued when the cloud has too little stock', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await attemptBackgroundSync();
    expect(rpc).toHaveBeenCalledWith('deduct_inventory_log', { p_local_id: 'L1', p_item_id: 7, p_qty: 2 });
    expect(logDelete).not.toHaveBeenCalled();
  });

  it('clears the log once the deduction lands', async () => {
    rpc.mockResolvedValue({ data: [{ out_applied: true, out_found: true }], error: null });
    await attemptBackgroundSync();
    expect(logDelete).toHaveBeenCalledWith(1);
  });
});
