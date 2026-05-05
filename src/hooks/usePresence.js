import { useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Hook to manage multi-device presence and force-kick lockout.
 * Issue 3.7 & 11: Await presence calls and handle SUBSCRIBED branch correctly.
 */
export const usePresence = (myDeviceId, showAlert) => {
  const { activeCashier, isLocked, logout } = useAuthStore();
  const activeCashierRef = useRef(activeCashier);

  useEffect(() => {
    activeCashierRef.current = activeCashier;
  }, [activeCashier]);

  useEffect(() => {
    if (!supabase || !navigator.onLine || !activeCashier?.id || isLocked) return;

    const channel = supabase.channel('cashier-presence', {
      config: {
        presence: { key: myDeviceId },
        broadcast: { ack: true }
      },
    });

    const executeLockout = (reason) => {
      console.warn(`🔒 ${reason}`);
      logout();
      showAlert("Access Revoked", reason);
    };

    channel
      .on('broadcast', { event: 'force-kick' }, (payload) => {
        const { incomingCashierId, incomingDeviceId } = payload.payload;
        if (incomingCashierId === activeCashierRef.current?.id && incomingDeviceId !== myDeviceId) {
          executeLockout("Session terminated by a new login on another device.");
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            // 1. SHOOT FIRST: Fire the kick command and await it
            await channel.send({
              type: 'broadcast',
              event: 'force-kick',
              payload: {
                incomingCashierId: activeCashierRef.current.id,
                incomingDeviceId: myDeviceId
              }
            });

            // 2. TRACK LATER: Let presence sync
            await channel.track({
              cashierId: activeCashierRef.current.id,
              deviceId: myDeviceId
            });
          } catch (err) {
            console.error("Presence sync failed:", err);
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCashier?.id, isLocked, myDeviceId, logout, showAlert]);
};
