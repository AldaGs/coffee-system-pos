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

// --- V11: LOCAL-FIRST GUEST MODE ---
// New stores used only when the install runs in local ('guest') mode. Cloud
// installs never touch them, so this version is purely additive and existing
// devices upgrade transparently (see docs/local-first-mode-plan.md).
//
// app_local:  key/value for device-local secrets — the hashed owner credential
//             ('credentials') and hashed cashier/admin PINs ('pins'). Plaintext
//             is never stored.
// menu_local: the menu catalog (categories, items, modifier groups/options,
//             discount rules) when there is no Supabase project. Mirrors the
//             cloud table shapes so the upgrade migration can push it up.
//             IDs are client-generated UUIDs to avoid collisions on migration.
// customers:  local loyalty visit counts, keyed by phone. Migrates to the cloud
//             `customers` table on upgrade.
// nag_state:  upgrade-nudge engagement counters + snooze bookkeeping.
db.version(11).stores({
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
  shift_state: 'key',
  app_local: 'key',
  menu_local: 'id, type',
  customers: 'phone',
  nag_state: 'key'
});

// --- V12: MULTI-VENDOR SALES ---
// vendors: the vendor/consignment registry (name, contact, commission %). Used
//          in both cloud and local mode — cloud mode keeps Supabase as the source
//          of truth and mirrors here is unnecessary, but local ('guest') installs
//          have no Supabase table, so the registry lives here and migrates to the
//          cloud `vendors` table on upgrade. Client-generated UUID ids avoid
//          collisions on that migration (same rule as menu_local).
db.version(12).stores({
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
  shift_state: 'key',
  app_local: 'key',
  menu_local: 'id, type',
  customers: 'phone',
  nag_state: 'key',
  vendors: 'id, sort_order'
});

// --- V13: VENDOR PAYOUT LEDGER ---
// vendor_payouts: each disbursement to a vendor. Mirrors the tip_payouts pattern
//                 (local-first, cloud best-effort, dedup by local_id). Each row
//                 freezes the settlement it was paid against in `data` (line items
//                 + totals + range + flags), so paying against a locked number is
//                 unaffected by later menu retagging. Vendor balance over a range
//                 = SUM(settlement payout owed) - SUM(vendor_payouts amount).
db.version(13).stores({
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
  shift_state: 'key',
  app_local: 'key',
  menu_local: 'id, type',
  customers: 'phone',
  nag_state: 'key',
  vendors: 'id, sort_order',
  vendor_payouts: '++id, vendor_id, created_at, local_id'
});

// --- V14: TABLES / FLOOR PLAN ---
// floor_plan: device-shared floor layout(s). Each row is a saved floor (one per
//             zone is allowed) holding a canvas `document` of table nodes plus
//             metadata. Cloud installs keep Supabase as the source of truth and
//             mirror here for offline reads; local ('guest') installs use this
//             store as the source of truth and migrate up on upgrade. Client-
//             generated UUID ids avoid collisions on migration (same rule as
//             menu_local / vendors).
// tables:     normalized per-table rows derived from the floor plan, for fast
//             runtime status queries (number, name, zone, expectedSeats, shape,
//             geometry). `floor_id` links back to the parent floor_plan row.
// NOTE: the table↔ticket link is additive on `active_tickets` (table_id, seats)
//       and needs no schema change — Dexie stores are schemaless per-row, the
//       string above only declares indexes. table_id is added as an index so the
//       floor view can query open tickets per table.
db.version(15).stores({
  sales: '++id, status, created_at, local_id',
  menu: 'id',
  syncQueue: '++id, local_id',
  active_tickets: 'id, table_id',
  inventory: 'id, name',
  inventory_logs: '++id, item_name, created_at, ticket_id, local_id',
  updateQueue: '++id, type, local_id',
  tip_payouts: '++id, created_at, local_id',
  tip_events: '++id, event_type, created_at, sale_local_id, payout_local_id, local_id',
  expenses: 'id, timestamp, cashierId',
  shift_state: 'key',
  app_local: 'key',
  menu_local: 'id, type',
  customers: 'phone',
  nag_state: 'key',
  vendors: 'id, sort_order',
  vendor_payouts: '++id, vendor_id, created_at, local_id',
  floor_plan: 'id, zone, sort_order',
  tables: 'id, floor_id, zone, number',
  fiscal_profiles: 'id, rfc'
});

