import { Icon } from '@iconify/react';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import {
  loadMenu,
  addCategory, renameCategory, deleteCategory, reorderCategories, setCategoryHidden, setCategoryPublicHidden,
  addItem, updateItem, deleteItem, setItemHidden,
  addModifierGroup, renameModifierGroup, deleteModifierGroup, setModifierGroupAllowMultiple, setModifierGroupHidden,
  addModifierOption, updateModifierOption, deleteModifierOption,
  setItemModifiers,
  addDiscountRule, updateDiscountRule, deleteDiscountRule
} from './api/menu';
import { loadVendors, addVendor, updateVendor, deleteVendor } from './api/vendors';
import { uploadAsset, clearItemImage, setItemImageUrl, listAssets, deleteAsset } from './api/menuImages';
import { debouncedSnapshot, snapshotIfStale } from './api/menuVersions';
import * as XLSX from 'xlsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { fetchAndMergeSales } from './services/salesSync';
import { fetchAndMergeExpenses } from './services/expenseSync';
import { useDialog } from './hooks/useDialog';
import { useTheme } from './hooks/useTheme';
import { useMenuStore } from './store/useMenuStore';
import { useTranslation } from './hooks/useTranslation';
import { usePreventAccidentalExit } from './hooks/usePreventAccidentalExit';
import { isLocalMode } from './utils/appMode';
import { useUpgradeNagStore } from './store/useUpgradeNagStore';

import AnalyticsTab from './components/admin/AnalyticsTab';
import OrdersTab from './components/admin/OrdersTab';
import MenuEditorTab from './components/admin/MenuEditorTab';
import MenusTab from './components/admin/MenusTab';
import ModifierLibraryTab from './components/admin/ModifierLibraryTab';
import ReceiptSettingsTab from './components/admin/ReceiptSettingsTab';
import LoyaltyTab from './components/admin/LoyaltyTab';
import DiscountsTab from './components/admin/DiscountsTab';
import TeamTab from './components/admin/TeamTab';
import VendorsTab from './components/admin/VendorsTab';
import TablesTab from './components/admin/TablesTab';
import GeneralSettingsTab from './components/admin/GeneralSettingsTab';
import RecipeBuilderTab from './components/admin/RecipeBuilderTab';
import EditDrinkModal from './components/admin/EditDrinkModal';
import InventoryTab from './components/admin/InventoryTab.jsx';
import CfdiTab from './components/admin/CfdiTab';
import ActivityTab from './components/admin/ActivityTab';
import TipsTab from './components/admin/TipsTab';
import DevicesTab from './components/admin/DevicesTab';
import BootScreen from './components/register/BootScreen';
import SharedPinPad from './components/shared/SharedPinPad';
import { logActivity } from './services/activityService';
import { toCents, fromCents } from './utils/moneyUtils';
import { computeCogsAndWastage } from './utils/cogsMath';

