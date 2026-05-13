import { Icon } from '@iconify/react';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { fetchAndMergeSales } from './services/salesSync';
import { fetchAndMergeExpenses } from './services/expenseSync';
import { useDialog } from './hooks/useDialog';
import { useTheme } from './hooks/useTheme';
import { useMenuStore } from './store/useMenuStore';
import { useTranslation } from './hooks/useTranslation';

import AnalyticsTab from './components/admin/AnalyticsTab';
import OrdersTab from './components/admin/OrdersTab';
import MenuEditorTab from './components/admin/MenuEditorTab';
import ModifierLibraryTab from './components/admin/ModifierLibraryTab';
import ReceiptSettingsTab from './components/admin/ReceiptSettingsTab';
import LoyaltyTab from './components/admin/LoyaltyTab';
import DiscountsTab from './components/admin/DiscountsTab';
import TeamTab from './components/admin/TeamTab';
import GeneralSettingsTab from './components/admin/GeneralSettingsTab';
import RecipeBuilderTab from './components/admin/RecipeBuilderTab';
import EditDrinkModal from './components/admin/EditDrinkModal';
import InventoryTab from './components/admin/InventoryTab.jsx';
import ActivityTab from './components/admin/ActivityTab';
import TipsTab from './components/admin/TipsTab';
import DevicesTab from './components/admin/DevicesTab';
import BootScreen from './components/register/BootScreen';
import SharedPinPad from './components/shared/SharedPinPad';
import { logActivity } from './services/activityService';
import { toCents, fromCents, millicentsToCents, normalizeUnitCostToMillicents } from './utils/moneyUtils';

