import { create } from 'zustand';

// --- THE FIX: A bulletproof parser that catches corrupted "undefined" strings ---
const safeJsonParse = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    // If it's missing or is the literal text "undefined", return the safe fallback
    if (!item || item === "undefined") {
      return fallback;
    }
    return JSON.parse(item);
  } catch (error) {
    console.error(`Error parsing ${key} from localStorage:`, error);
    return fallback; // If it crashes, return the safe fallback anyway
  }
};

export const useMenuStore = create((set, get) => ({

  // 1. Instantly and safely load the offline cache on boot!
  menuData: safeJsonParse('tinypos_cached_menu', null),
  lastSyncedAt: localStorage.getItem('tinypos_last_synced') || null,
  recipes: safeJsonParse('tinypos_cached_recipes', []),
  
  activeCategory: null,
  isLoading: true,


  getPosSettings: () => {
    const { menuData } = get();
    const defaults = {
      name: "Main Register",
      language: "en",
      brandColor: 'var(--brand-color)',
      isDarkMode: false,
      autoLockMinutes: 5,
      enableCorte: true,
      ticketVisibility: "open",
      pinCode: "1234"
    };
    if (!menuData?.posSettings) return defaults;
    return { ...defaults, ...menuData.posSettings };
  },

  // Actions
  setMenuData: (data) => {
    // Scrub PINs before saving to localStorage to prevent plaintext leaks
    const scrubbedData = JSON.parse(JSON.stringify(data));
    if (scrubbedData.cashiers) {
      scrubbedData.cashiers.forEach(c => { delete c.pin; });
    }
    if (scrubbedData.posSettings) {
      delete scrubbedData.posSettings.pinCode;
    }
    
    // Issue 8: Track sync time
    const lastSyncedAt = new Date().toISOString();
    localStorage.setItem('tinypos_cached_menu', JSON.stringify(scrubbedData)); 
    localStorage.setItem('tinypos_last_synced', lastSyncedAt);

    set({ menuData: scrubbedData, lastSyncedAt });
  },

  
  verifyPin: async (cashierId, pin) => {
    const { supabase } = await import('../supabaseClient');
    if (!navigator.onLine) {
      throw new Error("Internet connection required for PIN verification");
    }
    const { data, error } = await supabase.rpc('verify_pin', { p_cashier_id: cashierId, p_pin: pin });
    if (error) throw error;
    return data;
  },

  verifyAdminPin: async (pin) => {
    const { menuData, verifyPin } = get();
    // 1. Try Master PIN (ID 0)
    const isMaster = await verifyPin(0, pin);
    if (isMaster) return true;

    // 2. Try any cashier with isAdmin flag
    const adminCashiers = (menuData?.cashiers || []).filter(c => c.isAdmin);
    for (const admin of adminCashiers) {
      const isValid = await verifyPin(admin.id, pin);
      if (isValid) return true;
    }
    return false;
  },
  
  setRecipes: (recipes) => {

    localStorage.setItem('tinypos_cached_recipes', JSON.stringify(recipes)); // Keep cache updated
    set({ recipes });
  },
  
  setActiveCategory: (category) => set({ activeCategory: category }),
  setIsLoading: (status) => set({ isLoading: status }),
}));