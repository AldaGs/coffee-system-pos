import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useMenuStore } from '../store/useMenuStore';
import { useCartStore } from '../store/useCartStore';
import { useFlash } from './useFlash';

// Cashier login on the lock screen, auto-lock after inactivity, and jumping
// back to the cashier's newest ticket when they log in.
export function useRegisterLock({ tickets, autoLockMinutes, menuData, showAlert, t }) {
  const { isLocked, setIsLocked, activeCashier, setActiveCashier, setSessionTime } = useAuthStore();
  const setActiveTicketId = useCartStore((s) => s.setActiveTicketId);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [pinAttempt, setPinAttempt] = useState('');
  const [pinShake, flashPinShake, setPinShake] = useFlash(500);
  const pinAttempts = useRef(0);

  // The cashier's own PIN, or any admin PIN, unlocks the selected profile.
  const handleUnlockSubmit = async () => {
    if (!selectedProfile) return;
    const { verifyPin, verifyAdminPin } = useMenuStore.getState();
    try {
      // Both checks always run; the admin check also feeds the PIN lockout.
      const isProfileMatch = await verifyPin(selectedProfile.id, pinAttempt);
      const isStaffAdmin = await verifyAdminPin(pinAttempt);
      const ok = isProfileMatch || isStaffAdmin;
      if (!ok) {
        pinAttempts.current += 1;
        flashPinShake();
        setPinAttempt('');
        return;
      }
      pinAttempts.current = 0;
      setIsLocked(false);
      setActiveCashier(selectedProfile);
      localStorage.setItem('tinypos_activeCashier', JSON.stringify(selectedProfile));
      const now = Date.now();
      setSessionTime(now);
      localStorage.setItem('tinypos_session_time', now.toString());
      setPinAttempt('');
      setSelectedProfile(null);
    } catch (err) {
      showAlert(t('lock.loginErrorTitle'), err.message);
      setPinAttempt('');
    }
  };

  const handlePinKeyDown = (e) => {
    if (e.key === 'Enter') handleUnlockSubmit();
  };

  useEffect(() => {
    if (isLocked || !activeCashier || tickets.length === 0) return;
    const mine = tickets.filter((tk) => tk.cashier_id === activeCashier.id);
    if (mine.length > 0) setActiveTicketId(mine.sort((a, b) => b.id - a.id)[0].id);
    // Only on login; following every ticket change would yank the cashier off the ticket they picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, activeCashier]);

  useEffect(() => {
    if (!menuData || isLocked || autoLockMinutes === 0) return;
    let timeoutId;
    let lastReset = 0;
    const arm = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setIsLocked(true), autoLockMinutes * 60000);
    };
    // A busy register fires mousemove constantly; re-arm at most once a second.
    const onActivity = () => {
      const now = Date.now();
      if (now - lastReset < 1000) return;
      lastReset = now;
      arm();
    };
    const passive = { passive: true };
    window.addEventListener('mousemove', onActivity, passive);
    window.addEventListener('touchstart', onActivity, passive);
    window.addEventListener('keydown', onActivity, passive);
    arm();
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', onActivity, passive);
      window.removeEventListener('touchstart', onActivity, passive);
      window.removeEventListener('keydown', onActivity, passive);
    };
  }, [menuData, isLocked, autoLockMinutes, setIsLocked]);

  return {
    selectedProfile, setSelectedProfile, pinAttempt, setPinAttempt, pinShake, setPinShake,
    handleUnlockSubmit, handlePinKeyDown,
  };
}