function Admin() {
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useDialog();
  const { updateTheme } = useTheme();
  // --- ZUSTAND GLOBAL STORE ---
  const { menuData, setMenuData, recipes, setRecipes } = useMenuStore();
  const { t } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  // --- NEW: MANAGER PIN LOCK STATE ---
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('analytics');
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemForm, setNewItemForm] = useState({
    category: '',
    name: '',
    price: '',
    priceType: 'fixed',
    emoji: '☕',
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
    await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

  const handleBackToRegister = () => {
    setIsAdminUnlocked(false); // Re-lock the admin dashboard
    setAdminPinInput(''); // Clear the PIN input
    navigate('/'); // Send them back to the register
  };


  // --- AUTHENTICATION LISTENER (For Offline Support & Persistence) ---
  useEffect(() => {
    // Check if an active session already exists in localStorage
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsAuthenticated(true);
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
        // 1. Fetch Menu Data
        const { data: menuSettings, error: menuError } = await supabase.from('shop_settings').select('menu_data').eq('id', 1).single();
        if (menuError) throw menuError;
        setMenuData(menuSettings.menu_data);

        const firstCategory = Object.keys(menuSettings.menu_data.categories)[0];
        if (firstCategory) setNewItemForm(prev => ({ ...prev, category: firstCategory }));

        // 2. Pull every device's expenses into Dexie. The useLiveQuery above
        // will pick up the merged rows automatically.
        await fetchAndMergeExpenses();

        // 3. Load UI Settings (Receipt, General, Loyalty)
        if (menuSettings.menu_data.receiptSettings) setReceiptForm(prev => ({ ...prev, ...menuSettings.menu_data.receiptSettings }));
        if (menuSettings.menu_data.posSettings) setGeneralSettings(prev => ({ ...prev, ...menuSettings.menu_data.posSettings }));
        if (menuSettings.menu_data.loyaltySettings) setLoyaltyForm(prev => ({ ...prev, ...menuSettings.menu_data.loyaltySettings }));

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

  const saveMenuToCloud = async (updatedMenu) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('shop_settings').update({ menu_data: updatedMenu }).eq('id', 1);
      if (error) throw error;
      setMenuData(updatedMenu);
    } catch (error) {
      showAlert(t('common.error'), t('admin.cloudSaveFailPrefix') + error.message);

    } finally {
      setIsSaving(false);
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
    saveMenuToCloud(updatedMenu);
    showAlert(t('common.success'), t('receipt.saveSuccessDesc'));
  };

  const handleSaveGeneralSettings = async () => {
    setIsSaving(true);
    try {
      // 1. Save to shop_settings.menu_data.posSettings (The Register's source of truth)
      const updatedMenu = { ...menuData, posSettings: generalSettings };
      const { error } = await supabase
        .from('shop_settings')
        .update({ menu_data: updatedMenu })
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
    saveMenuToCloud(updatedMenu);
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
  const cashiers = menuData?.cashiers || [
    { id: 1, name: 'Admin', pin: '1234', isAdmin: true },
    { id: 2, name: 'Barista 1', pin: '0000' }
  ];

  const [newCashier, setNewCashier] = useState({ name: '', pin: '', isAdmin: false });

  // --- CASHIER FUNCTIONS ---
  const handleAddCashier = () => {
    if (!newCashier.name || newCashier.pin.length !== 4) {
      return showAlert(t('team.invalidInfoTitle'), t('team.invalidInfoDesc'));
    }

    const updatedMenu = { ...menuData };
    const newEntry = {
      id: Date.now(),
      name: newCashier.name,
      pin: newCashier.pin,
      isAdmin: newCashier.isAdmin // <--- ADD THIS LINE
    };

    updatedMenu.cashiers.push(newEntry);
    saveMenuToCloud(updatedMenu);

    // LOG ACTIVITY
    logActivity('cashier_added', null, { name: newCashier.name, cashierId: newEntry.id });

    setNewCashier({ name: '', pin: '', isAdmin: false }); // Reset form
  };

  const handleDeleteCashier = (idToRemove) => {
    if (cashiers.length <= 1) return showAlert(t('common.error'), t('team.cannotDeleteLast'));

    showConfirm(t('team.deleteCashierTitle'), t('team.deleteCashierDesc'), () => {
      const cashierToDelete = cashiers.find(c => c.id === idToRemove);
      const updatedCashiers = cashiers.filter(c => c.id !== idToRemove);
      saveMenuToCloud({ ...menuData, cashiers: updatedCashiers });

      // LOG ACTIVITY
      if (cashierToDelete) {
        logActivity('cashier_removed', null, { name: cashierToDelete.name });
      }
    });

  };


  // Basic Menu/Modifier/Deletion Logic (Unchanged)
  const handleAddCategory = () => { if (!newCategoryName.trim()) return; const updatedMenu = { ...menuData }; updatedMenu.categories[newCategoryName] = []; saveMenuToCloud(updatedMenu); setNewCategoryName(""); };

  const handleRenameCategory = (oldName, newName) => {
    if (!newName || !newName.trim() || newName === oldName) return;
    if (menuData.categories[newName]) {
      return showAlert(t('menu.alertConflictTitle'), t('menu.alertConflictDesc'));
    }
    const updatedMenu = { ...menuData };
    const newCategories = {};
    // Preserve original key order
    Object.keys(updatedMenu.categories).forEach(key => {
      if (key === oldName) {
        newCategories[newName] = updatedMenu.categories[oldName];
      } else {
        newCategories[key] = updatedMenu.categories[key];
      }
    });
    updatedMenu.categories = newCategories;
    saveMenuToCloud(updatedMenu);
  };

  const resetItemForm = () => {
    setNewItemForm(prev => ({
      ...prev,
      name: "",
      price: "",
      priceType: 'fixed',
      emoji: '☕',
      inventoryMode: 'none',
      linkedWarehouseId: '',
      linkedRecipeId: ''
    }));
  };

  const handleAddDrink = () => {
    if (!newItemForm.category || !newItemForm.name || !newItemForm.price) {
      return showAlert(t('menu.missingFieldsTitle'), t('menu.missingFieldsDesc'));
    }

    const updatedMenu = { ...menuData };

    if (editingItemId) {
      let oldCategory = null;
      let existing = null;
      Object.keys(updatedMenu.categories).forEach(cat => {
        const found = updatedMenu.categories[cat].find(d => d.id === editingItemId);
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
        inventoryMode: newItemForm.inventoryMode || 'none',
        linkedWarehouseId: newItemForm.linkedWarehouseId || '',
        linkedRecipeId: newItemForm.linkedRecipeId || ''
      };

      if (oldCategory === newItemForm.category) {
        updatedMenu.categories[oldCategory] = updatedMenu.categories[oldCategory].map(d =>
          d.id === editingItemId ? updatedItem : d
        );
      } else {
        updatedMenu.categories[oldCategory] = updatedMenu.categories[oldCategory].filter(d => d.id !== editingItemId);
        updatedMenu.categories[newItemForm.category] = [
          ...(updatedMenu.categories[newItemForm.category] || []),
          updatedItem
        ];
      }

      saveMenuToCloud(updatedMenu);

      // LOG ACTIVITY
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
      allowedModifiers: [],
      inventoryMode: newItemForm.inventoryMode || 'none',
      linkedWarehouseId: newItemForm.linkedWarehouseId || '',
      linkedRecipeId: newItemForm.linkedRecipeId || ''
    };
    updatedMenu.categories[newItemForm.category].push(newDrink);

    saveMenuToCloud(updatedMenu);

    // LOG ACTIVITY
    logActivity('menu_item_added', null, {
      name: newItemForm.name,
      category: newItemForm.category,
      price: toCents(newItemForm.price) // <-- Fixed!
    });

    resetItemForm();
  };

  const handleAddModifierGroup = () => { if (!newModGroupName.trim()) return; const groupKey = newModGroupName.toLowerCase().replace(/\s+/g, '_'); const updatedMenu = { ...menuData }; if (!updatedMenu.modifierGroups[groupKey]) { updatedMenu.modifierGroups[groupKey] = []; saveMenuToCloud(updatedMenu); } setNewModGroupName(""); };

  const handleAddModifierOption = () => {
    if (!newModOption.groupKey || !newModOption.name || (!newModOption.isTextInput && newModOption.price === "")) {
      return showAlert(t('menu.missingFieldsTitle'), t('menu.missingFieldsDesc'));
    }

    const updatedMenu = { ...menuData };
    const newOption = {
      id: newModOption.name.toLowerCase().replace(/\s+/g, '_'),
      name: newModOption.name,
      price: newModOption.isTextInput ? 0 : toCents(newModOption.price),
      isTextInput: newModOption.isTextInput,
      deductionTarget: newModOption.deductionTarget || null, // NEW: The item it consumes
      substitutionTarget: newModOption.substitutionTarget || null // NEW: The item it replaces
    };

    updatedMenu.modifierGroups[newModOption.groupKey].push(newOption);
    saveMenuToCloud(updatedMenu);

    // Reset the form completely
    setNewModOption({
      groupKey: newModOption.groupKey,
      name: "",
      price: "0",
      isTextInput: false,
      deductionTarget: "",
      substitutionTarget: ""
    });
  };

  const toggleModifierForDrink = (modGroupKey) => { const updatedMenu = { ...menuData }; const categoryArray = updatedMenu.categories[editingDrink.categoryName]; const drinkIndex = categoryArray.findIndex(d => d.id === editingDrink.drink.id); const drinkToUpdate = categoryArray[drinkIndex]; const hasModifier = drinkToUpdate.allowedModifiers.includes(modGroupKey); if (hasModifier) { drinkToUpdate.allowedModifiers = drinkToUpdate.allowedModifiers.filter(key => key !== modGroupKey); } else { drinkToUpdate.allowedModifiers.push(modGroupKey); } saveMenuToCloud(updatedMenu); setEditingDrink({ ...editingDrink, drink: drinkToUpdate }); };

  const handleUpdateModifierOption = (groupKey, oldOptionId, updatedOpt) => {
    if (!updatedOpt.name || (!updatedOpt.isTextInput && updatedOpt.price === "")) {
      return showAlert(t('menu.missingFieldsTitle'), t('menu.missingFieldsDesc'));
    }
    const updatedMenu = { ...menuData };
    const optionIndex = updatedMenu.modifierGroups[groupKey].findIndex(o => o.id === oldOptionId);
    if (optionIndex !== -1) {
      updatedMenu.modifierGroups[groupKey][optionIndex] = {
        id: updatedOpt.name.toLowerCase().replace(/\s+/g, '_'),
        name: updatedOpt.name,
        price: updatedOpt.isTextInput ? 0 : toCents(updatedOpt.price),
        isTextInput: updatedOpt.isTextInput,
        // CRITICAL FIXES HERE:
        deductionTarget: updatedOpt.deductionTarget || null,
        substitutionTarget: updatedOpt.substitutionTarget || null
      };
      saveMenuToCloud(updatedMenu);
    }
    setNewModOption({ groupKey: "", name: "", price: "0", isTextInput: false, deductionTarget: "", substitutionTarget: "" });
  };

  const handleRenameModifierGroup = (oldKey, newKey) => {
    if (!newKey.trim()) return;
    const formattedNewKey = newKey.toLowerCase().replace(/\s+/g, '_');
    if (oldKey === formattedNewKey) return;

    if (menuData.modifierGroups[formattedNewKey]) {
      return showAlert(t('common.error'), t('mods.errorGroupExists'));
    }

    const updatedMenu = { ...menuData };

    // 1. Move the group data
    updatedMenu.modifierGroups[formattedNewKey] = updatedMenu.modifierGroups[oldKey];
    delete updatedMenu.modifierGroups[oldKey];

    // 2. CRITICAL FIX: Update ALL drinks that reference this group
    Object.keys(updatedMenu.categories).forEach(cat => {
      updatedMenu.categories[cat].forEach(drink => {
        if (drink.allowedModifiers && Array.isArray(drink.allowedModifiers)) {
          drink.allowedModifiers = drink.allowedModifiers.map(k =>
            k === oldKey ? formattedNewKey : k
          );
        }
      });
    });

    saveMenuToCloud(updatedMenu);
  };

  // FIX: Upgraded to showConfirm!
  const handleDeleteDrink = (categoryName, drinkId, drinkName) => {
    showConfirm(t('menu.deleteDrinkTitle'), `${t('menu.deleteDrinkDesc')} (${drinkName})`, () => {
      const updatedMenu = { ...menuData };
      updatedMenu.categories[categoryName] = updatedMenu.categories[categoryName].filter(drink => drink.id !== drinkId);
      saveMenuToCloud(updatedMenu);

      // LOG ACTIVITY
      logActivity('menu_item_deleted', null, { name: drinkName });
    });
  };

  // FIX: Upgraded to showConfirm!
  const handleDeleteCategory = (categoryName) => {
    if (menuData.categories[categoryName].length > 0) return showAlert(t('common.error'), `${t('menu.deleteCategoryHasItems')} (${categoryName})`);

    showConfirm(t('menu.deleteCategoryTitle'), `${t('menu.deleteCategoryDesc')} (${categoryName})`, () => {
      const updatedMenu = { ...menuData };
      delete updatedMenu.categories[categoryName];
      saveMenuToCloud(updatedMenu);
    });
  };

  // NEW: Delete an entire modifier group and scrub it from all drinks
  const handleDeleteModifierGroup = (groupKey) => {
    showConfirm(
      t('menu.deleteModGroupTitle'),
      `${t('menu.deleteModGroupDesc')} (${groupKey.replace('_', ' ')})`,
      () => {
        const updatedMenu = { ...menuData };

        // 1. Delete the group itself
        delete updatedMenu.modifierGroups[groupKey];

        // 2. Scrub the menu! Remove this group from any drink that has it assigned
        Object.keys(updatedMenu.categories).forEach(category => {
          updatedMenu.categories[category].forEach(item => {
            item.allowedModifiers = item.allowedModifiers.filter(mod => mod !== groupKey);
          });
        });

        saveMenuToCloud(updatedMenu);
      }
    );
  };

  // FIX: Upgraded to showConfirm!
  const handleDeleteModifierOption = (groupKey, optionId, optionName) => {
    showConfirm(t('menu.deleteModOptionTitle'), `${t('menu.deleteModOptionDesc')} (${optionName})`, () => {
      const updatedMenu = { ...menuData };
      updatedMenu.modifierGroups[groupKey] = updatedMenu.modifierGroups[groupKey].filter(opt => opt.id !== optionId);
      saveMenuToCloud(updatedMenu);
    });
  };

  // --- OPTIMIZED ANALYTICS CALCULATIONS ---
  // 1. Filter the raw data based on the selected timeframe
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dexieSales = useLiveQuery(() => db.sales.toArray(), []) || [];
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
    return filteredExpenses
      .filter(exp => !(exp.reason || '').startsWith('RESTOCK:'))
      .reduce((sum, exp) => sum + exp.amount, 0);
  }, [filteredExpenses]);

  // 3. Count Payment Methods
  const methodCounts = useMemo(() => {
    return filteredSales.reduce((acc, sale) => {
      acc[sale.payment_method] = (acc[sale.payment_method] || 0) + 1;
      return acc;
    }, {});
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
    const relevantTicketIds = new Set(filteredSales.map(sale => String(sale.id)));
    const relevantTimestamps = new Set(filteredSales.map(sale => sale.created_at));
    let totalCOGS = 0;
    let totalWastage = 0;

    inventoryLogs.forEach(log => {
      const matchedItem = inventoryItems.find(i => i.name === log.item_name);
      const fallbackCost = matchedItem ? matchedItem.unit_cost : 0;
      const rawCost = (log.unit_cost !== undefined && log.unit_cost !== null) ? log.unit_cost : fallbackCost;
      const unitCost = normalizeUnitCostToMillicents(rawCost);

      // Millicents * Qty -> Millicents. Then / 100 -> Cents.
      const financialImpact = millicentsToCents(log.qty_deducted * unitCost);
      if (log.deduction_type === 'sale') {
        // Prefer ticket_id (authoritative); fall back to timestamp for legacy
        // logs missing ticket_id. Timestamp-only match can over-attribute when
        // two unrelated sales share a created_at instant.
        const hasTicket = log.ticket_id !== undefined && log.ticket_id !== null && log.ticket_id !== '';
        const matched = hasTicket
          ? relevantTicketIds.has(String(log.ticket_id))
          : relevantTimestamps.has(log.created_at);
        if (matched) {
          totalCOGS += financialImpact;
        }
      } else {
        if (timeFilter === 'all') {
          totalWastage += financialImpact;
        } else {
          const logDateStr = log.created_at || log.timestamp;
          if (logDateStr) {
            const logDate = new Date(logDateStr);
            if (timeFilter === 'today') {
              if (logDate.toDateString() === now.toDateString()) totalWastage += financialImpact;
            } else if (timeFilter === 'custom') {
              if (!dateRange.start || !dateRange.end) {
                totalWastage += financialImpact;
              } else {
                const start = new Date(dateRange.start);
                start.setHours(0, 0, 0, 0);
                const end = new Date(dateRange.end);
                end.setHours(23, 59, 59, 999);
                if (logDate >= start && logDate <= end) totalWastage += financialImpact;
              }
            } else {
              const daysDifference = (now - logDate) / (1000 * 60 * 60 * 24);
              if (timeFilter === 'week' && daysDifference <= 7) totalWastage += financialImpact;
              if (timeFilter === 'month' && daysDifference <= 30) totalWastage += financialImpact;
              if (timeFilter === '6months' && daysDifference <= 180) totalWastage += financialImpact;
              if (timeFilter === 'year' && daysDifference <= 365) totalWastage += financialImpact;
            }
          }
        }
      }
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
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:store" style={{ color: 'var(--brand-color)' }} />
            <span>{generalSettings.name} | admin</span>
          </h2>
          <button className="desktop-hidden" onClick={() => setIsMobileMenuOpen(false)} aria-label={t('common.close')} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', display: 'flex' }}>
            <Icon icon="lucide:x" />
          </button>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', padding: '16px 0', flex: 1, gap: '4px' }}>
          {[
            { id: 'analytics', icon: 'lucide:bar-chart-3', label: t('admin.analytics') },
            { id: 'orders', icon: 'lucide:receipt', label: t('admin.orders') },
            { id: 'menu', icon: 'lucide:coffee', label: t('admin.menu') },
            { id: 'modifiers', icon: 'lucide:sparkles', label: t('admin.modifiers') },
            { id: 'calculator', icon: 'lucide:flask-conical', label: t('admin.recipe'), advancedOnly: true },
            { id: 'inventory', icon: 'lucide:database', label: t('admin.inventory'), advancedOnly: true },
            { id: 'receipt', icon: 'lucide:printer', label: t('admin.receipt') },
            { id: 'discounts', icon: 'lucide:percent', label: t('admin.promotions'), advancedOnly: true },
            { id: 'loyalty', icon: 'lucide:star', label: t('admin.loyalty'), advancedOnly: true },
            { id: 'team', icon: 'lucide:users', label: t('admin.team') },
            { id: 'devices', icon: 'lucide:tablet-smartphone', label: t('admin.devices') },
            { id: 'tips', icon: 'lucide:wallet', label: t('admin.tips'), advancedOnly: true },
            { id: 'activity', icon: 'lucide:history', label: t('admin.activity'), advancedOnly: true },
            { id: 'settings', icon: 'lucide:settings', label: t('admin.settings') },
          ].map(tab => {
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
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
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
          />
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
          />
        )}

        {/* 4. RECEIPT TAB */}
        {activeTab === 'receipt' && (
          <ReceiptSettingsTab receiptForm={receiptForm} setReceiptForm={setReceiptForm} handleLogoUpload={handleLogoUpload} handleSaveReceipt={handleSaveReceipt} />
        )}

        {/* 6. LOYALTY SETTINGS TAB */}
        {activeTab === 'loyalty' && (
          <LoyaltyTab loyaltyForm={loyaltyForm} setLoyaltyForm={setLoyaltyForm} menuData={menuData} saveMenuToCloud={saveMenuToCloud} handleSaveLoyalty={handleSaveLoyalty} handleResetLoyaltyData={handleResetLoyaltyData} showAlert={showAlert} />
        )}

        {/* --- AUTOMATED DISCOUNTS TAB --- */}
        {activeTab === 'discounts' && (
          <DiscountsTab menuData={menuData} newRule={newRule} setNewRule={setNewRule} saveMenuToCloud={saveMenuToCloud} showAlert={showAlert} showConfirm={showConfirm} />
        )}

        {/* --- TEAM & CASHIER MANAGEMENT TAB --- */}
        {activeTab === 'team' && (
          <TeamTab newCashier={newCashier} setNewCashier={setNewCashier} handleAddCashier={handleAddCashier} cashiers={cashiers} handleDeleteCashier={handleDeleteCashier} />
        )}

        {/* --- DEVICES TAB --- */}
        {activeTab === 'devices' && (
          <DevicesTab />
        )}

        {/* 5. GENERAL SETTINGS TAB */}
        {activeTab === 'settings' && (
          <GeneralSettingsTab
            generalSettings={generalSettings}
            setGeneralSettings={setGeneralSettings}
            handleAppLogoUpload={handleAppLogoUpload}
            handleSaveGeneralSettings={handleSaveGeneralSettings}
            menuData={menuData}
            saveMenuToCloud={saveMenuToCloud}
            setLoyaltyForm={setLoyaltyForm}
            inventoryItems={inventoryItems}
            setInventoryItems={setInventoryItems}
            dexieSales={dexieSales}
          />
        )}

        {/* 6. RECIPE BUILDER TAB */}
        {activeTab === 'calculator' && (
          <RecipeBuilderTab recipes={recipes} activeRecipe={activeRecipe} setActiveRecipe={setActiveRecipe} handleCreateDraftRecipe={handleCreateDraftRecipe} menuData={menuData} handleAddIngredient={handleAddIngredient} handleUpdateIngredient={handleUpdateIngredient} handleDeleteIngredient={handleDeleteIngredient} handleDeleteRecipe={handleDeleteRecipe} handleSaveRecipeToCloud={handleSaveRecipeToCloud} inventoryItems={inventoryItems} saveMenuToCloud={saveMenuToCloud} showAlert={showAlert} />
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
