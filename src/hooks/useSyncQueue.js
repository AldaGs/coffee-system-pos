import { useEffect, useRef } from 'react';
import { attemptBackgroundSync } from '../services/syncService';

// Mount-once background sync. The interval and 'online' listener are installed
// exactly once for the lifetime of the host component; the latest values for
// the expense queue / callbacks are read through refs, so queue mutations
// don't tear down and rebuild the timer (which was happening every 60s on a
// busy shift before this hook).
export function useSyncQueue({ expenseQueue, clearExpenseQueue, onAuthError, intervalMs = 60000 } = {}) {
  const queueRef = useRef(expenseQueue);
  const clearRef = useRef(clearExpenseQueue);
  const onAuthErrorRef = useRef(onAuthError);

  useEffect(() => { queueRef.current = expenseQueue; }, [expenseQueue]);
  useEffect(() => { clearRef.current = clearExpenseQueue; }, [clearExpenseQueue]);
  useEffect(() => { onAuthErrorRef.current = onAuthError; }, [onAuthError]);

  useEffect(() => {
    const runSync = async () => {
      const authError = await attemptBackgroundSync(queueRef.current, () => clearRef.current?.());
      if (authError) {
        console.warn('Auth error detected during sync background task.');
        onAuthErrorRef.current?.();
      }
    };

    window.addEventListener('online', runSync);
    const id = setInterval(runSync, intervalMs);
    runSync();

    return () => {
      window.removeEventListener('online', runSync);
      clearInterval(id);
    };
  }, [intervalMs]);
}
