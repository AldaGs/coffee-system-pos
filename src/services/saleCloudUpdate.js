import { supabase } from '../supabaseClient';

// Columns newer than some deployed schemas. If the shop hasn't run the schema
// update yet, PostgREST rejects the unknown column (PGRST204); the patch is
// retried without it so the refund itself still lands.
const OPTIONAL_COLUMNS = ['refund_log'];

// Patch one cloud sale by local_id (or, for legacy rows, its cloud id).
export async function updateCloudSale({ local_id, cloud_id }, data) {
  const run = (patch) => (local_id
    ? supabase.from('sales').update(patch).eq('local_id', local_id)
    : supabase.from('sales').update(patch).eq('id', cloud_id));
  let { error } = await run(data);
  if (error?.code === 'PGRST204' && OPTIONAL_COLUMNS.some((c) => c in data)) {
    const patch = { ...data };
    OPTIONAL_COLUMNS.forEach((c) => delete patch[c]);
    ({ error } = await run(patch));
  }
  return { error };
}
