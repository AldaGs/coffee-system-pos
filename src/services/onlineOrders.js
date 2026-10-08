import { supabase } from '../supabaseClient';
import { db } from '../db';
import { isLocalMode } from '../utils/appMode';
import { pushActiveTicketCreate, pushActiveTicketUpdate, pushActiveTicketDeletion } from './ticketSync';
import { cleanPhone } from '../utils/customerCapture';

// Staff-side transitions for online_orders (see docs/online-ordering.md).
// quote_pending -> requested (once shipping is agreed) -> accepted | rejected -> preparing -> ready -> completed.

// Spanish labels: they land on the ticket name and the courier's notes.
export const PAY_LABEL = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', clip: 'Clip (pendiente)' };
// Clip orders are paid before the kitchen starts. active_tickets.online_paid
// (schema 3.8) is the paid state; the name still gets "PAGADO (Clip)" so the
// KDS and the courier see it, but renaming the ticket no longer unprotects it.
// The name check keeps tickets paid before 3.8 working.
export const CLIP_PAID_MARK = 'PAGADO (Clip)';
export const isPaidOnline = (ticket) => !!ticket?.online_paid || !!ticket?.name?.includes(CLIP_PAID_MARK);
const peso = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

export const ONLINE_STATUS_RANK = { requested: 0, accepted: 1, preparing: 2, ready: 3, completed: 4 };

export const setOnlineOrderStatus = (id, status, extra = {}) =>
  supabase.from('online_orders')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id);

export const rejectOnlineOrder = (id, reason) =>
  setOnlineOrderStatus(id, 'rejected', { reject_reason: reason || null });

// The RPC records the agreement and updates an existing cloud ticket in one
// transaction. The local register cache is then refreshed for this station.
export async function confirmShippingQuote(orderId, feeCents) {
  const { data, error } = await supabase.rpc('set_shipping_quote', {
    p_order_id: orderId, p_fee_cents: feeCents, p_confirmed: true,
  });
  if (error) throw error;
  if (data?.ticket_id != null && data.ticket_items) {
    await db.active_tickets.update(data.ticket_id, { items: data.ticket_items });
  }
  return data;
}

// Accept: atomically claim the order (so two stations can't both accept it),
// then open a real active ticket from the server-priced snapshot and link it.
// Returns the new ticket id, or null if another station got there first.
export async function acceptOnlineOrder(order, { activeCashier, myDeviceId, menuData, orderNum, feeLabel = 'Envío', clipPayMinutes = 15 }) {
  const clip = order.payment_method === 'clip';
  const { data: claimed, error } = await supabase.from('online_orders')
    .update({ status: 'accepted', order_num: orderNum, updated_at: new Date().toISOString(),
      ...(clip ? { pay_by: new Date(Date.now() + clipPayMinutes * 60000).toISOString() } : {}) })
    .eq('id', order.id).eq('status', 'requested').select('*');
  if (error) throw error;
  if (!claimed?.length) return null;
  // Use the claimed row: another station may have revised the shipping quote
  // since this inbox last rendered it.
  order = claimed[0];

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
    items.push({ id: order.order_type === 'shipping' ? 'online-shipping-fee' : 'online-delivery-fee', name: feeLabel, basePrice: order.delivery_fee_cents, qty: 1, uniqueId: crypto.randomUUID(), selectedModifiers: [] });
  }

  const prefix = (myDeviceId || 'ONL').substring(0, 3).toUpperCase();
  const note = order.notes ? ` - ${order.notes.slice(0, 40)}` : '';
  const ticket = {
    id: Date.now(),
    name: `${prefix} - ${order.customer_name} (#${orderNum}) (Online)${note}${order.payment_method ? ` · ${PAY_LABEL[order.payment_method]}${order.cash_amount_cents != null ? ` ${peso(order.cash_amount_cents)}` : ''}` : ''}`,
    items,
    cashier_id: activeCashier?.id,
    last_modified_by: myDeviceId,
    created_at: new Date().toISOString(),
    // ponytail: pre-flagged so KDS immediate mode can't insert a 2nd row while
    // the logistics insert below is in flight; sendOrderToLogistics rolls it back on failure.
    // Clip: held out of the kitchen (and logistics) until paid; releaseClipOrder sends it.
    ...(order.order_type === 'delivery' || clip ? { kds_sent: true } : {}),
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
  // Delivery: hand it to tinylogistics now, so the courier sees it before payment (pay on delivery).
  if (order.order_type === 'delivery' && !clip) {
    await sendOrderToLogistics({ ...order, active_ticket_id: ticket.id }, ticket)
      .catch((e) => console.warn('Could not hand delivery order to logistics', e));
  }
  return ticket.id;
}