function Admin() {
  usePreventAccidentalExit();
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useDialog();
  const { updateTheme } = useTheme();
  // --- ZUSTAND GLOBAL STORE ---
  const { menuData, setMenuData, recipes, setRecipes } = useMenuStore();
  const { t } = useTranslation();
  // Local ('guest') mode: the device was already unlocked by LocalAuthGate, so
  // there is no separate cloud account login — start authenticated and skip the
  // Supabase session machinery entirely. The admin PIN gate below still applies.
  const [isAuthenticated, setIsAuthenticated] = useState(isLocalMode());
  // Tracks whether the initial supabase.auth.getSession() has resolved.
  // Without this flag the first render shows the email/password form for
  // the window between mount and session-promise resolution — long enough
  // to be visible (and interactive) when the page is busy with other work
  // (sync queue, presence subs, etc.).
  const [isCheckingSession, setIsCheckingSession] = useState(!isLocalMode());

  // strictAdminAccess guard: when on, the active cashier role must be 'admin'
  // to even reach this page. We check on mount and on every menuData refresh
  // in case the toggle is flipped while admin is open.
  useEffect(() => {
    const strict = !!menuData?.posSettings?.strictAdminAccess;
    if (!strict) return;
    let active = null;
    try {
      const raw = localStorage.getItem('tinypos_activeCashier');
      if (raw) active = JSON.parse(raw);
    } catch { /* noop */ }
    const role = active?.role || (active?.isAdmin ? 'admin' : 'employee');
    if (role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [menuData, navigate]);

  // Boot snapshot: ensures menu_versions has a recent row even for shops that
  // open Admin without editing anything. Skips writing if the latest snapshot
  // is < 24h old, so the cost is one cheap SELECT per session, not a row.
  useEffect(() => { snapshotIfStale().catch(() => {}); }, []);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  // --- NEW: MANAGER PIN LOCK STATE ---
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Initial tab honors `?tab=<key>` so flows that land us on /admin from
  // elsewhere (notably the Devices OAuth round-trip) can deep-link to the
  // tab the user was just on. The param is scrubbed from the URL in a
  // companion effect below so reloading doesn't pin them to that tab forever.
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      return tab || 'analytics';
    } catch {
      return 'analytics';
    }
  });

  useEffect(() => {
    // Strip ?tab once it's been consumed.
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('tab')) {
      url.searchParams.delete('tab');
      window.history.replaceState({}, document.title, url.pathname + (url.search || ''));
    }
  }, []);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemForm, setNewItemForm] = useState({
    category: '',
    name: '',
    price: '',
    priceType: 'fixed',
    emoji: '☕',
    ivaTreatment: 'tasa0',
    allowedModifiers: [],
    item_type: "none",

    groupKey: "",
    isTextInput: false,
    deductionTarget: "",
    substitutionTarget: ""
  });
  const [newModGroupName, setNewModGroupName] = useState("");
  const [newModOption, setNewModOption] = useState({ groupKey: "", name: "", price: "0", isTextInput: false });
  const [editingDrink, setEditingDrink] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [timeFilter, setTimeFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [newRule, setNewRule] = useState({ name: '', type: 'percentage', value: '', targetType: 'cart', targetValue: '' });
  // Expenses are sourced from Dexie now — fetchAndMergeExpenses pulls every
  // device's rows down on mount and useLiveQuery keeps the view fresh.
  const expensesLive = useLiveQuery(() => db.expenses.toArray(), []);
  const expenses = useMemo(() => expensesLive || [], [expensesLive]);

  // --- INSTANT RECEIPT SETTINGS ---
  const [receiptForm, setReceiptForm] = useState(() => {
    const defaultReceipt = {
      header: "",
      subheader: "",
      footer: "",
      logo: null,
      enableTaxBreakdown: false,
      taxRate: 16
    };
    const cached = localStorage.getItem('tinypos_cached_menu');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.receiptSettings) return { ...defaultReceipt, ...parsed.receiptSettings };
    }
    return defaultReceipt;
  });

  // --- INSTANT GENERAL SETTINGS ---
  const [generalSettings, setGeneralSettings] = useState(() => {
    const defaultSettings = {
      name: "Main Register",
      businessType: "restaurant",
      brandColor: 'var(--brand-color)',
      isDarkMode: false,
      autoLockMinutes: 5,
      orderResetPolicy: "daily",
      enableCorte: false,
      ticketVisibility: "open",
      printerSize: "80mm"
    };
    const cached = localStorage.getItem('tinypos_cached_menu');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.posSettings) return { ...defaultSettings, ...parsed.posSettings };
    }
    return defaultSettings;
  });

  // --- INSTANT LOYALTY SETTINGS ---
  const [loyaltyForm, setLoyaltyForm] = useState(() => {
    const defaultLoyalty = {
      isActive: true,
      visitsRequired: 10,
      rewardDescription: "tu próxima bebida GRATIS"
    };
    const cached = localStorage.getItem('tinypos_cached_menu');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.loyaltySettings) return { ...defaultLoyalty, ...parsed.loyaltySettings };
    }
    return defaultLoyalty;
  });

  // --- NEW: CALCULATOR & RECIPE BUILDER STATE ---
  const [activeRecipe, setActiveRecipe] = useState(null);

  // --- READ ANALYTICS DATA ---
  // Analytics are now fetched from Supabase, orderHistory is technically deprecated but left here in case local analytics fallback is needed
  // const [orderHistory, setOrderHistory] = useState(() => { ... })

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });

      if (error) throw error;

      setIsAuthenticated(true);
    } catch (error) {
      showAlert(t('admin.loginFailed'), error.message);

      setLoginForm({ ...loginForm, password: "" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!isLocalMode() && supabase) await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

  const handleBackToRegister = () => {
    setIsAdminUnlocked(false); // Re-lock the admin dashboard
    setAdminPinInput(''); // Clear the PIN input
    navigate('/'); // Send them back to the register
  };


  // --- AUTHENTICATION LISTENER (For Offline Support & Persistence) ---
  useEffect(() => {
    // Local mode has no cloud session — nothing to check or subscribe to.
    if (isLocalMode() || !supabase) return;
    // Check if an active session already exists in localStorage. Render
    // gates wait on `isCheckingSession` so we don't flash the login form
    // before this promise resolves.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsAuthenticated(true);
      setIsCheckingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const fetchData = async () => {
      try {
        // 1. Fetch Menu (dedicated tables) + Settings (residual shop_settings.menu_data).
        //    Menu pieces live in menu_categories / menu_items / menu_modifier_groups
        //    / menu_modifier_options / menu_item_modifier_groups / menu_discount_rules.
        //    Cashiers, posSettings, receiptSettings, loyaltySettings still ride on
        //    shop_settings.menu_data. They're merged here so the in-memory `menuData`
        //    shape stays identical for child components.
        //
        //    Local ('guest') mode: the menu comes from Dexie via the dispatcher,
        //    settings come from whatever useMenuStore has cached locally, and the
        //    cloud-only reads (recipes, server inventory/logs, sales pull) are
        //    skipped — Dexie live queries already feed those views.
        const local = isLocalMode();
        const menu = await loadMenu();
        const settings = local
          ? (useMenuStore.getState().menuData || {})
          : await (async () => {
              const settingsRes = await supabase.from('shop_settings').select('menu_data').eq('id', 1).single();
              if (settingsRes.error) throw settingsRes.error;
              return settingsRes.data?.menu_data || {};
            })();
        setMenuData({ ...settings, ...menu });

        // Vendor registry (works in both modes via the dispatcher). Tolerate a
        // missing table on pre-0.4 installs that haven't run Update Schema yet.
        try {
          setVendors(await loadVendors());
        } catch (e) {
          console.warn('Vendors unavailable (run Update Schema?):', e.message);
        }

        const firstCategory = menu.categoryOrder[0];
        if (firstCategory) setNewItemForm(prev => ({ ...prev, category: firstCategory }));

        // 3. Load UI Settings (Receipt, General, Loyalty)
        if (settings.receiptSettings) setReceiptForm(prev => ({ ...prev, ...settings.receiptSettings }));
        if (settings.posSettings) setGeneralSettings(prev => ({ ...prev, ...settings.posSettings }));
        if (settings.loyaltySettings) setLoyaltyForm(prev => ({ ...prev, ...settings.loyaltySettings }));

        if (local) {
          // Inventory lives in Dexie locally; recipes/sales-pull are cloud-only.
          const invData = await db.inventory.toArray();
          if (invData) setInventoryItems(invData);
          const logsData = await db.inventory_logs.toArray();
          if (logsData) setInventoryLogs(logsData);
        } else {
          // 2. Pull every device's expenses into Dexie. The useLiveQuery above
          // will pick up the merged rows automatically.
          await fetchAndMergeExpenses();

          // 4. Fetch Sales History (dedupe by local_id — see salesSync.js)
          await fetchAndMergeSales();

          // 5. Fetch Recipes & Inventory
          const { data: recipesData } = await supabase.from('recipes').select('*').order('created_at', { ascending: false });
          if (recipesData) {
            // Convert cents back to decimal strings for the Recipe Builder UI
            const mappedRecipes = recipesData.map(r => ({
              ...r,
              custom_price: r.custom_price ? fromCents(r.custom_price).toString() : null
            }));
            setRecipes(mappedRecipes); // Use mappedRecipes instead of raw recipesData
          }

          const { data: invData } = await supabase.from('inventory').select('*');
          if (invData) {
            setInventoryItems(invData);
            await db.inventory.bulkPut(invData);
          }

          const { data: logsData } = await supabase.from('inventory_logs').select('*');
          if (logsData) setInventoryLogs(logsData);
        }

      } catch (error) {
        console.error("Error fetching data:", error.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);


  // --- THEME INJECTION LOGIC (KEEPS ADMIN IN SYNC) ---
  useEffect(() => {
    if (menuData?.posSettings) {
      updateTheme(menuData.posSettings);
    }
  }, [menuData, updateTheme]);

  // Re-fetches menu + settings from the cloud. Used as rollback when a typed
  // writer fails after an optimistic local update — guarantees the on-screen
  // state matches what's actually persisted.
  const reloadMenuFromCloud = async () => {
    try {
      if (isLocalMode()) {
        // No cloud — reload the menu from Dexie and keep cached settings.
        const menu = await loadMenu();
        const settings = useMenuStore.getState().menuData || {};
        setMenuData({ ...settings, ...menu });
        return;
      }
      const [menu, settingsRes] = await Promise.all([
        loadMenu(),
        supabase.from('shop_settings').select('menu_data').eq('id', 1).single()
      ]);
      const settings = settingsRes.data?.menu_data || {};
      setMenuData({ ...menu, ...settings });
    } catch (err) {
      console.error('Failed to reload menu after write error:', err.message);
    }
  };

  // Optimistic-write helper: applies `optimisticMenu` locally, runs the typed
  // writer(s), and on failure shows an alert + re-fetches to roll back.
  // On success, debouncedSnapshot() schedules a menu_versions snapshot ~5s
  // after the burst of edits settles, so one save burst = one version row.
  const runMenuWrite = async (optimisticMenu, writeFn, op) => {
    setMenuData(optimisticMenu);
    setIsSaving(true);
    try {
      await writeFn();
      debouncedSnapshot(op || (writeFn.name || 'menu-write'));
    } catch (err) {
      showAlert(t('common.error'), t('admin.cloudSaveFailPrefix') + err.message);
      await reloadMenuFromCloud();
    } finally {
      setIsSaving(false);
    }
  };

  // Sets public-menu-only per-item fields (roast date, WhatsApp link) from the
  // Menús Públicos tab. Merges into the existing catalog item and writes through
  // the same path as the item editor, so the fields round-trip via
  // menu_items.data and the in-memory store / Register stay in sync.
  const handleSetItemPublicFields = (itemId, patch) => {
    let category = null; let existing = null;
    Object.keys(menuData.categories || {}).forEach(cat => {
      const found = menuData.categories[cat].find(d => d.id === itemId);
      if (found) { category = cat; existing = found; }
    });
    if (!existing) return;
    const updatedItem = { ...existing, ...patch };
    const newCategories = { ...menuData.categories };
    newCategories[category] = newCategories[category].map(d => (d.id === itemId ? updatedItem : d));
    runMenuWrite({ ...menuData, categories: newCategories }, () => updateItem(itemId, updatedItem), 'menu-item-public-fields');
  };

  // Persists ONLY the settings keys (cashiers, posSettings, receiptSettings,
  // loyaltySettings) to shop_settings.menu_data. The menu pieces (categories,
  // modifierGroups, etc.) live in their own tables now — writing the whole
  // in-memory `menuData` blob back would resurrect those legacy keys.
  const saveSettingsToCloud = async (updatedMenu) => {
    setIsSaving(true);
    try {
      // Local ('guest') mode: there is no shop_settings table. Persist settings
      // into the local cache (useMenuStore scrubs PINs before writing), and route
      // any PINs into the hashed app_local store so they survive — the master PIN
      // is cashier id 0 (posSettings.pinCode), plus any per-cashier PINs.
      if (isLocalMode()) {
        const { setLocalPin } = await import('./utils/localAuth');
        if (updatedMenu.posSettings?.pinCode) {
          await setLocalPin(0, updatedMenu.posSettings.pinCode);
        }
        for (const c of (updatedMenu.cashiers || [])) {
          if (c?.pin) await setLocalPin(c.id, c.pin);
        }
        setMenuData(updatedMenu);
        return;
      }
      const settingsOnly = {
        cashiers: updatedMenu.cashiers,
        posSettings: updatedMenu.posSettings,
        receiptSettings: updatedMenu.receiptSettings,
        loyaltySettings: updatedMenu.loyaltySettings
      };
      const { error } = await supabase.from('shop_settings').update({ menu_data: settingsOnly }).eq('id', 1);
      if (error) throw error;
      setMenuData(updatedMenu);
    } catch (error) {
      showAlert(t('common.error'), t('admin.cloudSaveFailPrefix') + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Direct add of a fully-built item (used by RecipeBuilderTab to publish a
  // recipe as a menu item). Mirrors the add-path of handleAddDrink without the
  // form-state dependency.
  const handleAddItemDirect = (categoryName, item) => {
    const updatedMenu = {
      ...menuData,
      categories: {
        ...menuData.categories,
        [categoryName]: [...(menuData.categories[categoryName] || []), item]
      }
    };
    runMenuWrite(updatedMenu, () => addItem(categoryName, item));
    useUpgradeNagStore.getState().trigger('items_added');
  };

  // Patches a single item's imageUrl across whichever category currently
  // holds it. Used by the upload + clear flows below.
  const patchItemImageInMenu = (itemId, imageUrl) => {
    const next = { ...menuData, categories: { ...menuData.categories } };
    for (const cat of Object.keys(next.categories)) {
      const items = next.categories[cat];
      const idx = items.findIndex(it => it.id === itemId);
      if (idx === -1) continue;
      const patched = [...items];
      patched[idx] = { ...patched[idx], imageUrl };
      next.categories[cat] = patched;
      break;
    }
    return next;
  };

  const handleSetItemImage = (itemId, blob) => {
    const optimistic = patchItemImageInMenu(itemId, URL.createObjectURL(blob));
    runMenuWrite(optimistic, async () => {
      const url = await uploadAsset(blob);
      await setItemImageUrl(itemId, url);
      loadAssets();
    });
  };

  const handleClearItemImage = (itemId) => {
    const optimistic = patchItemImageInMenu(itemId, '');
    runMenuWrite(optimistic, () => clearItemImage(itemId));
  };

  // --- Asset library (content-addressed image store, deduped) ---
  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsBusy, setAssetsBusy] = useState(false);

  const loadAssets = async () => {
    setAssetsLoading(true);
    try {
      setAssets(await listAssets());
    } catch (err) {
      console.error('listAssets failed:', err);
    } finally {
      setAssetsLoading(false);
    }
  };

  // Assign an already-uploaded asset to an item — no upload, just a URL write.
  const handleSelectAssetForItem = (itemId, url) => {
    const optimistic = patchItemImageInMenu(itemId, url);
    runMenuWrite(optimistic, () => setItemImageUrl(itemId, url));
  };

  // Upload-only (from the manager, no target item). Returns the asset URL.
  const handleUploadAsset = async (blob) => {
    setAssetsBusy(true);
    try {
      return await uploadAsset(blob);
    } finally {
      setAssetsBusy(false);
    }
  };

  const handleDeleteAsset = async (path) => {
    setAssetsBusy(true);
    try {
      await deleteAsset(path);
      await loadAssets();
    } catch (err) {
      console.error('deleteAsset failed:', err);
      showAlert?.(t('common.error') || 'Error', t('menu.deleteAssetFailed') || 'No se pudo eliminar la imagen.');
    } finally {
      setAssetsBusy(false);
    }
  };

  // --- NEW: RECEIPT LOGIC ---

  // This function intercepts the file the user selects and converts it to text
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // reader.result is the massive Base64 string representing the image
        setReceiptForm({ ...receiptForm, logo: reader.result });
      };
      // Tell the browser to read the image and trigger the onloadend function above
      reader.readAsDataURL(file);
    }
  };

  // --- NEW: APP BOOT LOGO UPLOADER ---
  const handleAppLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGeneralSettings({ ...generalSettings, appBootLogo: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  // Saves the custom receipt form to our JSON cloud object
  const handleSaveReceipt = () => {
    const updatedMenu = { ...menuData, receiptSettings: receiptForm };
    saveSettingsToCloud(updatedMenu);
    logActivity('settings_updated', null, { section: 'receipt' });
    showAlert(t('common.success'), t('receipt.saveSuccessDesc'));
  };

  const handleSaveGeneralSettings = async () => {
    setIsSaving(true);
    try {
      // 1. Save to shop_settings.menu_data.posSettings (The Register's source of truth).
      //    Only settings keys go to shop_settings.menu_data — menu pieces live
      //    in their own tables now.
      const updatedMenu = { ...menuData, posSettings: generalSettings };
      const settingsOnly = {
        cashiers: updatedMenu.cashiers,
        posSettings: updatedMenu.posSettings,
        receiptSettings: updatedMenu.receiptSettings,
        loyaltySettings: updatedMenu.loyaltySettings
      };
      const { error } = await supabase
        .from('shop_settings')
        .update({ menu_data: settingsOnly })
        .eq('id', 1);

      if (error) throw error;

      // Update local state so UI reflects changes immediately
      setMenuData(updatedMenu);

      // 2. Keep the legacy 'general_settings' table in sync just in case
      /*await supabase
        .from('general_settings')
        .upsert({ id: 1, ...generalSettings });
      */

      // 3. Sync to LocalStorage for the Favicon/Boot injector
      if (generalSettings.appBootLogo) {
        localStorage.setItem('tinypos_boot_logo', generalSettings.appBootLogo);

        // Immediate favicon update without refresh
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = generalSettings.appBootLogo;
      }

      logActivity('settings_updated', null, { section: 'general' });
      showAlert(t('common.success'), t('settings.saveSuccessDesc'));
    } catch (err) {
      console.error(err);
      showAlert(t('common.error'), t('admin.cloudSaveFailPrefix') + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Saves the custom loyalty settings to our JSON cloud object
  const handleSaveLoyalty = () => {
    if (loyaltyForm.isActive) {
      if (loyaltyForm.visitsRequired < 1) return showAlert(t('common.error'), t('loyalty.visitsRequiredErr'));
      if (!loyaltyForm.rewardDescription || !loyaltyForm.rewardDescription.trim()) return showAlert(t('common.error'), t('loyalty.rewardRequiredErr'));
    }

    const updatedMenu = { ...menuData, loyaltySettings: loyaltyForm };
    saveSettingsToCloud(updatedMenu);
    logActivity('settings_updated', null, { section: 'loyalty' });
    showAlert(t('common.success'), t('loyalty.saveSuccessDesc'));
  };

  // --- DANGER ZONE: RESET ALL CUSTOMER STARS ---
  const handleResetLoyaltyData = async () => {
    const confirmMessage = t('loyalty.resetWarning');

    showConfirm(t('loyalty.deleteTitle') || 'Wipe Loyalty Data?', confirmMessage, async () => {
      try {
        setIsSaving(true);
        const { error } = await supabase.from('customers').update({ visits: 0, completed_at: null }).not('phone', 'is', null);
        if (error) throw error;

        showAlert(t('common.success'), t('loyalty.wipedMsg'));
      } catch (err) {
        showAlert(t('admin.dbError'), t('admin.dbResetFailPrefix') + err.message);
      } finally {
        setIsSaving(false);
      }
    });
  };

  // --- CASHIER MANAGEMENT (NOW CLOUD SYNCED) ---
  // Cashiers (and their PINs) are seeded during onboarding — no hardcoded
  // defaults, so a fresh store never ships with a guessable Admin/1234.
  const cashiers = menuData?.cashiers || [];

  // `role` is the source of truth ('employee' | 'manager' | 'admin').
  // `isAdmin` is kept in sync (role === 'admin') so legacy reads keep working.
  const [newCashier, setNewCashier] = useState({ name: '', pin: '', role: 'employee' });

  // --- CASHIER FUNCTIONS ---
  const handleAddCashier = async () => {
    if (!newCashier.name || newCashier.pin.length !== 4) {
      return showAlert(t('team.invalidInfoTitle'), t('team.invalidInfoDesc'));
    }

    const role = newCashier.role || 'employee';
    const updatedMenu = { ...menuData };
    const newEntry = {
      id: Date.now(),
      name: newCashier.name,
      pin: newCashier.pin,
      role,
      isAdmin: role === 'admin', // legacy mirror; kept in sync on every write
    };

    // 1. Persist the cashier in menu_data so the UI sees them.
    updatedMenu.cashiers.push(newEntry);
    saveSettingsToCloud(updatedMenu);

    // 2. Hash + upsert the PIN into cashier_pins. Without this row the
    //    verify_pin RPC returns false and the cashier can't log into their
    //    own profile — only admin override PINs would work.
    const { error: pinErr } = await supabase.rpc('set_cashier_pin', {
      p_cashier_id: newEntry.id,
      p_pin: newCashier.pin,
    });
    if (pinErr) {
      showAlert(t('common.error'), pinErr.message);
      // Don't return — the cashier row is already saved. Surface the error so
      // the admin can retry, but keep state consistent.
    }

    // LOG ACTIVITY
    logActivity('cashier_added', null, { name: newCashier.name, cashierId: newEntry.id, role });

    setNewCashier({ name: '', pin: '', role: 'employee' }); // Reset form
  };

  const handleDeleteCashier = (idToRemove) => {
    if (cashiers.length <= 1) return showAlert(t('common.error'), t('team.cannotDeleteLast'));

    showConfirm(t('team.deleteCashierTitle'), t('team.deleteCashierDesc'), async () => {
      const cashierToDelete = cashiers.find(c => c.id === idToRemove);
      const updatedCashiers = cashiers.filter(c => c.id !== idToRemove);
      saveSettingsToCloud({ ...menuData, cashiers: updatedCashiers });

      // Don't leak the stored hash for someone who no longer exists.
      const { error: delErr } = await supabase.rpc('delete_cashier_pin', { p_cashier_id: idToRemove });
      if (delErr) console.warn('Could not delete cashier_pins row:', delErr);

      // LOG ACTIVITY
      if (cashierToDelete) {
        logActivity('cashier_removed', null, { name: cashierToDelete.name });
      }
    });

  };


  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (menuData.categories[name]) {
      return showAlert(t('menu.alertConflictTitle'), t('menu.alertConflictDesc'));
    }
    const updatedMenu = {
      ...menuData,
      categories: { ...menuData.categories, [name]: [] },
      categoryOrder: [...(menuData.categoryOrder || []), name]
    };
    setNewCategoryName("");
    runMenuWrite(updatedMenu, () => addCategory(name));
  };

  const handleRenameCategory = (oldName, newName) => {
    if (!newName || !newName.trim() || newName === oldName) return;
    if (menuData.categories[newName]) {
      return showAlert(t('menu.alertConflictTitle'), t('menu.alertConflictDesc'));
    }
    // Preserve insertion order in the categories map by rebuilding it.
    const newCategories = {};
    Object.keys(menuData.categories).forEach(key => {
      newCategories[key === oldName ? newName : key] = menuData.categories[key];
    });
    const updatedMenu = {
      ...menuData,
      categories: newCategories,
      categoryOrder: (menuData.categoryOrder || []).map(c => c === oldName ? newName : c),
      hiddenCategories: (menuData.hiddenCategories || []).map(c => c === oldName ? newName : c)
    };
    runMenuWrite(updatedMenu, () => renameCategory(oldName, newName));
  };

  // Reorder a category up (-1) or down (+1) in the register tab order.
  const handleMoveCategory = (categoryName, direction) => {
    const allCats = Object.keys(menuData.categories || {});
    const existingOrder = Array.isArray(menuData.categoryOrder) ? menuData.categoryOrder : [];
    const fullOrder = [
      ...existingOrder.filter(c => allCats.includes(c)),
      ...allCats.filter(c => !existingOrder.includes(c)),
    ];
    const idx = fullOrder.indexOf(categoryName);
    const newIdx = idx + direction;
    if (idx < 0 || newIdx < 0 || newIdx >= fullOrder.length) return;
    [fullOrder[idx], fullOrder[newIdx]] = [fullOrder[newIdx], fullOrder[idx]];
    const updatedMenu = { ...menuData, categoryOrder: fullOrder };
    runMenuWrite(updatedMenu, () => reorderCategories(fullOrder));
  };

  const handleToggleCategoryVisibility = (categoryName) => {
    const hidden = new Set(menuData.hiddenCategories || []);
    const willBeHidden = !hidden.has(categoryName);
    if (willBeHidden) hidden.add(categoryName);
    else hidden.delete(categoryName);
    const updatedMenu = { ...menuData, hiddenCategories: [...hidden] };
    runMenuWrite(updatedMenu, () => setCategoryHidden(categoryName, willBeHidden));
  };

  // Public-menu-only category hide — independent of the Register hide above.
  // Filtered server-side by the public-menu RPCs via menu_categories.public_hidden.
  const handleToggleCategoryPublicVisibility = (categoryName) => {
    const hidden = new Set(menuData.publicHiddenCategories || []);
    const willBeHidden = !hidden.has(categoryName);
    if (willBeHidden) hidden.add(categoryName);
    else hidden.delete(categoryName);
    const updatedMenu = { ...menuData, publicHiddenCategories: [...hidden] };
    runMenuWrite(updatedMenu, () => setCategoryPublicHidden(categoryName, willBeHidden));
  };

  const handleToggleModifierGroupMulti = (groupKey) => {
    const current = !!menuData.modifierGroupSettings?.[groupKey]?.allowMultiple;
    const next = !current;
    const updatedMenu = {
      ...menuData,
      modifierGroupSettings: {
        ...(menuData.modifierGroupSettings || {}),
        [groupKey]: { ...(menuData.modifierGroupSettings?.[groupKey] || {}), allowMultiple: next }
      }
    };
    runMenuWrite(updatedMenu, () => setModifierGroupAllowMultiple(groupKey, next));
  };

  // Hide/show a whole modifier group everywhere (public menu + Register).
  const handleToggleModifierGroupHidden = (groupKey) => {
    const current = !!menuData.modifierGroupSettings?.[groupKey]?.isHidden;
    const next = !current;
    const updatedMenu = {
      ...menuData,
      modifierGroupSettings: {
        ...(menuData.modifierGroupSettings || {}),
        [groupKey]: { ...(menuData.modifierGroupSettings?.[groupKey] || {}), isHidden: next }
      }
    };
    runMenuWrite(updatedMenu, () => setModifierGroupHidden(groupKey, next));
  };

  // Hide/show a single menu item from the Register (POS) grid only.
  const handleToggleDrinkVisibility = (categoryName, drinkId) => {
    const items = menuData.categories?.[categoryName] || [];
    const target = items.find(d => d.id === drinkId);
    if (!target) return;
    const next = !target.isHidden;
    const updatedMenu = {
      ...menuData,
      categories: {
        ...menuData.categories,
        [categoryName]: items.map(d => d.id === drinkId ? { ...d, isHidden: next } : d)
      }
    };
    runMenuWrite(updatedMenu, () => setItemHidden(drinkId, next));
  };

  // Hide/show a single item from the PUBLIC menu only — independent of the
  // Register hide above. `publicHidden` lives in the item's data jsonb, so it
  // round-trips through updateItem's residual spread (same path as the roast
  // date / WhatsApp public fields); the public-menu RPCs filter on it.
  const handleToggleDrinkPublicVisibility = (categoryName, drinkId) => {
    const items = menuData.categories?.[categoryName] || [];
    const target = items.find(d => d.id === drinkId);
    if (!target) return;
    const next = !target.publicHidden;
    const updatedItem = { ...target, publicHidden: next };
    const updatedMenu = {
      ...menuData,
      categories: {
        ...menuData.categories,
        [categoryName]: items.map(d => d.id === drinkId ? updatedItem : d)
      }
    };
    runMenuWrite(updatedMenu, () => updateItem(drinkId, updatedItem), 'menu-item-public-visibility');
  };

  const resetItemForm = () => {
    setNewItemForm(prev => ({
      ...prev,
      name: "",
      price: "",
      priceType: 'fixed',
      emoji: '☕',
      ivaTreatment: 'tasa0',
      inventoryMode: 'none',
      linkedWarehouseId: '',
      linkedRecipeId: '',
      vendorId: '',
      vendorUnitCost: ''
    }));
  };

  // --- VENDOR REGISTRY HANDLERS ---
  const refreshVendors = async () => {
    try { setVendors(await loadVendors()); } catch (e) { console.warn('refreshVendors failed', e.message); }
  };
  const handleAddVendor = async (vendor) => { await addVendor(vendor); await refreshVendors(); };
  const handleUpdateVendor = async (id, patch) => { await updateVendor(id, patch); await refreshVendors(); };
  const handleDeleteVendor = async (id) => { await deleteVendor(id); await refreshVendors(); };

  // Resolve the { vendorId, vendorName } pair to stamp on a menu item from the
  // form's selected vendor. Denormalizing the name keeps the sale-line snapshot
  // (and historic settlement reports) readable even if the vendor is later renamed.
  const vendorFieldsForForm = () => {
    const vendorId = newItemForm.vendorId || '';
    const vendorName = vendorId
      ? (vendors.find(v => String(v.id) === String(vendorId))?.name || '')
      : '';
    // Production cost the house recovers under a cost-recovery split. Snapshotted
    // onto each sale line (via the cart spread) so settlement stays correct even
    // if the cost is later edited. Only meaningful when a vendor is assigned.
    const vendorUnitCostCents = vendorId ? toCents(newItemForm.vendorUnitCost || 0) : 0;
    return { vendorId, vendorName, vendorUnitCostCents };
  };

  const handleAddDrink = () => {
    if (!newItemForm.category || !newItemForm.name || !newItemForm.price) {
      return showAlert(t('menu.missingFieldsTitle'), t('menu.missingFieldsDesc'));
    }

    if (editingItemId) {
      let oldCategory = null;
      let existing = null;
      Object.keys(menuData.categories).forEach(cat => {
        const found = menuData.categories[cat].find(d => d.id === editingItemId);
        if (found) { oldCategory = cat; existing = found; }
      });
      if (!oldCategory || !existing) {
        return showAlert(t('menu.alertErrorTitle'), t('menu.alertItemNotFound'));
      }

      const updatedItem = {
        ...existing,
        name: newItemForm.name,
        basePrice: toCents(newItemForm.price || 0),
        priceType: newItemForm.priceType || 'fixed',
        emoji: newItemForm.emoji || '',
        ivaTreatment: newItemForm.ivaTreatment || 'tasa0',
        inventoryMode: newItemForm.inventoryMode || 'none',
        linkedWarehouseId: newItemForm.linkedWarehouseId || '',
        linkedRecipeId: newItemForm.linkedRecipeId || '',
        ...vendorFieldsForForm()
      };

      const newCategories = { ...menuData.categories };
      if (oldCategory === newItemForm.category) {
        newCategories[oldCategory] = newCategories[oldCategory].map(d =>
          d.id === editingItemId ? updatedItem : d
        );
      } else {
        newCategories[oldCategory] = newCategories[oldCategory].filter(d => d.id !== editingItemId);
        newCategories[newItemForm.category] = [
          ...(newCategories[newItemForm.category] || []),
          updatedItem
        ];
      }
      const updatedMenu = { ...menuData, categories: newCategories };

      const movedCategory = oldCategory === newItemForm.category ? undefined : newItemForm.category;
      runMenuWrite(updatedMenu, () => updateItem(editingItemId, updatedItem, movedCategory));

      logActivity('menu_item_updated', null, { name: updatedItem.name });

      setEditingItemId(null);
      resetItemForm();
      return;
    }

    const newDrink = {
      id: newItemForm.name.toLowerCase().replace(/\s+/g, '_'),
      name: newItemForm.name,
      basePrice: toCents(newItemForm.price || 0),
      priceType: newItemForm.priceType || 'fixed',
      emoji: newItemForm.emoji || '',
      ivaTreatment: newItemForm.ivaTreatment || 'tasa0',
      allowedModifiers: [],
      inventoryMode: newItemForm.inventoryMode || 'none',
      linkedWarehouseId: newItemForm.linkedWarehouseId || '',
      linkedRecipeId: newItemForm.linkedRecipeId || '',
      ...vendorFieldsForForm()
    };
    const updatedMenu = {
      ...menuData,
      categories: {
        ...menuData.categories,
        [newItemForm.category]: [...(menuData.categories[newItemForm.category] || []), newDrink]
      }
    };

    runMenuWrite(updatedMenu, () => addItem(newItemForm.category, newDrink));
    useUpgradeNagStore.getState().trigger('items_added');

    logActivity('menu_item_added', null, {
      name: newItemForm.name,
      category: newItemForm.category,
      price: toCents(newItemForm.price)
    });

    resetItemForm();
  };

  const handleAddModifierGroup = () => {
    if (!newModGroupName.trim()) return;
    const groupKey = newModGroupName.toLowerCase().replace(/\s+/g, '_');
    if (menuData.modifierGroups[groupKey]) { setNewModGroupName(""); return; }
    const updatedMenu = {
      ...menuData,
      modifierGroups: { ...menuData.modifierGroups, [groupKey]: [] },
      modifierGroupSettings: {
        ...(menuData.modifierGroupSettings || {}),
        [groupKey]: { allowMultiple: false }
      }
    };
    setNewModGroupName("");
    runMenuWrite(updatedMenu, () => addModifierGroup(groupKey, groupKey));
  };

  const handleAddModifierOption = () => {
    if (!newModOption.groupKey || !newModOption.name || (!newModOption.isTextInput && newModOption.price === "")) {
      return showAlert(t('menu.missingFieldsTitle'), t('menu.missingFieldsDesc'));
    }

    const newOption = {
      id: newModOption.name.toLowerCase().replace(/\s+/g, '_'),
      name: newModOption.name,
      price: newModOption.isTextInput ? 0 : toCents(newModOption.price),
      isTextInput: newModOption.isTextInput,
      deductionTarget: newModOption.deductionTarget || null,
      deductionTargetId: newModOption.deductionTargetId || null,
      substitutionTarget: newModOption.substitutionTarget || null,
      substitutionTargetId: newModOption.substitutionTargetId || null
    };

    const updatedMenu = {
      ...menuData,
      modifierGroups: {
        ...menuData.modifierGroups,
        [newModOption.groupKey]: [...menuData.modifierGroups[newModOption.groupKey], newOption]
      }
    };
    runMenuWrite(updatedMenu, () => addModifierOption(newModOption.groupKey, newOption));

    setNewModOption({
      groupKey: newModOption.groupKey,
      name: "",
      price: "0",
      isTextInput: false,
      deductionTarget: "",
      deductionTargetId: "",
      substitutionTarget: "",
      substitutionTargetId: ""
    });
  };

  const toggleModifierForDrink = (modGroupKey) => {
    const categoryName = editingDrink.categoryName;
    const drinkId = editingDrink.drink.id;
    const currentDrink = menuData.categories[categoryName].find(d => d.id === drinkId);
    if (!currentDrink) return;

    const hasModifier = (currentDrink.allowedModifiers || []).includes(modGroupKey);
    const nextAllowed = hasModifier
      ? currentDrink.allowedModifiers.filter(k => k !== modGroupKey)
      : [...(currentDrink.allowedModifiers || []), modGroupKey];

    const updatedDrink = { ...currentDrink, allowedModifiers: nextAllowed };
    const updatedMenu = {
      ...menuData,
      categories: {
        ...menuData.categories,
        [categoryName]: menuData.categories[categoryName].map(d => d.id === drinkId ? updatedDrink : d)
      }
    };
    setEditingDrink({ ...editingDrink, drink: updatedDrink });
    runMenuWrite(updatedMenu, () => setItemModifiers(drinkId, nextAllowed));
  };

  const handleUpdateModifierOption = (groupKey, oldOptionId, updatedOpt) => {
    if (!updatedOpt.name || (!updatedOpt.isTextInput && updatedOpt.price === "")) {
      return showAlert(t('menu.missingFieldsTitle'), t('menu.missingFieldsDesc'));
    }
    const optionIndex = menuData.modifierGroups[groupKey].findIndex(o => o.id === oldOptionId);
    if (optionIndex === -1) return;

    const nextOpt = {
      id: updatedOpt.name.toLowerCase().replace(/\s+/g, '_'),
      name: updatedOpt.name,
      price: updatedOpt.isTextInput ? 0 : toCents(updatedOpt.price),
      isTextInput: updatedOpt.isTextInput,
      deductionTarget: updatedOpt.deductionTarget || null,
      deductionTargetId: updatedOpt.deductionTargetId || null,
      substitutionTarget: updatedOpt.substitutionTarget || null,
      substitutionTargetId: updatedOpt.substitutionTargetId || null
    };
    const newOptions = [...menuData.modifierGroups[groupKey]];
    newOptions[optionIndex] = nextOpt;
    const updatedMenu = {
      ...menuData,
      modifierGroups: { ...menuData.modifierGroups, [groupKey]: newOptions }
    };
    runMenuWrite(updatedMenu, () => updateModifierOption(oldOptionId, groupKey, nextOpt));

    setNewModOption({ groupKey: "", name: "", price: "0", isTextInput: false, deductionTarget: "", deductionTargetId: "", substitutionTarget: "", substitutionTargetId: "" });
  };

  // Renames a modifier group's slug id. ON UPDATE CASCADE on the FK keeps options
  // and item attachments in sync server-side; we mirror that locally by remapping
  // allowedModifiers on every item and moving the group + settings keys.
  const handleRenameModifierGroup = (oldKey, newKey) => {
    if (!newKey.trim()) return;
    const formattedNewKey = newKey.toLowerCase().replace(/\s+/g, '_');
    if (oldKey === formattedNewKey) return;

    if (menuData.modifierGroups[formattedNewKey]) {
      return showAlert(t('common.error'), t('mods.errorGroupExists'));
    }

    const newGroups = { ...menuData.modifierGroups };
    newGroups[formattedNewKey] = newGroups[oldKey];
    delete newGroups[oldKey];

    const newGroupSettings = { ...(menuData.modifierGroupSettings || {}) };
    if (newGroupSettings[oldKey]) {
      newGroupSettings[formattedNewKey] = newGroupSettings[oldKey];
      delete newGroupSettings[oldKey];
    }

    const newCategories = {};
    Object.keys(menuData.categories).forEach(cat => {
      newCategories[cat] = menuData.categories[cat].map(drink => ({
        ...drink,
        allowedModifiers: Array.isArray(drink.allowedModifiers)
          ? drink.allowedModifiers.map(k => k === oldKey ? formattedNewKey : k)
          : (drink.allowedModifiers || [])
      }));
    });

    const updatedMenu = {
      ...menuData,
      modifierGroups: newGroups,
      modifierGroupSettings: newGroupSettings,
      categories: newCategories
    };
    runMenuWrite(updatedMenu, () => renameModifierGroup(oldKey, formattedNewKey, formattedNewKey));
  };

  const handleDeleteDrink = (categoryName, drinkId, drinkName) => {
    showConfirm(t('menu.deleteDrinkTitle'), `${t('menu.deleteDrinkDesc')} (${drinkName})`, () => {
      const updatedMenu = {
        ...menuData,
        categories: {
          ...menuData.categories,
          [categoryName]: menuData.categories[categoryName].filter(drink => drink.id !== drinkId)
        }
      };
      runMenuWrite(updatedMenu, () => deleteItem(drinkId));
      logActivity('menu_item_deleted', null, { name: drinkName });
    });
  };

  const handleDeleteCategory = (categoryName) => {
    if (menuData.categories[categoryName].length > 0) return showAlert(t('common.error'), `${t('menu.deleteCategoryHasItems')} (${categoryName})`);

    showConfirm(t('menu.deleteCategoryTitle'), `${t('menu.deleteCategoryDesc')} (${categoryName})`, () => {
      const newCategories = { ...menuData.categories };
      delete newCategories[categoryName];
      const updatedMenu = {
        ...menuData,
        categories: newCategories,
        categoryOrder: (menuData.categoryOrder || []).filter(c => c !== categoryName),
        hiddenCategories: (menuData.hiddenCategories || []).filter(c => c !== categoryName)
      };
      runMenuWrite(updatedMenu, () => deleteCategory(categoryName));
    });
  };

  // Deletes a modifier group. FK cascades server-side wipe options + item links;
  // we mirror the item-link removal locally by scrubbing allowedModifiers.
  const handleDeleteModifierGroup = (groupKey) => {
    showConfirm(
      t('menu.deleteModGroupTitle'),
      `${t('menu.deleteModGroupDesc')} (${groupKey.replace('_', ' ')})`,
      () => {
        const newGroups = { ...menuData.modifierGroups };
        delete newGroups[groupKey];
        const newGroupSettings = { ...(menuData.modifierGroupSettings || {}) };
        delete newGroupSettings[groupKey];

        const newCategories = {};
        Object.keys(menuData.categories).forEach(cat => {
          newCategories[cat] = menuData.categories[cat].map(item => ({
            ...item,
            allowedModifiers: (item.allowedModifiers || []).filter(mod => mod !== groupKey)
          }));
        });

        const updatedMenu = {
          ...menuData,
          modifierGroups: newGroups,
          modifierGroupSettings: newGroupSettings,
          categories: newCategories
        };
        runMenuWrite(updatedMenu, () => deleteModifierGroup(groupKey));
      }
    );
  };

  const handleDeleteModifierOption = (groupKey, optionId, optionName) => {
    showConfirm(t('menu.deleteModOptionTitle'), `${t('menu.deleteModOptionDesc')} (${optionName})`, () => {
      const updatedMenu = {
        ...menuData,
        modifierGroups: {
          ...menuData.modifierGroups,
          [groupKey]: menuData.modifierGroups[groupKey].filter(opt => opt.id !== optionId)
        }
      };
      runMenuWrite(updatedMenu, () => deleteModifierOption(groupKey, optionId));
    });
  };

  // Discount rule handlers. In-memory rules carry both a legacy `id` (Date.now()
  // used by the UI for keying) and a `_id` (the db PK used for update/delete).
  // After add(), we patch the new row's `_id` into local state so the user can
  // immediately toggle or delete the rule without a reload.
  // Note: useMenuStore's setMenuData does JSON.parse(JSON.stringify(data))
  // for PIN scrubbing, which means it can't accept a functional updater
  // (JSON.stringify(fn) → "undefined" → parse error). We pull the latest
  // state from the store imperatively to avoid stale closures across the
  // await boundary instead.
  const handleAddDiscountRule = async (rule) => {
    const baseMenu = useMenuStore.getState().menuData || menuData;
    setMenuData({ ...baseMenu, discountRules: [...(baseMenu.discountRules || []), rule] });
    setIsSaving(true);
    try {
      const newDbId = await addDiscountRule(rule);
      const latest = useMenuStore.getState().menuData || {};
      setMenuData({
        ...latest,
        discountRules: (latest.discountRules || []).map(r =>
          r.id === rule.id ? { ...r, _id: newDbId } : r
        )
      });
    } catch (err) {
      showAlert(t('common.error'), t('admin.cloudSaveFailPrefix') + err.message);
      await reloadMenuFromCloud();
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDiscountRule = (rule) => {
    if (!rule._id) return;
    const next = !rule.isActive;
    const updatedMenu = {
      ...menuData,
      discountRules: (menuData.discountRules || []).map(r =>
        r.id === rule.id ? { ...r, isActive: next } : r
      )
    };
    runMenuWrite(updatedMenu, () => updateDiscountRule(rule._id, { ...rule, isActive: next }));
  };

  const handleDeleteDiscountRule = (rule) => {
    if (!rule._id) return;
    const updatedMenu = {
      ...menuData,
      discountRules: (menuData.discountRules || []).filter(r => r.id !== rule.id)
    };
    runMenuWrite(updatedMenu, () => deleteDiscountRule(rule._id));
  };

  // --- OPTIMIZED ANALYTICS CALCULATIONS ---
  // 1. Filter the raw data based on the selected timeframe
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dexieSales = useLiveQuery(() => db.sales.toArray(), []) || [];
  const vendorPayouts = useLiveQuery(() => db.vendor_payouts.orderBy('created_at').reverse().toArray(), []) || [];
  const tipPayouts = useLiveQuery(() => db.tip_payouts.toArray(), []) || [];

  const filteredSales = useMemo(() => {
    const now = new Date();
    return dexieSales.filter(sale => {
      if (timeFilter === 'all') return true;

      const saleDate = new Date(sale.created_at);

      if (timeFilter === 'custom') {
        if (!dateRange.start || !dateRange.end) return true; // Show all until both are selected
        const start = new Date(dateRange.start);
        start.setHours(0, 0, 0, 0); // Start of day
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999); // End of day
        return saleDate >= start && saleDate <= end;
      }

      // FIX 1: Strict calendar-day matching instead of "24 hours ago"
      if (timeFilter === 'today') {
        return saleDate.toDateString() === now.toDateString();
      }

      const daysDifference = (now - saleDate) / (1000 * 60 * 60 * 24);
      if (timeFilter === 'week') return daysDifference <= 7;
      if (timeFilter === 'month') return daysDifference <= 30;
      if (timeFilter === '6months') return daysDifference <= 180;
      if (timeFilter === 'year') return daysDifference <= 365;
      return true;
    });
  }, [dexieSales, timeFilter, dateRange]); // FIX 2: Listens to dexieSales instead of static salesData

  // 2. Calculate Total Revenue
  const totalRevenue = useMemo(() => {
    return filteredSales.reduce((sum, sale) => {
      const amount = Number(sale.total_amount) || 0;
      const refund = Number(sale.refund_amount) || 0;
      if (sale.status === 'refunded') return sum;
      return sum + (amount - refund);
    }, 0);
  }, [filteredSales]);

  const totalRefunds = useMemo(() => {
    return filteredSales.reduce((sum, sale) => {
      if (sale.status === 'refunded') return sum + Number(sale.total_amount);
      if (sale.status === 'partial_refund') return sum + Number(sale.refund_amount || 0);
      return sum;
    }, 0);
  }, [filteredSales]);

  const filteredExpenses = useMemo(() => {
    const now = new Date();
    return expenses.filter(exp => {
      if (timeFilter === 'all') return true;

      // Check both potential date fields
      const dateStr = exp.created_at || exp.timestamp;
      if (!dateStr) return false;
      const expDate = new Date(dateStr);

      if (timeFilter === 'custom') {
        if (!dateRange.start || !dateRange.end) return true; // Show all until both are selected
        const start = new Date(dateRange.start);
        start.setHours(0, 0, 0, 0); // Start of day
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999); // End of day
        return expDate >= start && expDate <= end;
      }

      if (timeFilter === 'today') {
        return expDate.toDateString() === now.toDateString();
      }

      const daysDifference = (now - expDate) / (1000 * 60 * 60 * 24);
      if (timeFilter === 'week') return daysDifference <= 7;
      if (timeFilter === 'month') return daysDifference <= 30;
      if (timeFilter === '6months') return daysDifference <= 180;
      if (timeFilter === 'year') return daysDifference <= 365;
      return true;
    });
  }, [expenses, timeFilter, dateRange]);

  const totalExpenses = useMemo(() => {
    // Exclude inventory-purchase bookkeeping rows. They represent stock asset
    // transfers that COGS already recognizes when the items are sold, so
    // counting them here too would double-subtract every restock dollar from
    // Net Profit. Two prefixes exist: "Inventory Purchase:" (new item) and
    // "RESTOCK:" (existing item) — both written by InventoryTab.
    return filteredExpenses
      .filter(exp => {
        const r = exp.reason || '';
        return !r.startsWith('RESTOCK:') && !r.startsWith('Inventory Purchase:');
      })
      .reduce((sum, exp) => sum + exp.amount, 0);
  }, [filteredExpenses]);

  // 3. Count Payment Methods
  const methodCounts = useMemo(() => {
    return filteredSales.reduce((acc, sale) => {
      acc[sale.payment_method] = (acc[sale.payment_method] || 0) + 1;
      return acc;
    }, {});
  }, [filteredSales]);

  // Revenue split by tender — Cash / Card / Transfer — so the admin can
  // reconcile each channel against drawer count, terminal totals, and bank.
  // Mirrors the shift-corte math: full refunds drop out, partial refunds
  // subtract from their tender, and Split sales attribute each leg.
  const salesByMethod = useMemo(() => {
    const tenders = ['Cash', 'Card', 'Transfer'];
    const totals = Object.fromEntries(tenders.map(m => [m, { amount: 0, count: 0 }]));
    filteredSales.forEach(sale => {
      if (sale.status === 'refunded') return;
      const net = (sale.total_amount || 0) - (sale.status === 'partial_refund' ? (sale.refund_amount || 0) : 0);
      if (sale.payment_method === 'Split' && Array.isArray(sale.splits)) {
        sale.splits.forEach(s => {
          if (totals[s.method]) {
            totals[s.method].amount += Number(s.amount) || 0;
            totals[s.method].count += 1;
          }
        });
        return;
      }
      if (totals[sale.payment_method]) {
        totals[sale.payment_method].amount += net;
        totals[sale.payment_method].count += 1;
      }
    });
    return totals;
  }, [filteredSales]);

  // 4. Find Top Items
  const topItemsArray = useMemo(() => {
    const itemCounts = {};
    filteredSales.forEach(sale => {
      if (sale.items_sold && Array.isArray(sale.items_sold)) {
        sale.items_sold.forEach(itemName => {
          itemCounts[itemName] = (itemCounts[itemName] || 0) + 1;
        });
      }
    });
    return Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filteredSales]);

  // 3. The Multi-Tab Excel Exporter Function
  const handleDownloadCSV = () => {
    if (filteredSales.length === 0 && filteredExpenses.length === 0 && inventoryLogs.length === 0) {
      return showAlert(t('common.error'), t('analytics.noDataExport'));

    }

    const now = new Date();

    // --- A. Sheet 1: Ingresos (Sales & Refunds) ---
    const ingresosData = [];
    filteredSales.forEach(sale => {
      const dateObj = new Date(sale.created_at);
      const date = dateObj.toLocaleDateString();
      const time = dateObj.toLocaleTimeString();
      const method = sale.payment_method || 'N/A';
      const items = sale.items_sold ? sale.items_sold.join(' | ') : 'Varios';

      if (sale.status === 'refunded') {
        ingresosData.push({ Fecha: date, Hora: time, 'Tipo de Movimiento': 'Reembolso Total', Monto: -fromCents(sale.total_amount || 0), Método: method, Detalles: items });
      } else if (sale.status === 'partial_refund') {
        ingresosData.push({ Fecha: date, Hora: time, 'Tipo de Movimiento': 'Venta', Monto: fromCents(sale.total_amount || 0), Método: method, Detalles: items });
        ingresosData.push({ Fecha: date, Hora: time, 'Tipo de Movimiento': 'Reembolso Parcial', Monto: -fromCents(sale.refund_amount || 0), Método: method, Detalles: 'Ajuste de ticket' });
      } else {
        ingresosData.push({ Fecha: date, Hora: time, 'Tipo de Movimiento': 'Venta', Monto: fromCents(sale.total_amount || 0), Método: method, Detalles: items });
      }
    });

    // --- B. Sheet 2: Egresos (Expenses) ---
    const egresosData = [];
    filteredExpenses.forEach(exp => {
      const dateObj = new Date(exp.created_at || exp.timestamp);
      egresosData.push({
        Fecha: dateObj.toLocaleDateString(),
        Hora: dateObj.toLocaleTimeString(),
        'Tipo de Movimiento': exp.category ? `Gasto (${exp.category})` : 'Gasto (General)',
        Monto: -fromCents(exp.amount || 0),
        Método: 'Caja/Efectivo',
        Detalles: exp.reason || 'Sin detalles'
      });
    });

    // --- C. Sheet 3: Auditorías / Mermas ---
    const auditoriaData = [];
    const filteredLogs = inventoryLogs.filter(log => {
      if (timeFilter === 'all') return true;
      const logDate = new Date(log.created_at);

      if (timeFilter === 'custom') {
        if (!dateRange.start || !dateRange.end) return true;
        const start = new Date(dateRange.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999);
        return logDate >= start && logDate <= end;
      }

      if (timeFilter === 'today') return logDate.toDateString() === now.toDateString();
      const daysDiff = (now - logDate) / (1000 * 60 * 60 * 24);
      if (timeFilter === 'week') return daysDiff <= 7;
      if (timeFilter === 'month') return daysDiff <= 30;
      if (timeFilter === '6months') return daysDiff <= 180;
      if (timeFilter === 'year') return daysDiff <= 365;
      return true;
    });

    filteredLogs.forEach(log => {
      const dateObj = new Date(log.created_at);
      auditoriaData.push({
        Fecha: dateObj.toLocaleDateString(),
        Hora: dateObj.toLocaleTimeString(),
        'Tipo de Movimiento': 'Auditoría / Merma',
        Monto: 0.00, // Operational tracking
        Método: 'N/A',
        Detalles: `${log.item_name} | Ajuste: ${log.qty_deducted} | Razón: ${log.deduction_type}`
      });
    });

    // --- D. Sheet 0: Resumen (Summary) ---
    // Use the same engine as AnalyticsTab so the Excel Resumen can't drift from
    // what the user sees on screen.
    const { totalCOGS, totalWastage } = computeCogsAndWastage({
      filteredSales, inventoryLogs, inventoryItems, timeFilter, dateRange
    });

    const trueNetProfitInPesos = fromCents(totalRevenue) - fromCents(totalCOGS) - fromCents(totalWastage) - fromCents(totalExpenses);

    const resumenData = [
      { Métrica: 'Ingresos Brutos', Valor: fromCents(totalRevenue + totalRefunds) },
      { Métrica: 'Reembolsos', Valor: -fromCents(totalRefunds) },
      { Métrica: 'Ingresos Netos', Valor: fromCents(totalRevenue) },
      { Métrica: 'Costo de Bienes (COGS)', Valor: -fromCents(totalCOGS) },
      { Métrica: 'Mermas y Auditorías', Valor: -fromCents(totalWastage) },
      { Métrica: 'Gastos de Operación', Valor: -fromCents(totalExpenses) },
      { Métrica: 'Ganancia Neta Verdadera', Valor: trueNetProfitInPesos }
    ];
    // Create Worksheets
    const wsResumen = XLSX.utils.json_to_sheet(resumenData);
    const wsIngresos = XLSX.utils.json_to_sheet(ingresosData);
    const wsEgresos = XLSX.utils.json_to_sheet(egresosData);
    const wsAuditorias = XLSX.utils.json_to_sheet(auditoriaData);

    // Add Worksheets to Workbook (Resumen goes first!)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
    XLSX.utils.book_append_sheet(wb, wsIngresos, "Ingresos");
    XLSX.utils.book_append_sheet(wb, wsEgresos, "Egresos");
    XLSX.utils.book_append_sheet(wb, wsAuditorias, "Auditorías");

    // Generate Excel file and trigger download
    XLSX.writeFile(wb, `tinypos_reporte_maestro_${timeFilter}.xlsx`);
  };

  // --- ADVANCED RECIPE BUILDER LOGIC ---
  const handleCreateDraftRecipe = () => {
    setActiveRecipe({
      id: `draft_${Date.now()}`,
      name: "New Recipe Draft",
      linked_menu_item: "",
      target_margin: 25.0,
      custom_price: "",
      ingredients: [],
      isDraft: true
    });
  };

  const handleAddIngredient = () => {
    if (!activeRecipe) return;
    const newIngredient = { id: `ing_${Date.now()}`, name: "", cost: "", qty: "" };
    setActiveRecipe({ ...activeRecipe, ingredients: [...activeRecipe.ingredients, newIngredient] });
  };

  const handleUpdateIngredient = (ingId, field, value) => {
    if (!activeRecipe) return;
    const updatedIngredients = activeRecipe.ingredients.map(ing =>
      ing.id === ingId ? { ...ing, [field]: value } : ing
    );
    setActiveRecipe({ ...activeRecipe, ingredients: updatedIngredients });
  };

  const handleDeleteIngredient = (ingId) => {
    if (!activeRecipe) return;
    const updatedIngredients = activeRecipe.ingredients.filter(ing => ing.id !== ingId);
    setActiveRecipe({ ...activeRecipe, ingredients: updatedIngredients });
  };

  const handleSaveRecipeToCloud = async () => {
    if (!activeRecipe) return;
    if (!activeRecipe.name.trim()) return showAlert(t('common.error'), t('recipe.validateNameRequired'));

    setIsSaving(true);
    try {
      // Clean up local-only UI flags and sanitize empty strings to null for PostgreSQL numerics
      const recipeToSave = { ...activeRecipe };

      if (recipeToSave.isDraft) {
        delete recipeToSave.id; // Supabase will assign a real gen_random_uuid()
        delete recipeToSave.isDraft;
      }

      // FIX: Database throws 22P02 if we try to shove "" into a numeric column
      if (recipeToSave.custom_price === "" || isNaN(recipeToSave.custom_price)) {
        recipeToSave.custom_price = null;
      } else {
        recipeToSave.custom_price = toCents(recipeToSave.custom_price);
      }

      const { data, error } = await supabase.from('recipes').upsert(recipeToSave).select().single();
      if (error) throw error;

      // Convert the returned DB integer back to a decimal string so the UI doesn't jump to cents
      if (data.custom_price) {
        data.custom_price = fromCents(data.custom_price).toString();
      }

      if (error) throw error;

      // Update local state organically using the direct 'recipes' variable
      const existing = recipes.find(r => r.id === activeRecipe.id);
      if (existing) {
        setRecipes(recipes.map(r => r.id === activeRecipe.id ? data : r));
      } else {
        // It was a draft, unshift it to the top
        setRecipes([data, ...recipes.filter(r => r.id !== activeRecipe.id)]);
      }

      // Switch active recipe to the formalized UUID instance
      setActiveRecipe(data);
      showAlert(t('common.success'), t('recipe.saveSuccessDesc'));

    } catch (err) {
      console.error(err);
      showAlert(t('admin.dbError'), err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecipe = async (recipeId) => {
    showConfirm(t('recipe.deleteTitle'), t('recipe.deleteDesc'), async () => {
      setIsSaving(true);
      try {
        const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
        if (error) throw error;

        setRecipes(recipes.filter(r => r.id !== recipeId));
        if (activeRecipe?.id === recipeId) setActiveRecipe(null);
        showAlert(t('common.success'), t('recipe.deleteSuccessDesc'));
      } catch (err) {
        showAlert(t('common.error'), err.message);
      } finally {
        setIsSaving(false);
      }
    });
  };

  // While the session check is in flight, render a neutral loader. Without
  // this gate an already-signed-in user briefly sees the email/password
  // form between mount and getSession()'s resolution.
  if (isCheckingSession) {
    return <BootScreen posSettings={generalSettings} logo={generalSettings.appBootLogo} loadingText={t('admin.loading')} />;
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', height: '100dvh', width: '100vw', backgroundColor: 'var(--bg-main)', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div className="fade-in" style={{ background: 'var(--bg-surface)', padding: '48px', borderRadius: '32px', width: '100%', maxWidth: '450px', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', border: '1px solid var(--border)' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ width: '80px', height: '80px', background: 'var(--brand-color)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto', boxShadow: '0 10px 20px rgba(52, 152, 219, 0.3)' }}>
              <Icon icon="lucide:shield-lock" style={{ fontSize: '2.5rem', color: 'white' }} />
            </div>
            <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '900' }}>{t('admin.loginTitle')}</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>{t('admin.loginSubtitle') || 'Access the administrative dashboard'}</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:mail" />
                {t('admin.email')}
              </label>
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                style={{ padding: '16px', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }}
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:key-round" />
                {t('admin.password')}
              </label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                style={{ padding: '16px', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }}
                required
              />
            </div>
            <button type="submit" style={{ padding: '18px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '18px', cursor: 'pointer', fontWeight: '900', fontSize: '1.2rem', marginTop: '8px', boxShadow: '0 10px 25px rgba(52, 152, 219, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <Icon icon="lucide:log-in" />
              {t('admin.accessBtn')}
            </button>
            <button type="button" onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Icon icon="lucide:arrow-left" />
              {t('admin.backToRegister') || 'Back to Register'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- LOADING SCREEN ---
  if (isLoading) {
    return <BootScreen posSettings={generalSettings} logo={generalSettings.appBootLogo} loadingText={t('admin.loading')} />;
  }

  const switchTab = (tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };


  if (isAuthenticated && !isAdminUnlocked) {
    return (
      <SharedPinPad
        variant="fullscreen"
        icon="lucide:lock"
        title={t('admin.lockedTitle')}
        subtitle={t('admin.lockedSubtitle')}
        pin={adminPinInput}
        setPin={setAdminPinInput}
        error={pinError}
        setError={setPinError}
        onCancel={handleBackToRegister}
        submitText={t('admin.unlockBtn')}
        submitIcon="lucide:unlock"
        onSubmit={async () => {
          const { verifyAdminPin } = useMenuStore.getState();
          try {
            const isValid = await verifyAdminPin(adminPinInput);
            if (isValid) {
              setIsAdminUnlocked(true);
              setPinError(false);
            } else {
              setPinError(true);
              setAdminPinInput('');
            }
          } catch (err) {
            showAlert(t('admin.error'), err.message);
            setAdminPinInput('');
          }
        }}
      />
    );
  }

  return (
    <div className="admin-layout">
      <div className={`admin-overlay ${isMobileMenuOpen ? 'open' : ''}`} onClick={() => setIsMobileMenuOpen(false)}></div>

      <aside className={`admin-aside ${isMobileMenuOpen ? 'open' : ''}`}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:store" style={{ color: 'var(--brand-color)' }} />
            <span>{generalSettings.name} | admin</span>
          </h2>
          <button className="desktop-hidden" onClick={() => setIsMobileMenuOpen(false)} aria-label={t('common.close')} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', display: 'flex' }}>
            <Icon icon="lucide:x" />
          </button>
        </div>
        <nav className="admin-aside-nav" style={{ display: 'flex', flexDirection: 'column', padding: '16px 0', flex: 1, gap: '4px', overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
          {[
            { id: 'analytics', icon: 'lucide:bar-chart-3', label: t('admin.analytics') },
            { id: 'orders', icon: 'lucide:receipt', label: t('admin.orders') },
            { id: 'menu', icon: 'lucide:coffee', label: t('admin.menu') },
            { id: 'modifiers', icon: 'lucide:sparkles', label: t('admin.modifiers') },
            { id: 'calculator', icon: 'lucide:flask-conical', label: t('admin.recipe'), advancedOnly: true },
            { id: 'inventory', icon: 'lucide:database', label: t('admin.inventory'), advancedOnly: true },
            { id: 'vendors', icon: 'lucide:store', label: t('admin.vendors'), advancedOnly: true },
            { id: 'tables', icon: 'lucide:armchair', label: t('admin.tables'), advancedOnly: true },
            // Public menus (TinyMenu) need a Supabase project to publish — cloud only.
            { id: 'menus', icon: 'lucide:layout-list', label: t('admin.publicMenus'), cloudOnly: true },
            { id: 'receipt', icon: 'lucide:printer', label: t('admin.receipt') },
            { id: 'cfdi', icon: 'lucide:file-text', label: t('admin.cfdi'), cloudOnly: true },
            { id: 'discounts', icon: 'lucide:percent', label: t('admin.promotions'), advancedOnly: true },
            { id: 'loyalty', icon: 'lucide:star', label: t('admin.loyalty'), advancedOnly: true },
            // Team (server-side PINs/app_users), Devices (Management API provisioning),
            // and Activity (server feed) are meaningless on a single local device.
            { id: 'team', icon: 'lucide:users', label: t('admin.team'), cloudOnly: true },
            { id: 'devices', icon: 'lucide:tablet-smartphone', label: t('admin.devices'), cloudOnly: true },
            { id: 'tips', icon: 'lucide:wallet', label: t('admin.tips'), advancedOnly: true },
            { id: 'activity', icon: 'lucide:history', label: t('admin.activity'), advancedOnly: true, cloudOnly: true },
            { id: 'settings', icon: 'lucide:settings', label: t('admin.settings') },
          ].filter(tab => !(tab.cloudOnly && isLocalMode())).map(tab => {
            const isLocked = tab.advancedOnly && generalSettings.isAdvancedMode !== true;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (isLocked) {
                    showConfirm(t('settings.advancedLockedTitle'), t('settings.advancedLockedDesc'), () => switchTab('settings'));
                  } else {
                    switchTab(tab.id);
                  }
                }}
                style={{
                  padding: '12px 24px',
                  textAlign: 'left',
                  background: activeTab === tab.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  opacity: isLocked ? 0.45 : 1,
                  borderLeft: activeTab === tab.id ? '4px solid var(--brand-color)' : '4px solid transparent',
                  transition: 'all 0.2s'
                }}
              >
                <Icon icon={tab.icon} style={{ fontSize: '1.2rem', opacity: activeTab === tab.id ? 1 : 0.7 }} />
                <span style={{ flex: 1 }}>{tab.label}</span>
                {isLocked && (
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon icon="lucide:lock" style={{ fontSize: '0.7rem' }} />
                    {t('settings.advancedBadge')}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          {!generalSettings.isAdvancedMode && (
            <div
              onClick={() => switchTab('settings')}
              style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.08)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', border: '1px dashed rgba(255,255,255,0.2)' }}
              title={t('settings.advancedMode')}
            >
              <Icon icon="lucide:lock" style={{ fontSize: '1rem' }} />
              <span>{t('settings.liteMode')}{t('settings.advancedMode')}</span>
            </div>
          )}
          <button onClick={handleLogout} style={{ width: '100%', padding: '12px', background: 'transparent', color: '#ccc', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Icon icon="lucide:log-out" />
            <span>{t('admin.signOut')}</span>
          </button>
          <button onClick={handleBackToRegister} style={{ width: '100%', padding: '12px', background: '#bd301e', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(41, 128, 185, 0.3)' }}>
            <Icon icon="lucide:layout-dashboard" />
            <span>{t('admin.backToReg')}</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="desktop-hidden" style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
          <button className="mobile-hamburger" onClick={() => setIsMobileMenuOpen(true)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '10px', borderRadius: '10px', display: 'flex' }}>
            <Icon icon="lucide:menu" style={{ fontSize: '1.5rem', color: 'var(--text-main)' }} />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-main)' }}>{t('admin.title')}</h2>
        </div>

        {isSaving && (
          <div style={{ position: 'fixed', top: 20, right: 20, background: '#27ae60', color: 'white', padding: '12px 24px', borderRadius: '12px', fontWeight: 'bold', zIndex: 100, boxShadow: '0 10px 25px rgba(39, 174, 96, 0.4)', display: 'flex', alignItems: 'center', gap: '10px', animation: 'slideInRight 0.3s ease' }}>
            <Icon icon="lucide:check-circle" />
            <span>{t('admin.saving')}</span>
          </div>
        )}

        {/* 1. ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <AnalyticsTab
            timeFilter={timeFilter}
            setTimeFilter={setTimeFilter}
            dateRange={dateRange}
            setDateRange={setDateRange}
            handleDownloadCSV={handleDownloadCSV}
            totalRevenue={totalRevenue}
            totalExpenses={totalExpenses}
            totalRefunds={totalRefunds}
            allSales={dexieSales}
            tipPayouts={tipPayouts}
            methodCounts={methodCounts}
            salesByMethod={salesByMethod}
            topItemsArray={topItemsArray}
            filteredSales={filteredSales}

            // ADD THESE TWO NEW LINES:
            inventoryLogs={inventoryLogs}
            inventoryItems={inventoryItems}
            filteredExpenses={filteredExpenses}
          />
        )}

        {/* NEW ACTIVITY TAB */}
        {activeTab === 'activity' && (
          <ActivityTab />
        )}

        {activeTab === 'tips' && (
          <TipsTab />
        )}


        {/* 1.5 RECEIPT HISTORY / REFUNDS TAB */}
        {activeTab === 'orders' && (
          <OrdersTab
            dexieSales={filteredSales}
            generalSettings={generalSettings}
            menuData={menuData}
            timeFilter={timeFilter}
            setTimeFilter={setTimeFilter}
            dateRange={dateRange}
            setDateRange={setDateRange}
          />
        )}


        {/* Inside Admin.jsx */}
        {activeTab === 'menu' && (
          <MenuEditorTab
            menuData={menuData}
            newCategoryName={newCategoryName}
            setNewCategoryName={setNewCategoryName}
            handleAddCategory={handleAddCategory}
            newItemForm={newItemForm}
            setNewItemForm={setNewItemForm}
            handleAddDrink={handleAddDrink}
            handleDeleteCategory={handleDeleteCategory}
            handleDeleteDrink={handleDeleteDrink}
            setEditingDrink={setEditingDrink}
            /* ADD THESE TWO LINES: */
            recipes={recipes}
            inventoryItems={inventoryItems}
            handleRenameCategory={handleRenameCategory}
            editingItemId={editingItemId}
            setEditingItemId={setEditingItemId}
            handleMoveCategory={handleMoveCategory}
            handleToggleCategoryVisibility={handleToggleCategoryVisibility}
            handleToggleCategoryPublicVisibility={handleToggleCategoryPublicVisibility}
            handleToggleDrinkVisibility={handleToggleDrinkVisibility}
            handleToggleDrinkPublicVisibility={handleToggleDrinkPublicVisibility}
            handleSetItemImage={handleSetItemImage}
            handleClearItemImage={handleClearItemImage}
            assets={assets}
            assetsLoading={assetsLoading}
            assetsBusy={assetsBusy}
            loadAssets={loadAssets}
            handleSelectAssetForItem={handleSelectAssetForItem}
            handleDeleteAsset={handleDeleteAsset}
            handleUploadAsset={handleUploadAsset}
            vendors={vendors}
          />
        )}

        {activeTab === 'vendors' && (
          <VendorsTab
            vendors={vendors}
            sales={dexieSales}
            menuData={menuData}
            payouts={vendorPayouts}
            taxRate={menuData?.receiptSettings?.taxRate || 16}
            branding={menuData?.receiptSettings || {}}
            brandColor={menuData?.posSettings?.brandColor || '#f28b05'}
            onAddVendor={handleAddVendor}
            onUpdateVendor={handleUpdateVendor}
            onDeleteVendor={handleDeleteVendor}
          />
        )}

        {activeTab === 'menus' && (
          <MenusTab showAlert={showAlert} showConfirm={showConfirm} menuData={menuData} onSetItemPublicFields={handleSetItemPublicFields} />
        )}

        {activeTab === 'tables' && (
          <TablesTab showAlert={showAlert} showConfirm={showConfirm} />
        )}

        {/* 3. MODIFIER LIBRARY TAB */}
        {activeTab === 'modifiers' && (
          <ModifierLibraryTab
            menuData={menuData}
            inventoryItems={inventoryItems}
            newModGroupName={newModGroupName}
            setNewModGroupName={setNewModGroupName}
            handleAddModifierGroup={handleAddModifierGroup}
            newModOption={newModOption}
            setNewModOption={setNewModOption}
            handleAddModifierOption={handleAddModifierOption}
            handleDeleteModifierGroup={handleDeleteModifierGroup}
            handleDeleteModifierOption={handleDeleteModifierOption}
            handleRenameModifierGroup={handleRenameModifierGroup}
            handleUpdateModifierOption={handleUpdateModifierOption}
            handleToggleModifierGroupMulti={handleToggleModifierGroupMulti}
            handleToggleModifierGroupHidden={handleToggleModifierGroupHidden}
          />
        )}

        {/* 4. RECEIPT TAB */}
        {activeTab === 'receipt' && (
          <ReceiptSettingsTab receiptForm={receiptForm} setReceiptForm={setReceiptForm} handleLogoUpload={handleLogoUpload} handleSaveReceipt={handleSaveReceipt} />
        )}

        {/* CFDI TAB */}
        {activeTab === 'cfdi' && (
          <CfdiTab showAlert={showAlert} showConfirm={showConfirm} />
        )}

        {/* 6. LOYALTY SETTINGS TAB */}
        {activeTab === 'loyalty' && (
          <LoyaltyTab loyaltyForm={loyaltyForm} setLoyaltyForm={setLoyaltyForm} menuData={menuData} saveSettingsToCloud={saveSettingsToCloud} handleSaveLoyalty={handleSaveLoyalty} handleResetLoyaltyData={handleResetLoyaltyData} showAlert={showAlert} />
        )}

        {/* --- AUTOMATED DISCOUNTS TAB --- */}
        {activeTab === 'discounts' && (
          <DiscountsTab menuData={menuData} newRule={newRule} setNewRule={setNewRule} handleAddDiscountRule={handleAddDiscountRule} handleToggleDiscountRule={handleToggleDiscountRule} handleDeleteDiscountRule={handleDeleteDiscountRule} showAlert={showAlert} showConfirm={showConfirm} />
        )}

        {/* --- TEAM & CASHIER MANAGEMENT TAB --- */}
        {activeTab === 'team' && (
          <TeamTab newCashier={newCashier} setNewCashier={setNewCashier} handleAddCashier={handleAddCashier} cashiers={cashiers} handleDeleteCashier={handleDeleteCashier} />
        )}

        {/* --- DEVICES TAB --- */}
        {activeTab === 'devices' && (
          <DevicesTab showAlert={showAlert} showConfirm={showConfirm} />
        )}

        {/* 5. GENERAL SETTINGS TAB */}
        {activeTab === 'settings' && (
          <GeneralSettingsTab
            generalSettings={generalSettings}
            setGeneralSettings={setGeneralSettings}
            handleAppLogoUpload={handleAppLogoUpload}
            handleSaveGeneralSettings={handleSaveGeneralSettings}
            menuData={menuData}
            saveSettingsToCloud={saveSettingsToCloud}
            setLoyaltyForm={setLoyaltyForm}
            inventoryItems={inventoryItems}
            setInventoryItems={setInventoryItems}
            dexieSales={dexieSales}
          />
        )}

        {/* 6. RECIPE BUILDER TAB */}
        {activeTab === 'calculator' && (
          <RecipeBuilderTab recipes={recipes} activeRecipe={activeRecipe} setActiveRecipe={setActiveRecipe} handleCreateDraftRecipe={handleCreateDraftRecipe} menuData={menuData} handleAddIngredient={handleAddIngredient} handleUpdateIngredient={handleUpdateIngredient} handleDeleteIngredient={handleDeleteIngredient} handleDeleteRecipe={handleDeleteRecipe} handleSaveRecipeToCloud={handleSaveRecipeToCloud} inventoryItems={inventoryItems} handleAddItemDirect={handleAddItemDirect} showAlert={showAlert} />
        )}

        {/* --- ADD THIS NEW RENDER BLOCK --- */}
        {activeTab === 'inventory' && (
          <InventoryTab
            inventoryItems={inventoryItems}
            setInventoryItems={setInventoryItems}
            showAlert={showAlert}
            showConfirm={showConfirm}
          />
        )}
        {/* --------------------------------- */}

        <EditDrinkModal editingDrink={editingDrink} setEditingDrink={setEditingDrink} menuData={menuData} toggleModifierForDrink={toggleModifierForDrink} />
      </main>
    </div>
  );
}

export default Admin;
