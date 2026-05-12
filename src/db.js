import Dexie from 'dexie';

export const db = new Dexie('TinyPOS_DB');

// --- LEGACY MIGRATIONS ---
// Kept strictly so existing iPads don't crash or lose data during the update.
db.version(1).stores({ sales: '++id, status, created_at', menu: 'id', syncQueue: '++id', active_tickets: 'id', inventory: 'id' });
db.version(2).stores({ inventory_logs: '++id, item, timestamp' });
db.version(3).stores({ inventory_logs: '++id, item_name, timestamp, ticket_id' });
db.version(4).stores({ inventory: 'id' });
db.version(5).stores({ inventory_logs: '++id, item_name, created_at, ticket_id' });

// --- V7: SYNC IDEMPOTENCY ---
db.version(7).stores({
  sales: '++id, status, created_at, local_id',
  menu: 'id',
  syncQueue: '++id, local_id',
  active_tickets: 'id',
  inventory: 'id, name',
  inventory_logs: '++id, item_name, created_at, ticket_id, local_id'
});

// --- V8: OFFLINE UPDATES QUEUE ---
db.version(8).stores({
  sales: '++id, status, created_at, local_id',
  menu: 'id',
  syncQueue: '++id, local_id',
  active_tickets: 'id',
  inventory: 'id, name',
  inventory_logs: '++id, item_name, created_at, ticket_id, local_id',
  updateQueue: '++id, type, local_id'
});

// --- V9: TIPS LIABILITY LEDGER ---
// tip_payouts: each disbursement of pooled tips to staff.
// tip_events:  immutable audit trail of every tip movement (accrual / refund /
//              payout / adjustment). Dexie holds the offline-write side; cloud
//              is the source of truth once synced.
db.version(9).stores({
  sales: '++id, status, created_at, local_id',
  menu: 'id',
  syncQueue: '++id, local_id',
  active_tickets: 'id',
  inventory: 'id, name',
  inventory_logs: '++id, item_name, created_at, ticket_id, local_id',
  updateQueue: '++id, type, local_id',
  tip_payouts: '++id, created_at, local_id',
  tip_events: '++id, event_type, created_at, sale_local_id, payout_local_id, local_id'
});

// --- V10: REGISTER STATE OUT OF LOCALSTORAGE ---
// expenses:    durable per-shift expense ledger (was localStorage, prone to
//              quota wipes and JSON.parse corruption).
// shift_state: small key/value store for shift counters (nextOrderNum,
//              lastResetDate, lastCorteTimestamp).
db.version(10).stores({
  sales: '++id, status, created_at, local_id',
  menu: 'id',
  syncQueue: '++id, local_id',
  active_tickets: 'id',
  inventory: 'id, name',
  inventory_logs: '++id, item_name, created_at, ticket_id, local_id',
  updateQueue: '++id, type, local_id',
  tip_payouts: '++id, created_at, local_id',
  tip_events: '++id, event_type, created_at, sale_local_id, payout_local_id, local_id',
  expenses: 'id, timestamp, cashierId',
  shift_state: 'key'
});