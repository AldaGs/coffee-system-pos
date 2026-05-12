import { supabase } from '../supabaseClient';
import { db } from '../db';

// Pulls sales history from Supabase into Dexie, deduplicating by `local_id`.
// Dexie's primary key is its own auto-incremented `id`, but the cloud row has
// a different server-assigned `id`. Without dedup, every sale that originated
// on this device would appear twice in OrdersTab after a cloud fetch.
export const fetchAndMergeSales = async () => {
  if (!navigator.onLine) return;
  const { data: salesHistory, error } = await supabase.from('sales').select('*');
  if (error || !salesHistory) return;

  const localSales = await db.sales.toArray();
  const localIdToDexieId = new Map();
  for (const s of localSales) {
    if (s.local_id) localIdToDexieId.set(s.local_id, s.id);
  }

  const dexieIdsToDelete = [];
  for (const cloud of salesHistory) {
    if (cloud.local_id && localIdToDexieId.has(cloud.local_id)) {
      const localDexieId = localIdToDexieId.get(cloud.local_id);
      if (localDexieId !== cloud.id) dexieIdsToDelete.push(localDexieId);
    }
  }
  if (dexieIdsToDelete.length > 0) await db.sales.bulkDelete(dexieIdsToDelete);
  await db.sales.bulkPut(salesHistory);

  // Mirror tip ledger tables (small, append-only). Best-effort: an offline
  // admin still has the local writes; this just pulls in events from other
  // devices and refreshes after manual edits in the cloud console.
  try {
    const { data: payouts } = await supabase.from('tip_payouts').select('*');
    if (payouts) {
      await db.tip_payouts.clear();
      await db.tip_payouts.bulkPut(payouts);
    }
    const { data: events } = await supabase.from('tip_events').select('*');
    if (events) {
      await db.tip_events.clear();
      await db.tip_events.bulkPut(events);
    }
  } catch (e) {
    console.warn('tip ledger sync skipped', e);
  }
};
