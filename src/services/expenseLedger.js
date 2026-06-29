import { supabase } from '../supabaseClient';
import { db } from '../db';
import { isLocalMode } from '../utils/appMode';

// Minimal programmatic expense writer, factored out of useExpenses so other
// flows (e.g. vendor payouts) can post a cash-out that shows up in Analytics'
// expenses-by-category and the drawer reconciliation. Same row shapes as the
// hook: a local Dexie row + a cloud row keyed on local_id for idempotency.
//
// amountCents may be negative — used to post an offsetting entry when a linked
// action (like a vendor payout) is reversed, so the books net back to zero.
export async function writeExpense({ amountCents, reason, category = 'General', cashierName = null, cashierId = 'system', localId = null }) {
  if (typeof amountCents !== 'number' || Number.isNaN(amountCents) || amountCents === 0) {
    throw new Error('Expense amount must be a non-zero number');
  }
  const local_id = localId || crypto.randomUUID();

  const localRow = {
    id: local_id,
    amount: Math.round(amountCents),
    reason,
    timestamp: new Date().toISOString(),
    cashierId,
    cashierName: cashierName || 'system',
  };
  try { await db.expenses.put(localRow); } catch (e) { console.warn('expense local write failed', e); }

  if (!isLocalMode() && navigator.onLine) {
    try {
      await supabase.from('expenses').upsert(
        { amount: Math.round(amountCents), reason, category, cashier_name: cashierName || 'system', local_id },
        { onConflict: 'local_id' }
      );
    } catch (e) {
      console.warn('expense cloud write failed', e);
    }
  }
  return local_id;
}
