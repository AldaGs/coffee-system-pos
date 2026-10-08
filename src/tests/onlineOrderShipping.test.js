import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  claimed: [], rpc: { data: null, error: null }, added: vi.fn(), updated: vi.fn(),
  cloudCreate: vi.fn(), tables: [],
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: () => Promise.resolve(state.rpc),
    from: (name) => {
      state.tables.push(name);
      const query = {
        update: () => query,
        select: (columns) => columns === '*' ? Promise.resolve({ data: state.claimed, error: null }) : query,
        eq: () => query,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve) => Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return query;
    },
  },
}));
vi.mock('../db', () => ({ db: { active_tickets: { add: state.added, update: state.updated } } }));
vi.mock('../services/ticketSync', () => ({ pushActiveTicketCreate: state.cloudCreate }));
vi.mock('../utils/appMode', () => ({ isLocalMode: () => false }));
vi.mock('../utils/customerCapture', () => ({ cleanPhone: (p) => p }));

import { acceptOnlineOrder, confirmShippingQuote } from '../services/onlineOrders';

const oldOrder = {
  id: 9, status: 'requested', customer_name: 'Alex', phone: '2221234567',
  order_type: 'shipping', payment_method: 'card', items: [{ id: 'coffee', name: 'Coffee', base_cents: 4000, qty: 1 }],
  shipping_quote_cents: 1000, delivery_fee_cents: 1000, total_cents: 5000,
};
const options = { activeCashier: { id: 1 }, myDeviceId: 'POS1', menuData: { categories: {} }, orderNum: 4 };

describe('online shipping order transitions', () => {
  beforeEach(() => {
    state.claimed = [];
    state.rpc = { data: null, error: null };
    state.tables.length = 0;
    state.added.mockReset(); state.updated.mockReset(); state.cloudCreate.mockReset();
  });

  it('cannot create a ticket from a pending quote', async () => {
    expect(await acceptOnlineOrder({ ...oldOrder, status: 'quote_pending' }, options)).toBeNull();
    expect(state.added).not.toHaveBeenCalled();
  });

  it('uses the claimed server row after a quote revision and does not dispatch shipping to logistics', async () => {
    state.claimed = [{ ...oldOrder, shipping_quote_cents: 2500, delivery_fee_cents: 2500, total_cents: 6500 }];
    const ticketId = await acceptOnlineOrder(oldOrder, options);
    expect(ticketId).not.toBeNull();
    const ticket = state.added.mock.calls[0][0];
    expect(ticket.items.filter((i) => i.id === 'online-shipping-fee')).toHaveLength(1);
    expect(ticket.items.find((i) => i.id === 'online-shipping-fee').basePrice).toBe(2500);
    expect(ticket.kds_sent).toBeUndefined();
    expect(state.tables).not.toContain('order_fulfillment');
  });

  it('updates local ticket items only after the quote RPC commits', async () => {
    state.rpc = { data: null, error: { message: 'denied' } };
    await expect(confirmShippingQuote(9, 3000)).rejects.toEqual(state.rpc.error);
    expect(state.updated).not.toHaveBeenCalled();
    state.rpc = { data: { ticket_id: 71, ticket_items: [{ id: 'online-shipping-fee', basePrice: 3000 }] }, error: null };
    await confirmShippingQuote(9, 3000);
    expect(state.updated).toHaveBeenCalledWith(71, { items: state.rpc.data.ticket_items });
  });
});
