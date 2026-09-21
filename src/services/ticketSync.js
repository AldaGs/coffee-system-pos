import { supabase } from '../supabaseClient';
import { db } from '../db';
import { isLocalMode } from '../utils/appMode';
import { isCloudReachable } from '../utils/network';

export const fetchActiveTickets = async () => {
    if (!isCloudReachable()) return;

    try {
        // 1. Ask Supabase for all currently active tickets
        const { data: cloudTickets, error } = await supabase
            .from('active_tickets')
            .select('*');

        if (error) throw error;
        if (!cloudTickets) return;

        // 2. Erase the local Dexie active_tickets cache and replace it with the fresh cloud data
        // (Since active tickets are temporary, it's safer to completely overwrite Dexie with the cloud truth on boot)
        await db.active_tickets.clear();
        await db.active_tickets.bulkPut(cloudTickets);

        console.log(`☁️ Successfully pulled ${cloudTickets.length} active tickets from cloud.`);
    } catch (err) {
        console.error("Failed to pull active tickets:", err);
    }
};

// ---------------------------------------------------------------------------
// Outbound: mirror local active-ticket changes to the cloud.
//
// These live in this service rather than in the useTickets hook so that a
// caller needing only a sync helper (useLoyalty, useCheckout) doesn't pull the
// hook's activity-log and auth-store dependencies into its import graph.
// ---------------------------------------------------------------------------

// Queue an active_ticket mutation for attemptBackgroundSync to replay.
const enqueueTicketOp = (type, ticketId, data) => db.updateQueue.add({
  type,
  ticket_id: ticketId,
  data,
  local_id: crypto.randomUUID()
}).catch(err => console.error(`Failed to queue ${type}:`, err));

// Run a cloud write for an active ticket, falling back to the queue on ANY
// failure.
//
// supabase-js does NOT throw when PostgREST rejects a request — it resolves with
// `{ error }`. A bare try/catch therefore only catches network-layer faults and
// silently swallows every server-side rejection (RLS denial, a trigger raising,
// a stale schema cache). That is exactly how a broken sibling-app trigger took
// active-ticket sync down while the register showed no error at all: the writes
// came back 404, the catch never fired, and nothing was ever queued for retry.
// So both the resolved `error` and a thrown exception route to the queue here.
const mirrorToCloud = (run, { type, ticketId, data, label }) => {
  // Local ('guest') mode: the Dexie write by the caller is authoritative and
  // these are ephemeral — nothing to mirror or queue.
  if (isLocalMode()) return;

  const enqueue = () => enqueueTicketOp(type, ticketId, data);

  // A known-slow link (breaker open) queues immediately rather than firing a
  // cloud write per keystroke/tap that would each stall — the local Dexie write
  // already happened, so the queued op is pure catch-up.
  if (!isCloudReachable()) { enqueue(); return; }

  run()
    .then(({ error }) => { if (error) { console.warn(`Cloud ${label} failed, queuing:`, error); enqueue(); } })
    .catch(err => { console.warn(`Cloud ${label} threw, queuing:`, err); enqueue(); });
};

// True when this ticket's create is still sitting in the queue, i.e. the cloud
// has no row for it yet.
const hasQueuedCreate = async (ticketId) => {
  try {
    const pending = await db.updateQueue
      .where('type').equals('active_ticket_upsert')
      .filter(row => row.ticket_id === ticketId)
      .count();
    return pending > 0;
  } catch (err) {
    console.error('Failed to check for a queued ticket create:', err);
    return false;
  }
};

// Mirror an active_ticket patch to the cloud.
export const pushActiveTicketUpdate = async (ticketId, patch) => {
  if (isLocalMode()) return;

  // If this ticket's INSERT never landed, there is no cloud row to patch — and
  // PostgREST answers a PATCH that matches zero rows with 204, i.e. success. So
  // the write would look fine and the change would vanish. Queue it behind the
  // pending create instead; updateQueue drains in insertion order, so the row
  // exists by the time this patch replays.
  if (await hasQueuedCreate(ticketId)) {
    enqueueTicketOp('active_ticket_update', ticketId, patch);
    return;
  }

  mirrorToCloud(
    () => supabase.from('active_tickets').update(patch).eq('id', ticketId),
    { type: 'active_ticket_update', ticketId, data: patch, label: 'active_ticket update' }
  );
};

// Mirror a newly created active ticket. Queues an UPSERT rather than an UPDATE:
// if the original INSERT never landed there is no row to patch, and every
// later patch queued behind it would fail forever against a ticket the cloud
// has never seen. updateQueue drains in insertion order, so the upsert always
// replays before the patches that follow it.
export const pushActiveTicketCreate = (ticket) => mirrorToCloud(
  () => supabase.from('active_tickets').insert([ticket]),
  { type: 'active_ticket_upsert', ticketId: ticket.id, data: ticket, label: 'active_ticket create' }
);

// Mirror an active ticket deletion.
//
// Drops any create/patch still queued for the same ticket first: replaying those
// after the delete would resurrect a ticket the cashier has already cleared.
export const pushActiveTicketDeletion = async (ticketId) => {
  if (isLocalMode()) return;

  try {
    await db.updateQueue
      .where('type').anyOf(['active_ticket_upsert', 'active_ticket_update'])
      .filter(row => row.ticket_id === ticketId)
      .delete();
  } catch (err) {
    console.error('Failed to drop queued ops for deleted ticket:', err);
  }

  mirrorToCloud(
    () => supabase.from('active_tickets').delete().eq('id', ticketId),
    { type: 'ticket_deletion', ticketId, data: null, label: 'active_ticket delete' }
  );
};
