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
      // Concrete default (matches a fresh cloud store). The old 'var(--brand-color)'
      // placeholder leaked into the color picker as a literal string and, when fed
      // back into ThemeContext.setProperty('--brand-color', …), created a
      // self-referential (invalid) value that wiped the accent color entirely.
      brandColor: '#f28b05',
      isDarkMode: false,
      autoLockMinutes: 5,
      enableCorte: true,
      ticketVisibility: "open",
      pinCode: "" // no hardcoded master PIN; set during onboarding
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
    const { isCloudReachable } = await import('../utils/network');
    const { verifyCachedCloudPin, cacheCloudPinVerification } = await import('../utils/localAuth');

    // Slow / half-open or dropped link: the `verify_pin` RPC is the only way in,
    // so hitting it here would freeze (then fail) the login and lock staff out of
    // the till. Instead verify against the on-device cache of PINs that already
    // succeeded online on this device. (A brand-new device with nothing cached
    // still needs the cloud for its first unlock — verifyCachedCloudPin returns
    // false, so the caller reports a bad PIN, same as before.)
    if (!isCloudReachable()) {
      return verifyCachedCloudPin(cashierId, pin);
    }

    try {
      const { data, error } = await supabase.rpc('verify_pin', { p_cashier_id: cashierId, p_pin: pin });
      if (error) throw error;
      // Remember a good PIN so the register still opens if the link degrades.
      if (data) await cacheCloudPinVerification(cashierId, pin);
      return data;
    } catch (err) {
      // The RPC failed to complete (timeout, or the breaker tripped mid-call).
      // Fall back to the offline cache rather than hard-failing on a flaky link;
      // only surface the error when the cache can't vouch for this PIN.
      const cached = await verifyCachedCloudPin(cashierId, pin);
      if (cached) return true;
      throw err;
    }
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