// src/utils/realtime.js

import { supabase } from '../supabaseClient';

/**
 * Create a Supabase Realtime channel with automatic reconnection.
 *
 * @param {string} name - Unique channel name.
 * @param {object} filter - Postgres change filter (event, schema, table).
 * @param {function} handler - Callback invoked with payload for each change.
 * @returns {{channel: any, cleanup: function}} The channel instance and a cleanup function.
 */
export function createRealtimeChannel(name, filter, handler) {
  // Initial channel creation
  const channel = supabase.channel(name);

  // Attach the change handler
  channel.on('postgres_changes', filter, async (payload) => {
    try {
      await handler(payload);
    } catch (e) {
      console.error(`Realtime handler error on channel ${name}:`, e);
    }
  });

  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let isClosed = false;

  const backoff = (attempt) => {
    // Exponential back‑off with a max cap of 30 seconds
    return Math.min(1000 * 2 ** attempt, 30000);
  };

  const subscribe = () => {
    if (isClosed) return;
    channel.subscribe((status, err) => {
      if (err) {
        console.error(`Realtime error on ${name}:`, err);
      }
      console.log(`Realtime status on ${name}:`, status);

      if (status === 'SUBSCRIBED') {
        // Reset attempt counter on successful subscribe
        reconnectAttempt = 0;
      } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        // Attempt reconnection indefinitely
        const delay = backoff(reconnectAttempt);
        console.warn(`Channel ${name} ${status}. Reconnecting in ${delay}ms (attempt ${reconnectAttempt + 1})`);
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(() => {
          // Remove the old channel instance and create a fresh one
          supabase.removeChannel(channel);
          // Re‑create and re‑attach listeners
          const newChannel = createRealtimeChannel(name, filter, handler);
          // Replace the reference for cleanup callers
          cleanup.channel = newChannel.channel;
        }, delay);
      }
    });
  };

  // Initial subscription
  subscribe();

  const cleanup = () => {
    isClosed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    supabase.removeChannel(channel);
  };

  return { channel, cleanup };
}
