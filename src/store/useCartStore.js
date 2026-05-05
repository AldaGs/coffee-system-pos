import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export const useCartStore = create(immer((set) => ({
  activeTicketId: JSON.parse(localStorage.getItem('tinypos_activeTicketId')) || null,
  
  // Split Payment UI States
  isCheckoutModalOpen: false,
  splitMode: 'full', // 'full', 'even', 'product', 'custom'
  splitPayments: [],
  nWays: 2,
  customVal: '',
  paidProductIds: [],
  tipAmount: 0, 
  tipPercentage: 10,

  // Actions
  setActiveTicketId: (id) => {
    localStorage.setItem('tinypos_activeTicketId', JSON.stringify(id));
    set((state) => { state.activeTicketId = id; });
  },

  setIsCheckoutModalOpen: (isOpen) => set((state) => { state.isCheckoutModalOpen = isOpen; }),
  setSplitMode: (mode) => set((state) => { state.splitMode = mode; }),
  setSplitPayments: (payments) => set((state) => { state.splitPayments = payments; }),
  setNWays: (ways) => set((state) => { state.nWays = ways; }),
  setCustomVal: (val) => set((state) => { state.customVal = val; }),
  setPaidProductIds: (ids) => set((state) => { state.paidProductIds = ids; }),
  setTipAmount: (amount) => set((state) => { state.tipAmount = amount; }), 
  setTipPercentage: (pct) => set((state) => { state.tipPercentage = pct; }),

  resetCheckoutState: () => set((state) => {
    state.isCheckoutModalOpen = false;
    state.splitMode = 'full';
    state.splitPayments = [];
    state.nWays = 2;
    state.customVal = '';
    state.paidProductIds = [];
    state.tipAmount = 0;
    state.tipPercentage = 10;
  })
})));