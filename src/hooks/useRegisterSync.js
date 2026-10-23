import { useEffect } from 'react';
import { db } from '../db';
import { supabase } from '../supabaseClient';
import { loadMenu } from '../api/menu';
import { isLocalMode } from '../utils/appMode';
import { isCloudReachable } from '../utils/network';
import { createRealtimeChannel } from '../utils/realtime';
import { getOrderedVisibleCategories } from '../utils/categoryUtils';
import { useMenuStore } from '../store/useMenuStore';
import { fetchAndMergeSales } from '../services/salesSync';
import { fetchAndMergeExpenses } from '../services/expenseSync';
import { fetchActiveTickets } from '../services/ticketSync';

// Mirrors a cloud table into Dexie row by row. On a flapping link it stops
// reconnecting and polls a full resync instead.
function useTableMirror(name, table, poll) {
  useEffect(() => {
    if (isLocalMode()) return;
    const { cleanup } = createRealtimeChannel(name, { event: '*', schema: 'public', table }, async ({ eventType, new: row, old }) => {
      if (eventType === 'DELETE') {
        if (old?.id != null) await db[table].delete(old.id);
      } else if (row?.id != null) {
        await db[table].put(row);
      }
    }, { poll });
    return cleanup;
  }, [name, table, poll]);
}

async function refreshInventory() {
  if (!isCloudReachable()) return;
  try {
    const { data } = await supabase.from('inventory').select('*');
    if (data) await db.inventory.bulkPut(data);
  } catch { /* next tick */ }
}

// Boot load plus live sync. Every station sees other stations' tickets (the
// floor map's table status depends on it) and stock changes as they happen.
export function useRegisterSync() {
  const setMenuData = useMenuStore((s) => s.setMenuData);
  const setRecipes = useMenuStore((s) => s.setRecipes);
  const setActiveCategory = useMenuStore((s) => s.setActiveCategory);
  const setIsLoading = useMenuStore((s) => s.setIsLoading);

  useTableMirror('register-active-tickets', 'active_tickets', fetchActiveTickets);
  useTableMirror('register-inventory', 'inventory', refreshInventory);

  useEffect(() => {
    const boot = async () => {
      try {
        let merged;
        if (isLocalMode()) {
          merged = { ...(useMenuStore.getState().menuData || {}), ...(await loadMenu()) };
          setMenuData(merged);
        } else {
          const [menu, settingsRes, recipeResp] = await Promise.all([
            loadMenu(),
            supabase.from('shop_settings').select('menu_data').eq('id', 1).single(),
            supabase.from('recipes').select('*'),
          ]);
          if (settingsRes.error) throw settingsRes.error;
          if (recipeResp.error) throw recipeResp.error;
          merged = { ...menu, ...(settingsRes.data?.menu_data || {}) };
          setMenuData(merged);
          setRecipes(recipeResp.data);
        }

        // Same ordering as the category tabs, so the default tab matches the first one shown.
        const allCats = Object.keys(merged.categories || {});
        if (allCats.length > 0) setActiveCategory(getOrderedVisibleCategories(merged)[0] || allCats[0]);

        if (!isLocalMode()) {
          await fetchActiveTickets();
          await fetchAndMergeSales();
          // Expenses from every device, so the shift math covers the whole shop.
          await fetchAndMergeExpenses();
          // The cloud stock is the truth; without this the local copy only ever goes down.
          try {
            const { data: invData } = await supabase.from('inventory').select('*');
            if (invData) await db.inventory.bulkPut(invData);
          } catch (e) {
            console.warn('Inventory refresh failed; using local mirror.', e.message);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch fresh menu or sync, using cache.', err);
      }
      setIsLoading(false);
    };
    boot();
  }, [setMenuData, setRecipes, setActiveCategory, setIsLoading]);
}
