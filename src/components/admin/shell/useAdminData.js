import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { loadMenu } from '../../../api/menu';
import { loadVendors } from '../../../api/vendors';
import { snapshotIfStale } from '../../../api/menuVersions';
import { db } from '../../../db';
import { fetchAndMergeSales } from '../../../services/salesSync';
import { fetchAndMergeExpenses } from '../../../services/expenseSync';
import { useMenuStore } from '../../../store/useMenuStore';
import { useTheme } from '../../../hooks/useTheme';
import { useConnectionStatus } from '../../../hooks/useConnectionStatus';
import { isLocalMode } from '../../../utils/appMode';
import { isCloudReachable } from '../../../utils/network';
import { fromCents } from '../../../utils/moneyUtils';

const RECEIPT_DEFAULTS = {
  header: '', subheader: '', footer: '', logo: null,
  enableTaxBreakdown: false, taxRate: 16,
  showCfdiQr: false, showFiscalDisclaimer: false, fiscalDisclaimer: 'Este no es un comprobante fiscal',
};
const GENERAL_DEFAULTS = {
  name: 'Main Register', businessType: 'restaurant', brandColor: 'var(--brand-color)', isDarkMode: false,
  autoLockMinutes: 5, orderResetPolicy: 'daily', enableCorte: false, ticketVisibility: 'open', printerSize: '80mm',
};
const LOYALTY_DEFAULTS = { isActive: true, visitsRequired: 10, rewardDescription: 'tu próxima bebida GRATIS' };

// Seeds a settings form from the cached menu so the tab paints before any fetch.
const fromCache = (key, defaults) => () => {
  const cached = localStorage.getItem('tinypos_cached_menu');
  const saved = cached ? JSON.parse(cached)[key] : null;
  return saved ? { ...defaults, ...saved } : defaults;
};

export async function fetchCloudSettings() {
  const { data, error } = await supabase.from('shop_settings').select('menu_data').eq('id', 1).single();
  if (error) throw error;
  return data?.menu_data || {};
}

// Loads everything the admin tabs read. Paints from the local cache first and
// reconciles with the cloud underneath; cloudSync drives the stale banner:
// 'local' (no cloud), 'checking', 'ok', or 'stale' (showing last-known data).
export function useAdminData({ isAuthenticated }) {
  const setMenuData = useMenuStore((s) => s.setMenuData);
  const setRecipes = useMenuStore((s) => s.setRecipes);
  const menuData = useMenuStore((s) => s.menuData);
  const { updateTheme } = useTheme();
  const { reachable } = useConnectionStatus();

  const [receiptForm, setReceiptForm] = useState(fromCache('receiptSettings', RECEIPT_DEFAULTS));
  const [generalSettings, setGeneralSettings] = useState(fromCache('posSettings', GENERAL_DEFAULTS));
  const [loyaltyForm, setLoyaltyForm] = useState(fromCache('loyaltySettings', LOYALTY_DEFAULTS));
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cloudSync, setCloudSync] = useState(isLocalMode() ? 'local' : 'idle');

  const applySettingsForms = useCallback((settings) => {
    if (settings?.receiptSettings) setReceiptForm((prev) => ({ ...prev, ...settings.receiptSettings }));
    if (settings?.posSettings) setGeneralSettings((prev) => ({ ...prev, ...settings.posSettings }));
    if (settings?.loyaltySettings) setLoyaltyForm((prev) => ({ ...prev, ...settings.loyaltySettings }));
  }, []);

  // Keeps menu_versions fresh even for shops that never edit; writes only when the latest is >24h old.
  useEffect(() => { snapshotIfStale().catch(() => {}); }, []);

  useEffect(() => {
    if (menuData?.posSettings) updateTheme(menuData.posSettings);
  }, [menuData, updateTheme]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    // Each source loads independently, so one slow or failing request can't blank the other tabs.
    const fetchData = async () => {
      const local = isLocalMode();
      const cached = useMenuStore.getState().menuData;
      if (cached) {
        applySettingsForms(cached);
        setIsLoading(false);
      }
      if (!local) setCloudSync('checking');

      try {
        const menu = await loadMenu();
        const settings = local ? (useMenuStore.getState().menuData || {}) : await fetchCloudSettings();
        setMenuData({ ...settings, ...menu });
        applySettingsForms(settings);
        if (!local) setCloudSync('ok');
      } catch (error) {
        console.warn('Admin menu/settings refresh failed; using cached menu.', error?.message);
        applySettingsForms(useMenuStore.getState().menuData || {});
        if (!local) setCloudSync('stale');
      }

      // A missing vendors table means the install hasn't run Update Schema yet.
      try {
        setVendors(await loadVendors());
      } catch (e) {
        console.warn('Vendors unavailable (run Update Schema?):', e.message);
      }

      try {
        const cachedInv = await db.inventory.toArray();
        if (cachedInv?.length) setInventoryItems(cachedInv);
        const cachedLogs = await db.inventory_logs.toArray();
        if (cachedLogs?.length) setInventoryLogs(cachedLogs);
      } catch (e) {
        console.warn('Cached inventory load failed:', e.message);
      }

      if (!local) {
        try { await fetchAndMergeExpenses(); } catch (e) { console.warn('Expense merge failed:', e.message); }
        try { await fetchAndMergeSales(); } catch (e) { console.warn('Sales merge failed:', e.message); }

        if (isCloudReachable()) {
          try {
            const { data: recipesData } = await supabase.from('recipes').select('*').order('created_at', { ascending: false });
            if (recipesData) {
              // The Recipe Builder edits prices as decimal strings.
              setRecipes(recipesData.map((r) => ({
                ...r,
                custom_price: r.custom_price ? fromCents(r.custom_price).toString() : null,
              })));
            }
          } catch (e) { console.warn('Recipes load failed; using cache.', e.message); }

          try {
            const { data: invData } = await supabase.from('inventory').select('*');
            if (invData) {
              setInventoryItems(invData);
              await db.inventory.bulkPut(invData);
            }
          } catch (e) { console.warn('Inventory refresh failed; using cache.', e.message); }

          try {
            const { data: logsData } = await supabase.from('inventory_logs').select('*');
            if (logsData) setInventoryLogs(logsData);
          } catch (e) { console.warn('Inventory logs refresh failed; using cache.', e.message); }
        }
      }

      setIsLoading(false);
    };
    fetchData();
  }, [isAuthenticated, applySettingsForms, setMenuData, setRecipes]);

  // "Retry" on the stale banner, and the automatic retry when the link comes back.
  const recheckCloud = useCallback(async () => {
    if (isLocalMode()) return;
    setCloudSync('checking');
    try {
      const [menu, settings] = await Promise.all([loadMenu(), fetchCloudSettings()]);
      setMenuData({ ...settings, ...menu });
      applySettingsForms(settings);
      setCloudSync('ok');
    } catch (err) {
      console.warn('Cloud recheck failed; still on cached data.', err?.message);
      setCloudSync('stale');
    }
  }, [setMenuData, applySettingsForms]);

  useEffect(() => {
    if (cloudSync === 'stale' && reachable) recheckCloud();
  }, [reachable, cloudSync, recheckCloud]);

  const refreshVendors = async () => {
    try { setVendors(await loadVendors()); } catch (e) { console.warn('refreshVendors failed', e.message); }
  };

  return {
    receiptForm, setReceiptForm, generalSettings, setGeneralSettings, loyaltyForm, setLoyaltyForm,
    inventoryItems, setInventoryItems, inventoryLogs, vendors, refreshVendors,
    isLoading, cloudSync, recheckCloud,
  };
}
