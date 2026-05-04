import { create } from 'zustand';

export const useCartStore = create((set) => ({
  activeTicketId: JSON.parse(localStorage.getItem('tinypos_activeTicketId')) || null,
  
  // Split Payment UI States
  isCheckoutModalOpen: false,
  splitMode: 'full', // 'full', 'even', 'product', 'custom'
  splitPayments: [],
  nWays: 2,
  customVal: '',
  paidProductIds: [],
  tipAmount: 0, // NEW
  tipPercentage: 10,

  // Actions
  setActiveTicketId: (id) => {
    localStorage.setItem('tinypos_activeTicketId', JSON.stringify(id));
    set({ activeTicketId: id });
  },

  setIsCheckoutModalOpen: (isOpen) => set({ isCheckoutModalOpen: isOpen }),
  setSplitMode: (mode) => set({ splitMode: mode }),
  setSplitPayments: (payments) => set({ splitPayments: payments }),
  setNWays: (ways) => set({ nWays: ways }),
  setCustomVal: (val) => set({ customVal: val }),
  setPaidProductIds: (ids) => set({ paidProductIds: ids }),
  setTipAmount: (amount) => set({ tipAmount: amount }), // NEW
  setTipPercentage: (pct) => set({ tipPercentage: pct }),

  resetCheckoutState: () => set({
    isCheckoutModalOpen: false,
    splitMode: 'full',
    splitPayments: [],
    nWays: 2,
    customVal: '',
    paidProductIds: [],
    tipAmount: 0, // NEW
    tipPercentage: 10
  })
}));