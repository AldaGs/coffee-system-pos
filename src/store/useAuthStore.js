import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export const useAuthStore = create(immer((set) => ({
  isLocked: true,
  activeCashier: JSON.parse(localStorage.getItem('tinypos_activeCashier')) || null,
  sessionTime: parseInt(localStorage.getItem('tinypos_session_time')) || 0,

  // Actions
  setIsLocked: (status) => set((state) => { state.isLocked = status; }),
  
  setActiveCashier: (cashier) => {
    localStorage.setItem('tinypos_activeCashier', JSON.stringify(cashier));
    set((state) => { state.activeCashier = cashier; });
  },

  setSessionTime: (time) => {
    localStorage.setItem('tinypos_session_time', time.toString());
    set((state) => { state.sessionTime = time; });
  },

  logout: () => {
    localStorage.removeItem('tinypos_activeCashier');
    localStorage.removeItem('tinypos_session_time');
    set((state) => {
      state.activeCashier = null;
      state.isLocked = true;
      state.sessionTime = 0;
    });
  }
})));