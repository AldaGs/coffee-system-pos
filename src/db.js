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