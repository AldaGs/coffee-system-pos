import { supabase } from '../supabaseClient';
import { db } from '../db';
import { isLocalMode } from '../utils/appMode';
import { pushActiveTicketCreate } from './ticketSync';
import { cleanPhone } from '../utils/customerCapture';

// Staff-side transitions for online_orders (see docs/online-ordering.md).
// requested -> accepted | rejected -> preparing -> ready -> completed.

export const ONLINE_STATUS_RANK = { requested: 0, accepted: 1, preparing: 2, ready: 3, completed: 4 };

export const setOnlineOrderStatus = (id, status, extra = {}) =>
  supabase.from('online_orders')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id);

export const rejectOnlineOrder = (id, reason) =>
  setOnlineOrderStatus(id, 'rejected', { reject_reason: reason || null });

// Accept: atomically claim the order (so two stations can't both accept it),
// then open a real active ticket from the server-priced snapshot and link it.
// Returns the new ticket id, or null if another station got there first.
export async function acceptOnlineOrder(order, { activeCashier, myDeviceId, menuData, orderNum, feeLabel = 'Envío' }) {
  const { data: claimed, error } = await supabase.from('online_orders')
    .update({ status: 'accepted', order_num: orderNum, updated_at: new Date().toISOString() })
    .eq('id', order.id).eq('status', 'requested').select('id');
  if (error) throw error;
  if (!claimed?.length) return null;

  // Spread the local menu item when we have it so inventory links, category and
  // tax treatment ride along; the price always comes from the server snapshot.
  const local = new Map();
  Object.values(menuData?.categories || {}).flat().forEach((i) => local.set(i.id, i));
  const items = (order.items || []).map((l) => ({
    ...(local.get(l.id) || { id: l.id, name: l.name, ...(l.iva ? { ivaTreatment: l.iva } : {}) }),
    basePrice: l.base_cents,
    qty: l.qty,
    uniqueId: crypto.randomUUID(),
    selectedModifiers: (l.modifiers || []).map((m) => ({ id: m.id, name: m.name, price: m.price_cents, groupId: m.groupId })),
  }));

  // Delivery fee rides on the ticket as a plain priced line (no menu item, no tax).
  if (order.delivery_fee_cents > 0) {
    items.push({ id: 'online-delivery-fee', name: feeLabel, basePrice: order.delivery_fee_cents, qty: 1, uniqueId: crypto.randomUUID(), selectedModifiers: [] });
  }

  const prefix = (myDeviceId || 'ONL').substring(0, 3).toUpperCase();
  const note = order.notes ? ` - ${order.notes.slice(0, 40)}` : '';
  const ticket = {
    id: Date.now(),
    name: `${prefix} - ${order.customer_name} (#${orderNum}) (Online)${note}`,
    items,
    cashier_id: activeCashier?.id,
    last_modified_by: myDeviceId,
    created_at: new Date().toISOString(),
  };

  // Loyalty: only attach when the phone already belongs to a customer.
  try {
    const p = cleanPhone(order.phone).slice(-10);
    if (p.length === 10) {
      const { data } = await supabase.from('customers').select('phone').eq('phone', p).maybeSingle();
      if (data) ticket.loyalty_phone = p;
    }
  } catch { /* loyalty is best-effort */ }

  await db.active_tickets.add(ticket);
  pushActiveTicketCreate(ticket);
  await supabase.from('online_orders').update({ active_ticket_id: ticket.id }).eq('id', order.id);
  return ticket.id;
}

// Hand a delivery order to tinylogistics through the shared order_fulfillment
// row. Updates the row if the ticket already went to the KDS, else inserts it
// (same shape as Register's handleSendToKds) and marks the ticket kds_sent so
// KDS immediate mode doesn't add a second one.
export async function sendOrderToLogistics(order, ticket) {
  const patch = {
    delivery_address: order.delivery_address,
    delivery_notes: [order.notes, `Tel: ${order.phone}`].filter(Boolean).join(' · '),
  };
  const { data: updated, error } = await supabase.from('order_fulfillment')
    .update(patch).eq('active_ticket_id', order.active_ticket_id).select('id');
  if (error) throw error;
  if (updated?.length) return;
  if (!ticket) throw new Error('ticket_missing');
  await db.active_tickets.update(ticket.id, { kds_sent: true });
  const { error: insErr } = await supabase.from('order_fulfillment').insert({
    active_ticket_id: ticket.id, customer_name: order.customer_name, items: ticket.items,
    payment_status: 'unpaid', status: 'received', ...patch,
  });
  if (insErr) { await db.active_tickets.update(ticket.id, { kds_sent: false }).catch(() => {}); throw insErr; }
  await supabase.from('active_tickets').update({ kds_sent: true }).eq('id', ticket.id); // best effort
}

// Called after a ticket is charged: closes the linked online order, if any.
export async function completeOnlineOrderForTicket(ticketId, status = 'completed', extra = {}) {
  if (isLocalMode() || ticketId == null) return;
  try {
    await supabase.from('online_orders')
      .update({ status, ...extra, updated_at: new Date().toISOString() })
      .eq('active_ticket_id', ticketId).in('status', ['accepted', 'preparing', 'ready']);
  } catch (err) {
    console.warn('Could not complete online order for ticket', ticketId, err);
  }
}

// Voiding a ticket: cancel its KDS/logistics row (both apps alert on the
// realtime update) and its online order, so the customer's tracker stops
// spinning and shows it as cancelled instead of stuck on "preparing".
export async function cancelTicketEverywhere(ticketId, reason) {
  if (isLocalMode() || ticketId == null) return;
  const open = (q) => q.eq('active_ticket_id', ticketId).not('status', 'in', '(completed,cancelled)');
  const { error } = await open(supabase.from('order_fulfillment')
    .update({ status: 'cancelled', cancel_reason: reason, cancelled_at: new Date().toISOString() }));
  // cancel_reason/cancelled_at come from tinylogistics' schema; installs without it get the status only.
  if (error) await open(supabase.from('order_fulfillment').update({ status: 'cancelled' }))
    .then(({ error: e }) => e && console.warn('Could not cancel fulfillment for ticket', ticketId, e));
  await completeOnlineOrderForTicket(ticketId, 'rejected', { reject_reason: reason });
}
