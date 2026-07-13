// src/utils/realtime.js

import { supabase } from '../supabaseClient';
import { isCloudReachable } from './network';

/**
 * Create a Supabase Realtime channel with automatic reconnection.
 *
 * On a flaky connection the socket fires CHANNEL_ERROR/CLOSED repeatedly. The
 * reconnect loop below tears down the *current* channel and builds a fresh one
 * on a growing back-off, but it keeps a single owning scope: there is exactly
 * one live channel and one pending timer at a time, and the returned cleanup()
 * stops the loop for good. (An earlier version recursed into
 * createRealtimeChannel on every error, which spawned an unbounded tree of
 * orphaned channels/timers/handlers that leaked memory until the renderer was
 * OOM-killed — the "Aw, Snap!" crash on slow links.)
 *
 * @param {string} name - Unique channel name.
 * @param {object} filter - Postgres change filter (event, schema, table).
 * @param {function} handler - Callback invoked with payload for each change.
 * @returns {{cleanup: function}} A cleanup function that stops all reconnects.
 */
export function createRealtimeChannel(name, filter, handler) {
  let channel = null;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let isClosed = false;

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
    if (isClosed || reconnectTimer) return;
    const delay = backoff(reconnectAttempt);
    console.warn(`Channel ${name} down. Reconnecting in ${delay}ms (attempt ${reconnectAttempt + 1})`);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (isClosed) return;

    // Don't even try to open a socket over a link already known to be down
    // (airplane mode, or a stalled/half-open link that tripped the breaker).
    // Attempting it just churns failed handshakes; back off and try later.
    if (!isCloudReachable()) {
      teardownChannel();
      scheduleReconnect();
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
      } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        scheduleReconnect();
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
    teardownChannel();
  };

  return { cleanup };
}
