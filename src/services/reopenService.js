import { supabase } from '../supabaseClient';
import { db } from '../db';
import { isLocalMode } from '../utils/appMode';
import { isCloudReachable } from '../utils/network';
import { buildDeductionPlan } from '../utils/inventoryMath';
import { restoreInventory } from './inventoryService';
import { recordTipRefund } from './tipsService';
import { pushActiveTicketCreate } from './ticketSync';

// A sale can be reopened only while it is untouched since checkout: no refund
// (that path has its own records) and no issued CFDI (the invoice would point
// at a sale that no longer exists).
export const canReopenSale = (sale) =>
  !!sale && sale.status === 'completed' && !(Number(sale.refund_amount) > 0) && sale.cfdi_status !== 'issued';

// Rebuild the open ticket a sale was closed from. Auto-discount fields are
// recomputed by the register, so only the manual discount is carried back.
const ticketFromSale = (sale, id, deviceId) => {
  const { autoRuleName: _a, autoRuleNames: _b, autoBreakdown: _c, autoDiscountAmount: _d, manualDiscountAmount: _e, ...manual } = sale.discount || {};
  const ticket = {
    id,
    name: sale.order_name || `#${String(sale.ticket_id || sale.id).slice(-6)}`,
    items: (sale.items || []).map(({ price: _p, ...item }) => ({ ...item, uniqueId: item.uniqueId || crypto.randomUUID() })),
    cashier_id: null,
    last_modified_by: deviceId || null,
    created_at: new Date().toISOString(),
  };
  if (manual.type && Number(manual.value) > 0) ticket.discount = { type: manual.type, value: manual.value };
  if (sale.loyalty_phone) ticket.loyalty_phone = sale.loyalty_phone;
  if (Number(sale.loyalty_stars_redeemed) > 0) ticket.loyalty_stars_pending = Number(sale.loyalty_stars_redeemed);
  return ticket;
};

// Undo the loyalty movement the sale made (trg_award_loyalty in the cloud, the
// Dexie mirror in local mode), so checking the ticket out again doesn't count
// the visit twice. Redeemed stars go back to the customer.
async function reverseLoyalty(sale) {
  const phone = sale.loyalty_phone;
  const delta = (Number(sale.loyalty_stars_redeemed) || 0) - (Number(sale.loyalty_stars_awarded) || 0);
  if (!phone || delta === 0) return;
  if (isLocalMode()) {
    const existing = await db.customers.get(phone);
    if (existing) await db.customers.update(phone, { visits: Math.max(0, (existing.visits || 0) + delta) });
    return;
  }
  // Reuses the queued loyalty_increment path so it replays when offline.
  await db.updateQueue.add({ type: 'loyalty_increment', local_id: null, data: { phone, increment: delta } });
}

// Remove the sale row everywhere. A sale still waiting in syncQueue never
// reached the cloud, so dropping it from the queue is enough.
async function deleteSale(sale) {
  await db.sales.delete(sale.id);
  if (sale.local_id) {
    const queued = await db.syncQueue.filter(s => s.local_id === sale.local_id).primaryKeys();
    if (queued.length) { await db.syncQueue.bulkDelete(queued); return; }
  }
  if (isLocalMode()) return;
  const entry = { type: 'sale_delete', local_id: sale.local_id || null, cloud_id: sale.local_id ? null : sale.id, data: null };
  if (isCloudReachable()) {
    const query = sale.local_id
      ? supabase.from('sales').delete().eq('local_id', sale.local_id)
      : supabase.from('sales').delete().eq('id', sale.id);
    const { error } = await query;
    if (!error) return;
    console.warn('sale delete deferred:', error.message);
  }
  await db.updateQueue.add(entry);
}

// Reopen a closed sale as an active ticket — for a ticket closed by mistake,
// not a refund. The sale is removed (so revenue isn't counted twice when the
// ticket is checked out again), its stock, tip and loyalty effects are undone,
// and the ticket goes back to the register with its items.
export async function reopenSale({ sale, recipes, deviceId }) {
  if (!canReopenSale(sale)) throw new Error('This sale cannot be reopened');

  // Keep the original ticket id when it's free so the KDS/online-order links
  // still match; otherwise mint a new one.
  const originalId = Number(sale.ticket_id);
  const idTaken = !Number.isFinite(originalId) || !!(await db.active_tickets.get(originalId));
  const ticket = ticketFromSale(sale, idTaken ? Date.now() : originalId, deviceId);

  await deleteSale(sale);
  await db.active_tickets.add(ticket);
  pushActiveTicketCreate(ticket);

  // The side effects below are best-effort: the ticket is already back, and a
  // failure here is reported, not allowed to strand it.
  const warnings = [];
  try {
    const inventory = await db.inventory.toArray();
    const { deductions } = buildDeductionPlan({ items: sale.items || [], recipes, inventory });
    const { failed } = await restoreInventory({
      movements: deductions.map(d => ({ id: d.id, name: d.name, qty: d.qty })),
      deductionType: 'reopen_return',
      ticketId: sale.ticket_id || null,
    });
    if (failed.length) warnings.push(`stock: ${failed.map(f => f.name).join(', ')}`);
  } catch (e) { warnings.push(`stock: ${e?.message}`); }

  const tip = (Number(sale.tip_amount) || 0) - (Number(sale.tip_refunded) || 0);
  if (tip > 0) {
    try { await recordTipRefund({ saleLocalId: sale.local_id || null, tipRefundedDeltaCents: tip, actor: sale.cashier_name || null, reason: 'reopen' }); }
    catch (e) { warnings.push(`tip: ${e?.message}`); }
  }

  try { await reverseLoyalty(sale); } catch (e) { warnings.push(`loyalty: ${e?.message}`); }

  return { ticket, warnings };
}
