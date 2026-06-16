import { create } from 'zustand';
import { recordEvent, markNagShown, dismissNagForever } from '../utils/upgradeNag';

// Drives the local-mode upgrade nudge. Any code — React component or plain
// service — can call `useUpgradeNagStore.getState().trigger('sales_completed')`
// after a meaningful event; the store decides (via upgradeNag) whether the
// milestone + snooze rules say to show the dialog now, and flips `isOpen`.
// The modal is mounted once in App's local pipeline.
export const useUpgradeNagStore = create((set) => ({
  isOpen: false,

  trigger: async (type, amount = 1) => {
    try {
      const show = await recordEvent(type, amount);
      if (show) {
        await markNagShown();
        set({ isOpen: true });
      }
    } catch (e) {
      console.warn('upgrade nag trigger failed', e);
    }
  },

  close: () => set({ isOpen: false }),

  dismissForever: async () => {
    try { await dismissNagForever(); } catch { /* noop */ }
    set({ isOpen: false });
  },
}));
