import { db } from '../../../db';
import { isCloudReachable } from '../../../utils/network';
import { updateCloudSale } from '../../../services/saleCloudUpdate';

// Legacy orders (created before local_id existed) won't have a local_id —
// for those we fall back to the cloud `id` (which is what bulkPut stored).
const target = (order) => ({ local_id: order.local_id || null, cloud_id: order.local_id ? null : order.id });

export const queueSaleUpdate = (order, data) => db.updateQueue.add({ type: 'sale_update', ...target(order), data });

// Writes a patch to the local sale, then to the cloud row (or the offline queue).
export async function saveSaleUpdate(order, data) {
  await db.sales.update(order.id, data);
  if (!isCloudReachable()) return queueSaleUpdate(order, data);
  const { error } = await updateCloudSale(target(order), data);
  if (error) throw error;
}

export const ticketLabel = (order) => order.order_name || (order.ticket_id ? order.ticket_id.slice(-6) : String(order.id));
