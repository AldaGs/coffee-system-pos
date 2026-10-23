import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: {} }));
const { monthSummary } = await import('../components/admin/cfdi/cfdiShared');

describe('monthSummary', () => {
  it('splits net sales between individual CFDIs, pending requests and the global', () => {
    const s = monthSummary([
      { total_amount: 10000, refund_amount: 0, cfdi_status: 'none' },
      { total_amount: 5000, refund_amount: 1000, cfdi_status: 'none' },
      { total_amount: 20000, refund_amount: 0, cfdi_status: 'issued' },
      { total_amount: 3000, cfdi_status: 'requested' },
      { total_amount: 4000, cfdi_status: 'reopened' },
    ]);
    expect(s).toEqual({
      ticketCount: 5, grossCents: 42000, refundCents: 1000, netCents: 41000,
      invoicedCount: 1, invoicedCents: 20000, globalCount: 2, globalCents: 14000, pendingCount: 2,
    });
  });

  it('is all zeros for an empty month', () => {
    expect(monthSummary(null).ticketCount).toBe(0);
  });
});
