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
    localStorage.setItem('tinypos_cached_menu', JSON.stringify(data)); // Keep cache updated
    set({ menuData: data });
  },
  
  setRecipes: (recipes) => {
    localStorage.setItem('tinypos_cached_recipes', JSON.stringify(recipes)); // Keep cache updated
    set({ recipes });
  },
  
  setActiveCategory: (category) => set({ activeCategory: category }),
  setIsLoading: (status) => set({ isLoading: status }),
}));