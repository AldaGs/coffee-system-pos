import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { supabase } from '../supabaseClient';
import { toCents, formatForDisplay } from '../utils/moneyUtils';
import { logActivity } from '../services/activityService';

const LS_EXPENSES_KEY = 'tinypos_expenses';
const LS_QUEUE_KEY = 'tinypos_expense_queue';
const LS_MIGRATED_FLAG = 'tinypos_expenses_dexie_migrated';

// One-shot import of any legacy localStorage expense rows into Dexie. Runs at
// most once per device; the flag prevents re-importing after a user clears the
// Dexie table on purpose.
async function migrateLegacyExpenses() {
  if (localStorage.getItem(LS_MIGRATED_FLAG) === '1') return;
  try {
    const raw = localStorage.getItem(LS_EXPENSES_KEY);
    if (raw) {
      const legacy = JSON.parse(raw);
      if (Array.isArray(legacy) && legacy.length > 0) {
        const normalized = legacy.map(e => ({
          ...e,
          id: typeof e.id === 'string' ? e.id : crypto.randomUUID()
        }));
        await db.expenses.bulkPut(normalized);
      }
      localStorage.removeItem(LS_EXPENSES_KEY);
    }
  } catch (err) {
    console.warn('Expense migration skipped:', err);
  }
  localStorage.setItem(LS_MIGRATED_FLAG, '1');
}

export function useExpenses({ activeCashier, t, showAlert }) {
  // Pending cloud-sync queue — still in localStorage so the existing
  // syncService drain path keeps working. Phase 3.x can promote it to Dexie.
  const [expenseQueue, setExpenseQueue] = useState(() => {
    const saved = localStorage.getItem(LS_QUEUE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(expenseQueue));
  }, [expenseQueue]);

  useEffect(() => { migrateLegacyExpenses(); }, []);

  const expenses = useLiveQuery(() => db.expenses.orderBy('timestamp').toArray(), []) || [];

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ amount: '', reason: '' });

  const handleSaveExpense = async () => {
    if (!expenseForm.amount || !expenseForm.reason) {
      return showAlert(t('expense.errMissing'), t('expense.errDesc'));
    }

    const expenseAmount = toCents(expenseForm.amount);

    const newExpense = {
      id: crypto.randomUUID(),
      amount: expenseAmount,
      reason: expenseForm.reason,
      timestamp: new Date().toISOString(),
      cashierId: activeCashier?.id || 'unknown',
      cashierName: activeCashier?.name || t('expense.unknownCashier')
    };

    const cloudExpense = {
      amount: expenseAmount,
      reason: expenseForm.reason,
      category: expenseForm.category || 'General',
      cashier_name: activeCashier?.name || t('expense.unknownCashierFallback'),
      local_id: newExpense.id
    };

    try {
      if (!navigator.onLine) throw new Error('Device is offline');
      const { error } = await supabase.from('expenses').insert([cloudExpense]);
      if (error) throw error;
    } catch {
      console.warn('Cloud expense failed. Moving to offline queue.');
      setExpenseQueue(prev => [...prev, cloudExpense]);
    }

    await db.expenses.put(newExpense);

    logActivity('expense_added', null, {
      amount: expenseAmount,
      reason: expenseForm.reason,
      category: expenseForm.category || 'General'
    });

    setIsExpenseModalOpen(false);
    setExpenseForm({ amount: '', reason: '', category: 'General' });
    showAlert(
      t('expense.success'),
      `${t('expense.successDesc')} ${formatForDisplay(expenseAmount)}:\n${expenseForm.reason}`
    );
  };

  return {
    expenses,
    expenseQueue,
    setExpenseQueue,
    isExpenseModalOpen,
    setIsExpenseModalOpen,
    expenseForm,
    setExpenseForm,
    handleSaveExpense
  };
}
