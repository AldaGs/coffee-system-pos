import { db } from '../../../db';
import { supabase } from '../../../supabaseClient';
import { isCloudReachable } from '../../../utils/network';

// Legacy orders (created before local_id existed) won't have a local_id —
// for those we fall back to the cloud `id` (which is what bulkPut stored).
export const queueSaleUpdate = (order, data) => db.updateQueue.add({
  type: 'sale_update',
  local_id: order.local_id || null,
  cloud_id: order.local_id ? null : order.id,
  data,
});

// Writes a patch to the local sale, then to the cloud row (or the offline queue).
export async function saveSaleUpdate(order, data) {
  await db.sales.update(order.id, data);
  if (!isCloudReachable()) return queueSaleUpdate(order, data);
  const { error } = order.local_id
    ? await supabase.from('sales').update(data).eq('local_id', order.local_id)
    : await supabase.from('sales').update(data).eq('id', order.id);
  if (error) throw error;
}

export const ticketLabel = (order) => order.order_name || (order.ticket_id ? order.ticket_id.slice(-6) : String(order.id));
