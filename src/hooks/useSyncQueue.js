import { useEffect, useRef } from 'react';
import { attemptBackgroundSync } from '../services/syncService';
import { startConnectivityHeartbeat } from '../utils/network';
import { supabase, probeCloud } from '../supabaseClient';
import { isLocalMode } from '../utils/appMode';

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

    // Proactively probe for recovery while the breaker is open, so a degraded
    // link heals without a user action paying the probe tax. Skipped in local
    // ('guest') mode — there's no cloud to probe, and a failing probe there would
    // otherwise trip the breaker against a store that lives entirely in Dexie.
    const stopHeartbeat = (isLocalMode() || !supabase)
      ? null
      : startConnectivityHeartbeat(probeCloud);

    return () => {
      window.removeEventListener('online', runSync);
      clearInterval(id);
      if (stopHeartbeat) stopHeartbeat();
    };
  }, [intervalMs]);
}
