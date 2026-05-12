import { supabase } from '../supabaseClient';
import { db } from '../db';

// Tips are a custodial liability, not revenue. Every movement of tipped funds
// must produce a tip_events row so the ledger can reconcile to the balance:
//   balance = SUM(tip_amount - tip_refunded) on sales  -  SUM(amount) on tip_payouts
// Each event has a signed delta_cents that should mirror that arithmetic.

const newLocalId = () => crypto.randomUUID();

const writeEvent = async ({ event_type, delta_cents, sale_local_id = null, payout_local_id = null, reason = null, actor = null }) => {
  const row = {
    event_type,
    delta_cents,
    sale_local_id,
    payout_local_id,
    reason,
    actor,
    local_id: newLocalId(),
    created_at: new Date().toISOString()
  };
  // Local first (always succeeds; survives offline).
  try { await db.tip_events.add(row); } catch (e) { console.warn('tip_events local write failed', e); }
  // Cloud best-effort. Conflict on local_id keeps writes idempotent on retry.
  if (navigator.onLine) {
    try {
      await supabase.from('tip_events').upsert(row, { onConflict: 'local_id' });
    } catch (e) {
      console.warn('tip_events cloud write failed', e);
    }
  }
  return row;
};

export const recordTipAccrual = ({ saleLocalId, tipCents, actor }) => {
  if (!tipCents || tipCents <= 0) return null;
  return writeEvent({
    event_type: 'accrual',
    delta_cents: tipCents,
    sale_local_id: saleLocalId || null,
    reason: 'sale',
    actor: actor || null
  });
};

export const recordTipRefund = ({ saleLocalId, tipRefundedDeltaCents, actor, reason }) => {
  if (!tipRefundedDeltaCents || tipRefundedDeltaCents <= 0) return null;
  return writeEvent({
    event_type: 'refund',
    delta_cents: -tipRefundedDeltaCents,
    sale_local_id: saleLocalId || null,
    reason: reason || 'refund',
    actor: actor || null
  });
};

// Records both the payout row and the matching ledger event.
export const recordTipPayout = async ({ amountCents, method = 'cash', recipient = null, note = null, cashier_name = null }) => {
  if (!amountCents || amountCents <= 0) throw new Error('Payout amount must be > 0');
  const payout = {
    amount: amountCents,
    method,
    recipient,
    note,
    cashier_name,
    local_id: newLocalId(),
    created_at: new Date().toISOString()
  };
  try { await db.tip_payouts.add(payout); } catch (e) { console.warn('tip_payouts local write failed', e); }
  if (navigator.onLine) {
    try {
      await supabase.from('tip_payouts').upsert(payout, { onConflict: 'local_id' });
    } catch (e) {
      console.warn('tip_payouts cloud write failed', e);
    }
  }
  await writeEvent({
    event_type: 'payout',
    delta_cents: -amountCents,
    payout_local_id: payout.local_id,
    reason: note || 'payout',
    actor: cashier_name
  });
  return payout;
};
