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
    // Local ('guest') mode: verify against the on-device hashed PIN store — no
    // network, no Supabase RPC.
    const { isLocalMode } = await import('../utils/appMode');
    if (isLocalMode()) {
      const { verifyLocalPin } = await import('../utils/localAuth');
      return verifyLocalPin(cashierId, pin);
    }
    const { supabase } = await import('../supabaseClient');
    if (!navigator.onLine) {
      throw new Error("Internet connection required for PIN verification");
    }
    const { data, error } = await supabase.rpc('verify_pin', { p_cashier_id: cashierId, p_pin: pin });
    if (error) throw error;
    return data;
  },

  verifyAdminPin: async (pin) => {
    // Back-compat shim: same shape as before (returns bool). Internally uses
    // the role-aware path with minRole='admin'.
    const result = await get().verifyAuthorizerPin(pin, 'admin');
    return !!result;
  },

  /**
   * Verify a PIN as an authorizer with at least `minRole` privileges.
   * Returns the authorizing cashier object on success, or null on failure.
   * Used for both admin-only unlocks (minRole='admin') and the manager
   * override flow (minRole='manager') introduced with strictRegisterOverrides.
   */
  verifyAuthorizerPin: async (pin, minRole = 'admin') => {
    const { menuData, verifyPin } = get();
    const { getRole, roleAtLeast } = await import('../utils/cashierRoles');

    // Master PIN (cashier_id=0) always passes — equivalent to admin role.
    if (roleAtLeast('admin', minRole)) {
      const isMaster = await verifyPin(0, pin);
      if (isMaster) return { id: 0, name: 'Master', role: 'admin' };
    }

    const candidates = (menuData?.cashiers || []).filter(c => roleAtLeast(getRole(c), minRole));
    for (const c of candidates) {
      const isValid = await verifyPin(c.id, pin);
      if (isValid) return { ...c, role: getRole(c) };
    }
    return null;
  },
  
  setRecipes: (recipes) => {

    localStorage.setItem('tinypos_cached_recipes', JSON.stringify(recipes)); // Keep cache updated
    set({ recipes });
  },
  
  setActiveCategory: (category) => set({ activeCategory: category }),
  setIsLoading: (status) => set({ isLoading: status }),
}));