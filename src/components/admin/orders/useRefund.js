import { useState } from 'react';
import { db } from '../../../db';
import { toCents } from '../../../utils/moneyUtils';
import { recordTipRefund } from '../../../services/tipsService';
import { logActivity } from '../../../services/activityService';
import { isCloudReachable } from '../../../utils/network';
import { buildDeductionPlan } from '../../../utils/inventoryMath';
import { restoreInventory } from '../../../services/inventoryService';
import { rejectOnlineOrderForRefund, refundClipTicket } from '../../../services/onlineOrders';
import { consumePendingAuthorizer } from '../../../utils/overrideAuthorizer';
import { defaultRestock, planRefund, restockCandidates } from './refundMath';
import { queueSaleUpdate, saveSaleUpdate, ticketLabel } from './saleUpdate';

const CLOSED = { isOpen: false, order: null };

// The refund modal: amount (all / custom / per item), tip policy, and which lines go back into stock.
export function useRefund({ recipes, showAlert, t }) {
  const [refundModal, setRefundModal] = useState(CLOSED);
  const [refundMode, setRefundMode] = useState('all'); // 'all' | 'custom' | 'items'
  const [refundAmount, setRefundAmount] = useState('');
  const [refundItems, setRefundItems] = useState({});
  // Full refunds default to 'full' (no service was rendered).
  const [tipRefundMode, setTipRefundMode] = useState('full');
  // Which refunded lines go back INTO stock. A sealed product handed back over
  // the counter — a bottle of water, a soda can, a bag of beans, merch — is
  // resellable and should return to inventory. A prepared drink or plate is not:
  // the milk and the shot are gone whether or not the customer paid. Only the
  // operator knows which case it is, so they pick per line. Keyed by line index.
  const [restockItems, setRestockItems] = useState({});

  const openRefund = (order) => {
    setRefundMode('all');
    setRefundAmount('');
    setRefundItems({});
    setTipRefundMode('full');
    // Pre-tick the resellable lines (sealed products), leave made-to-order lines unticked.
    setRestockItems(Object.fromEntries((order.items || []).map((line, idx) => [idx, defaultRestock(line)])));
    setRefundModal({ isOpen: true, order });
  };
  const closeRefund = () => { setRefundModal(CLOSED); setRestockItems({}); };

  // Turn the ticked lines into concrete stock movements, reusing the very same
  // resolver checkout deducts with — so a refund puts back exactly what the sale
  // took out, modifiers and recipe ingredients included.
  const buildRestockMovements = async (order) => {
    const picked = restockCandidates(order, refundMode, refundItems).filter(e => restockItems[e.idx]);
    if (picked.length === 0) return [];
    const inventory = await db.inventory.toArray();
    const { deductions } = buildDeductionPlan({ items: picked.map(e => ({ ...e.line, qty: e.qty })), recipes, inventory });
    return deductions.map(d => ({ id: d.id, name: d.name, qty: d.qty }));
  };

  const logRefund = (order, plan, extra) => logActivity('refund_issued', null, {
    full: plan.status === 'refunded',
    refund_amount: plan.amount,
    tip_refunded: plan.tipRefundDelta,
    new_status: plan.status,
    ticket_id: order.ticket_id || null,
    ticket_label: ticketLabel(order),
    sale_local_id: order.local_id || null,
    original_total: order.total_amount,
    original_cashier: order.cashier_name || null,
    ...extra,
  }, consumePendingAuthorizer());

  const handleProcessRefund = async () => {
    const { order } = refundModal;
    if (!order) return;
    const plan = planRefund({ order, mode: refundMode, refundItems, customCents: toCents(refundAmount), tipRefundMode });
    if (plan.error) return showAlert(t('common.error'), t(plan.error));

    // Clip sales: the money goes back through Clip first (full refunds only, Clip's
    // beta API requires the original amount). Nothing is recorded if Clip refuses.
    if (order.payment_method === 'Clip') {
      if (plan.status !== 'refunded' || plan.prevRefund > 0) return showAlert(t('common.error'), t('oo.clipFullOnly'));
      const r = await refundClipTicket(order.ticket_id, t('oo.refundedReason'));
      if (!r.ok) return showAlert(t('common.error'), r.message);
    }

    try {
      await saveSaleUpdate(order, plan.update);
      if (plan.tipRefundDelta > 0) {
        await recordTipRefund({
          saleLocalId: order.local_id || null,
          tipRefundedDeltaCents: plan.tipRefundDelta,
          actor: order.cashier_name || null,
          reason: plan.status === 'refunded' ? 'full_refund' : 'partial_refund'
        });
      }
      if (plan.status === 'refunded') rejectOnlineOrderForRefund(order.ticket_id, t('oo.refundedReason'));
      logRefund(order, plan);

      // Stock return (only the ticked lines) runs after the refund is recorded:
      // a stock failure must never leave the customer un-refunded. restoreInventory
      // is idempotent per movement, writes its own 'refund_return' inventory_logs
      // rows, and queues the cloud half when offline, exactly like a sale deduction.
      let restockMsg = '';
      try {
        const movements = await buildRestockMovements(order);
        if (movements.length > 0) {
          const { restored, failed } = await restoreInventory({ movements, deductionType: 'refund_return', ticketId: order.ticket_id || null });
          if (restored.length > 0) restockMsg = `\n${t('orders.restockDone')}: ${restored.map(r => `${r.name} (+${r.qty})`).join(', ')}`;
          if (failed.length > 0) restockMsg += `\n${t('orders.restockFailed')}: ${failed.map(f => f.name).join(', ')}`;
        }
      } catch (e) {
        console.error('Refund stock return failed:', e);
        restockMsg = `\n${t('orders.restockFailed')}`;
      }

      closeRefund();
      showAlert(t('toast.success'), `${t('orders.refundDone')}${restockMsg}`);
    } catch (err) {
      if (!isCloudReachable()) {
        // The cloud write timed out or the breaker tripped mid-write on a
        // slow/half-open link: queue the update instead of surfacing a hard error.
        await queueSaleUpdate(order, plan.update);
        logRefund(order, plan, { offline: true });
        setRefundModal(CLOSED);
        return showAlert(t('toast.success'), t('toast.success') + " (Offline)");
      }
      showAlert(t('common.error'), err.message);
    }
  };

  return {
    refundModal, openRefund, closeRefund, refundMode, setRefundMode, refundAmount, setRefundAmount,
    refundItems, setRefundItems, tipRefundMode, setTipRefundMode, restockItems, setRestockItems, handleProcessRefund,
  };
}
