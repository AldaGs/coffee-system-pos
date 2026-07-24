// src/utils/realtime.js

import { supabase } from '../supabaseClient';
import { isCloudReachable } from './network';

/**
 * Create a Supabase Realtime channel with automatic reconnection AND a
 * degraded-mode polling fallback.
 *
 * On a healthy link this subscribes once and streams per-row postgres_changes to
 * `handler`. On a flaky link the socket fires CHANNEL_ERROR/CLOSED repeatedly;
 * the reconnect loop rebuilds it on a growing back-off, keeping a single owning
 * scope (exactly one live channel and one pending timer at a time). (An earlier
 * version recursed into createRealtimeChannel on every error, leaking an unbounded
 * tree of channels/timers until the renderer was OOM-killed — the "Aw, Snap!"
 * crash on slow links.)
 *
 * But endlessly rebuilding a websocket that can't stay up is its own problem on a
 * bad in-store link: every failed handshake burns battery/CPU and the app still
 * shows stale data between attempts. So after `failuresBeforePolling` consecutive
 * failures, if a `poll` function was supplied, we STOP the handshake churn and
 * fall back to calling `poll()` (a full resync) on an interval — a gentler way to
 * stay fresh on a degraded link. While polling we still try to re-establish the
 * socket in the background; the moment it subscribes we cancel polling, run one
 * catch-up poll, and resume streaming.
 *
 * @param {string} name - Unique channel name.
 * @param {object} filter - Postgres change filter (event, schema, table).
 * @param {function} handler - Callback invoked with payload for each change.
 * @param {object} [opts]
 * @param {() => Promise<void>} [opts.poll] - Full-resync fallback for degraded
 *        mode. When omitted, behavior is pure reconnect-with-back-off as before.
 * @param {number} [opts.pollIntervalMs=15000] - Poll cadence while degraded.
 * @param {number} [opts.failuresBeforePolling=4] - Consecutive socket failures
 *        before switching from reconnect churn to polling.
 * @returns {{cleanup: function}} A cleanup function that stops all reconnects,
 *          polling, and the socket.
 */
export function createRealtimeChannel(name, filter, handler, opts = {}) {
  const { poll, pollIntervalMs = 15000, failuresBeforePolling = 4 } = opts;

  let channel = null;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let isClosed = false;

  // Degraded-mode state.
  let failures = 0;         // consecutive socket failures since the last SUBSCRIBED
  let pollTimer = null;
  let polling = false;

  const backoff = (attempt) => {
    // Exponential back-off with a max cap of 30 seconds.
    return Math.min(1000 * 2 ** attempt, 30000);
  };

  const teardownChannel = () => {
    if (channel) {
      const old = channel;
      channel = null;
      supabase.removeChannel(old);
    }
  };

  const scheduleReconnect = () => {
    if (isClosed || reconnectTimer || polling) return;
    const delay = backoff(reconnectAttempt);
    console.warn(`Channel ${name} down. Reconnecting in ${delay}ms (attempt ${reconnectAttempt + 1})`);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  // --- Degraded polling fallback ------------------------------------------
  const stopPolling = () => {
    polling = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const pollTick = async () => {
    if (isClosed || !polling) return;

    // Only spend network when the link is plausibly up; the breaker short-circuits
    // a known-down link so we don't churn doomed fetches/handshakes.
    if (isCloudReachable()) {
      try { await poll(); } catch (e) { console.warn(`Poll for ${name} failed:`, e?.message); }
      if (isClosed || !polling) return;
      // Try to climb back onto the socket. If it subscribes, the status handler
      // cancels polling and resumes streaming; if it fails again we stay polling.
      connect();
    }

    if (isClosed || !polling) return;
    pollTimer = setTimeout(pollTick, pollIntervalMs);
  };

  const enterDegraded = () => {
    if (isClosed || polling) return;
    console.warn(`Channel ${name}: too many socket failures, falling back to polling every ${pollIntervalMs}ms.`);
    teardownChannel();
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    polling = true;
    pollTick(); // refresh immediately on entering degraded mode
  };

  const connect = () => {
    if (isClosed) return;

    // Don't even try to open a socket over a link already known to be down
    // (airplane mode, or a stalled/half-open link that tripped the breaker).
    // Attempting it just churns failed handshakes; back off and try later.
    if (!isCloudReachable()) {
      teardownChannel();
      if (!polling) scheduleReconnect();
      return;
    }

    // Drop any previous channel before opening a new one, so only one socket
    // subscription is ever live at a time.
    teardownChannel();

    channel = supabase.channel(name);
    channel.on('postgres_changes', filter, async (payload) => {
      try {
        await handler(payload);
      } catch (e) {
        console.error(`Realtime handler error on channel ${name}:`, e);
      }
    });

    channel.subscribe((status, err) => {
      if (err) {
        console.error(`Realtime error on ${name}:`, err);
      }
      console.log(`Realtime status on ${name}:`, status);

      if (status === 'SUBSCRIBED') {
        // Healthy again: reset the back-off so the next outage starts fast.
        reconnectAttempt = 0;
        failures = 0;
        if (polling) {
          // We climbed back onto the socket from degraded mode: stop polling and
          // do one catch-up resync so we don't miss changes from the gap.
          stopPolling();
          if (poll) Promise.resolve(poll()).catch(() => {});
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        failures += 1;
        if (poll && failures >= failuresBeforePolling) {
          // The socket won't stay up. Stop the handshake churn and poll instead.
          enterDegraded();
        } else {
          scheduleReconnect();
        }
      }
    });
  };

  connect();

  const cleanup = () => {
    isClosed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stopPolling();
    teardownChannel();
  };

  return { cleanup };
}
