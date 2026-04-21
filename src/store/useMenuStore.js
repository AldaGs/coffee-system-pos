import { create } from 'zustand';
// 1. Read the cache synchronously before creating the store
const cachedMenuString = localStorage.getItem('tinypos_cached_menu');
const initialMenuData = cachedMenuString ? JSON.parse(cachedMenuString) : null;

export const useMenuStore = create((set, get) => ({

  // 2. Start with the cached data instantly!
  menuData: initialMenuData,
  
  // THE FIX: Instantly load the offline cache on boot!
  menuData: JSON.parse(localStorage.getItem('tinypos_cached_menu')) || null,
  recipes: JSON.parse(localStorage.getItem('tinypos_cached_recipes')) || [],
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