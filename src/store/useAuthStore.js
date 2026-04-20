import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  isLocked: true,
  activeCashier: JSON.parse(localStorage.getItem('tinypos_activeCashier')) || null,
  sessionTime: parseInt(localStorage.getItem('tinypos_session_time')) || 0,

  // Actions
  setIsLocked: (status) => set({ isLocked: status }),
  
  setActiveCashier: (cashier) => {
    localStorage.setItem('tinypos_activeCashier', JSON.stringify(cashier));
    set({ activeCashier: cashier });
  },

  setSessionTime: (time) => {
    localStorage.setItem('tinypos_session_time', time.toString());
    set({ sessionTime: time });
  },

  logout: () => {
    localStorage.removeItem('tinypos_activeCashier');
    localStorage.removeItem('tinypos_session_time');
    set({ activeCashier: null, isLocked: true, sessionTime: 0 });
  }
}));