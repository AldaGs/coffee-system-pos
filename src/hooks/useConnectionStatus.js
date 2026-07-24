import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { isCloudReachable } from '../utils/network';

// Reactive connectivity summary for the cashier-facing status pill.
//
// Three moving parts feed it, and only one is natively reactive:
//   - Dexie queues (sales / inventory logs / update queue) via useLiveQuery.
//   - navigator online/offline via window events.
//   - the circuit breaker (isCloudReachable) and the localStorage queues
//     (expenses / WhatsApp), neither of which emits an event — so we poll them on
//     a light timer, plus the 'storage' event for cross-tab drains.

const LS_EXPENSE_QUEUE = 'tinypos_expense_queue';
const LS_WA_QUEUE = 'tinypos_wa_queue';

function lsCount(key) {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

// Pure state machine for the pill, split out so it can be unit-tested without
// rendering the hook.
//   offline  : the OS reports no network at all.
//   degraded : online per the OS, but the breaker is open — a slow/half-open link
//              routing writes to the local queue.
//   syncing  : link is good and there's a backlog draining.
//   online   : link is good and nothing is queued.
export function deriveConnectionState({ online, reachable, pending }) {
  if (!online) return 'offline';
  if (!reachable) return 'degraded';
  return pending > 0 ? 'syncing' : 'online';
}

export function useConnectionStatus({ pollMs = 3000 } = {}) {
  const salesCount = useLiveQuery(() => db.syncQueue.count(), [], 0);
  const invCount = useLiveQuery(() => db.inventory_logs.count(), [], 0);
  const updCount = useLiveQuery(() => db.updateQueue.count(), [], 0);

  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [reachable, setReachable] = useState(isCloudReachable());
  const [lsPending, setLsPending] = useState(() => lsCount(LS_EXPENSE_QUEUE) + lsCount(LS_WA_QUEUE));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const poll = () => {
      setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
      setReachable(isCloudReachable());
      setLsPending(lsCount(LS_EXPENSE_QUEUE) + lsCount(LS_WA_QUEUE));
    };

    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('storage', poll);
    poll();
    const id = setInterval(poll, pollMs);

    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('storage', poll);
      clearInterval(id);
    };
  }, [pollMs]);

  const pending = (salesCount || 0) + (invCount || 0) + (updCount || 0) + lsPending;
  const state = deriveConnectionState({ online, reachable, pending });

  return { online, reachable, pending, state };
}
