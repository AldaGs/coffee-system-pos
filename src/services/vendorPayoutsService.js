import { supabase } from '../supabaseClient';
import { db } from '../db';

// Vendor payout ledger. Records money actually paid to a vendor against a frozen
// settlement statement. Mirrors tipsService: local-first (survives offline), then
// best-effort cloud upsert keyed on local_id so retries stay idempotent.
//
// The vendor balance for a date range is derived, not stored:
//   balance = SUM(settlement payout owed)  -  SUM(vendor_payouts.amount)
// computed in the UI against the live settlement + these rows.

const newLocalId = () => crypto.randomUUID();

// recordVendorPayout({ vendorId, vendorName, periodFrom, periodTo, owedCents,
//                      amountCents, method, note, cashierName, statement })
//   statement : the frozen snapshot paid against — { items, totals, range, menuFallback }.
export async function recordVendorPayout({
  vendorId = null,
  vendorName,
  periodFrom = null,
  periodTo = null,
  owedCents = 0,
  amountCents,
  method = 'cash',
  note = null,
  cashierName = null,
  statement = {},
}) {
  if (typeof amountCents !== 'number' || Number.isNaN(amountCents) || amountCents === 0) {
    throw new Error('Payout amount must be a non-zero number');
  }
  if (!vendorName) throw new Error('Vendor name is required');

  const row = {
    vendor_id: vendorId || null,
    vendor_name: vendorName,
    period_from: periodFrom || null,
    period_to: periodTo || null,
    owed_cents: Math.round(Number(owedCents) || 0),
    amount: Math.round(Number(amountCents) || 0),
    method,
    note,
    cashier_name: cashierName,
    data: statement || {},
    local_id: newLocalId(),
    created_at: new Date().toISOString(),
  };

  // Local first (always succeeds; survives offline).
  try { await db.vendor_payouts.add(row); } catch (e) { console.warn('vendor_payouts local write failed', e); }
  // Cloud best-effort. Conflict on local_id keeps writes idempotent on retry.
  if (navigator.onLine) {
    try {
      await supabase.from('vendor_payouts').upsert(row, { onConflict: 'local_id' });
    } catch (e) {
      console.warn('vendor_payouts cloud write failed', e);
    }
  }
  return row;
}

// Soft-correct a recorded payout by writing a reversing entry rather than
// deleting (keeps the ledger append-only / auditable).
export async function reverseVendorPayout(payout) {
  if (!payout) return null;
  return recordVendorPayout({
    vendorId: payout.vendor_id,
    vendorName: payout.vendor_name,
    periodFrom: payout.period_from,
    periodTo: payout.period_to,
    owedCents: 0,
    amountCents: -Math.round(Number(payout.amount) || 0),
    method: payout.method,
    note: `reversal of ${payout.local_id}`,
    cashierName: payout.cashier_name,
    statement: { reversalOf: payout.local_id },
  });
}
