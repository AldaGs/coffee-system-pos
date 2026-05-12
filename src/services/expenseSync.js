import { supabase } from '../supabaseClient';
import { db } from '../db';

// Normalize a cloud expense row into the shape Dexie + Register use locally.
// Cloud columns: id (bigint), amount, reason, category, cashier_name, created_at, local_id.
// Local Dexie keys rows by `local_id` (UUID), so cross-device expenses
// recorded elsewhere dedupe on merge.
const normalize = (cloud) => ({
  // If a cloud row never got a local_id (legacy / admin-console-inserted),
  // fall back to `cloud-{id}` so it still gets a stable Dexie key without
  // colliding with any UUIDs that came from POS terminals.
  id: cloud.local_id || `cloud-${cloud.id}`,
  amount: cloud.amount,
  reason: cloud.reason,
  category: cloud.category || 'General',
  timestamp: cloud.created_at,
  cashierId: cloud.cashier_id || null,
  cashierName: cloud.cashier_name || null,
  cloud_id: cloud.id,
  synced: true
});

// Mirror of fetchAndMergeSales for expenses. Pulls every expense from Supabase
// and bulkPuts into Dexie. Dedup happens automatically because we key Dexie by
// `local_id` — a row this device wrote locally and synced to cloud will be
// updated in place rather than duplicated.
export const fetchAndMergeExpenses = async () => {
  if (!navigator.onLine) return;
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return;

  const rows = data.map(normalize);
  if (rows.length > 0) await db.expenses.bulkPut(rows);
};
