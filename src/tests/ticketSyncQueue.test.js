import { describe, it, expect, beforeEach, vi } from 'vitest';

// supabase-js resolves with `{ error }` on a PostgREST rejection instead of
// throwing. A try/catch around the call therefore never fires, which is how a
// sibling app's broken trigger (every active_tickets PATCH coming back 404)
// took ticket sync down with no error surfaced and nothing queued for retry.
// These cover the contract that stops that happening again.

const { queueAdd, queueRows, pendingCreates } = vi.hoisted(() => ({
  queueAdd: vi.fn(), queueRows: [], pendingCreates: { count: 0 },
}));

const result = { error: null };
const makeBuilder = () => {
  const b = {};
  b.then = (resolve) => Promise.resolve(result).then(resolve);
  b.catch = () => b;
  b.eq = () => b;
  return b;
};

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      insert: () => makeBuilder(),
      update: () => makeBuilder(),
      upsert: () => makeBuilder(),
      delete: () => makeBuilder(),
    }),
  },
}));

vi.mock('../db', () => ({
  db: {
    active_tickets: { clear: async () => {}, bulkPut: async () => {} },
    updateQueue: {
      add: async (row) => { queueAdd(row); queueRows.push(row); return 1; },
      where: () => ({
        anyOf: () => ({ filter: () => ({ delete: async () => 0 }) }),
        equals: () => ({ filter: () => ({ count: async () => pendingCreates.count }) }),
      }),
    },
  },
}));

vi.mock('../utils/appMode', () => ({ isLocalMode: () => false }));
vi.mock('../utils/network', () => ({ isCloudReachable: () => true }));

import {
  pushActiveTicketCreate,
  pushActiveTicketUpdate,
  pushActiveTicketDeletion,
} from '../services/ticketSync';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('active ticket cloud mirroring', () => {
  beforeEach(() => {
    queueAdd.mockReset();
    queueRows.length = 0;
    result.error = null;
    pendingCreates.count = 0;
  });

  it('queues nothing when the cloud write succeeds', async () => {
    await pushActiveTicketUpdate(1, { items: [] });
    await flush();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  // PostgREST answers a PATCH matching zero rows with 204, so a patch sent
  // while the ticket's create is still queued would look like a success and
  // silently lose the change.
  it('queues a patch behind a create that has not landed yet', async () => {
    pendingCreates.count = 1;
    await pushActiveTicketUpdate(7, { items: [{ id: 'x' }] });
    await flush();
    expect(queueRows).toHaveLength(1);
    expect(queueRows[0]).toMatchObject({ type: 'active_ticket_update', ticket_id: 7 });
  });

  it('queues a patch when PostgREST resolves with an error instead of throwing', async () => {
    result.error = { status: 404, code: '42883', message: 'function gen_random_bytes(integer) does not exist' };
    await pushActiveTicketUpdate(42, { items: [{ id: 'x' }] });
    await flush();
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueRows[0]).toMatchObject({ type: 'active_ticket_update', ticket_id: 42 });
    expect(queueRows[0].data).toEqual({ items: [{ id: 'x' }] });
  });

  it('queues a failed create as an upsert, so later patches have a row to hit', async () => {
    result.error = { status: 404, message: 'nope' };
    pushActiveTicketCreate({ id: 7, name: 'A', items: [] });
    await flush();
    expect(queueRows[0]).toMatchObject({ type: 'active_ticket_upsert', ticket_id: 7 });
    expect(queueRows[0].data).toMatchObject({ id: 7, name: 'A' });
  });

  it('queues a failed delete', async () => {
    result.error = { status: 500, message: 'boom' };
    await pushActiveTicketDeletion(9);
    await flush();
    expect(queueRows[0]).toMatchObject({ type: 'ticket_deletion', ticket_id: 9 });
  });
});