// Hand a delivery order to tinylogistics through the shared order_fulfillment
// row. Updates the row if the ticket already went to the KDS, else inserts it
// (same shape as Register's handleSendToKds) and marks the ticket kds_sent so
// KDS immediate mode doesn't add a second one.
export async function sendOrderToLogistics(order, ticket) {
  const patch = {
    delivery_address: order.delivery_address,
    delivery_lat: order.delivery_lat ?? null,
    delivery_lng: order.delivery_lng ?? null,
    delivery_date: order.pickup_at ?? null, // scheduled time; null = ASAP
    delivery_notes: [order.notes, `Tel: ${String(order.phone).length > 10 ? '+' : ''}${order.phone}`, order.payment_method && `Pago: ${order.payment_status === 'paid' ? CLIP_PAID_MARK : PAY_LABEL[order.payment_method]}${order.cash_amount_cents != null ? `, paga con ${peso(order.cash_amount_cents)}, cambio ${peso(order.cash_amount_cents - order.total_cents)}` : ''}`].filter(Boolean).join(' · '),
  };
  const { data: updated, error } = await supabase.from('order_fulfillment')
    .update(patch).eq('active_ticket_id', order.active_ticket_id).select('id');
  if (error) throw error;
  if (updated?.length) return;
  if (!ticket) throw new Error('ticket_missing');
  await db.active_tickets.update(ticket.id, { kds_sent: true });
  const { error: insErr } = await supabase.from('order_fulfillment').insert({
    active_ticket_id: ticket.id, customer_name: order.customer_name, items: ticket.items,
    payment_status: order.payment_status === 'paid' ? 'paid' : 'unpaid', status: 'received', ...patch,
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

// Clip paid: mark the ticket and let it go to the kitchen. Delivery goes to
// logistics now; pickup just drops the hold so KDS immediate mode (or the
// manual button) sends it. Idempotent through online_paid.
export async function releaseClipOrder(order, ticket) {
  if (isPaidOnline(ticket)) return;
  const name = ticket.name.includes(PAY_LABEL.clip) ? ticket.name.replace(PAY_LABEL.clip, CLIP_PAID_MARK) : `${ticket.name} · ${CLIP_PAID_MARK}`;
  const delivery = order.order_type === 'delivery';
  const patch = delivery ? { name, online_paid: true } : { name, online_paid: true, kds_sent: false };
  await db.active_tickets.update(ticket.id, patch);
  pushActiveTicketUpdate(ticket.id, patch);
  if (delivery) await sendOrderToLogistics(order, { ...ticket, name });
}

// Unpaid past its window: reject the order only if still unpaid (a payment
// landing at the same moment wins), then drop the ticket everywhere.
export async function expireClipOrder(order, reason) {
  const { data } = await supabase.from('online_orders')
    .update({ status: 'rejected', reject_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', order.id).eq('payment_status', 'unpaid').in('status', ['accepted', 'preparing', 'ready']).select('id');
  if (!data?.length) return false;
  if (order.active_ticket_id != null) {
    await cancelTicketEverywhere(order.active_ticket_id, reason);
    await db.active_tickets.delete(order.active_ticket_id).catch(() => {});
    await pushActiveTicketDeletion(order.active_ticket_id);
  }
  return true; // this station won the expiry (others get false)
}

// Full Clip refund for the online order behind a ticket (clip-refund edge
// function; staff session required). Resolves to { ok } or { ok: false, message }.
const CLIP_REFUND_ERRORS = {
  AI1804: 'El pago está en disputa: Clip no permite reembolsarlo.',
  AI1806: 'Los pagos a meses (MSI/MCI) no se pueden reembolsar desde aquí.',
};
export async function refundClipTicket(ticketId, reason) {
  const { data, error } = await supabase.functions.invoke('clip-refund', { body: { ticket_id: Number(ticketId), reason } });
  if (!error && data?.ok) return { ok: true };
  let body = data;
  try { body = body || await error?.context?.json(); } catch { /* not json */ }
  const msg = CLIP_REFUND_ERRORS[body?.code]
    || (body?.error === 'not_paid' ? 'No se encontró un pago con Clip para este pedido.'
      : body?.error === 'clip_refused' ? `Clip rechazó el reembolso${body.message ? `: ${body.message}` : ''}. Si es por saldo insuficiente, intenta mañana o reembolsa desde el panel de Clip.`
        : 'No se pudo hacer el reembolso con Clip. Intenta de nuevo o hazlo desde el panel de Clip.');
  return { ok: false, message: msg };
}

// Fully refunding a completed sale reopens nothing, but the customer's tracker
// should stop saying "completed": mark the linked online order rejected.
export async function rejectOnlineOrderForRefund(ticketId, reason) {
  if (isLocalMode() || ticketId == null) return;
  try {
    await supabase.from('online_orders')
      .update({ status: 'rejected', reject_reason: reason, updated_at: new Date().toISOString() })
      .eq('active_ticket_id', ticketId).eq('status', 'completed');
  } catch (err) {
    console.warn('Could not reject online order for refunded ticket', ticketId, err);
  }
}
