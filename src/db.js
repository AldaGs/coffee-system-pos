import Dexie from 'dexie';

export const db = new Dexie('TinyPOS_DB');

db.version(1).stores({
  sales: '++id, status, created_at',
  menu: 'id',
  syncQueue: '++id',
  active_tickets: 'id',
  inventory: 'id'
});

db.version(2).stores({
  // Removed 'inventory: null' so fresh installs don't drop the table
  inventory_logs: '++id, item, timestamp'
});

db.version(3).stores({
  inventory_logs: '++id, item_name, timestamp, ticket_id'
});

// --- FIX: Version 4 forces the browser to restore the inventory table! ---
db.version(4).stores({
  inventory: 'id'
});

// --- ADD THIS TO THE BOTTOM OF src/db.js ---
db.version(5).stores({
  inventory_logs: '++id, item_name, created_at, ticket_id'
});