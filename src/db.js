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
  inventory: null,
  inventory_logs: '++id, item, timestamp'
});
