import { Icon } from '@iconify/react';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { useDialog } from './contexts/DialogContext';
import { useTheme } from './contexts/ThemeContext';
import { useMenuStore } from './store/useMenuStore';
import { useTranslation } from './hooks/useTranslation';

import Dialog from './components/shared/Dialog';
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
import BootScreen from './components/register/BootScreen';
import SharedPinPad from './components/shared/SharedPinPad';
import ExportKeysButton from './components/ExportKeysButton';
import DisconnectButton from './components/DisconnectButton';


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
  const [salesData, setSalesData] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemForm, setNewItemForm] = useState({ 
    category: '', 
    name: '', 
    price: '', 
    emoji: '☕' ,
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
  const [timeFilter, setTimeFilter] = useState('all');
  const [newRule, setNewRule] = useState({ name: '', type: 'percentage', value: '', targetType: 'cart', targetValue: '' });
  const [expenses, setExpenses] = useState(() => {
  const saved = localStorage.getItem('tinypos_expenses');
  return saved ? JSON.parse(saved) : [];
});

  // --- INSTANT RECEIPT SETTINGS ---
  const [receiptForm, setReceiptForm] = useState(() => {
    const defaultReceipt = { 
      header: "TINY COFFEE BAR", 
      subheader: "Puebla, Mexico", 
      footer: "Thank you for your visit!", 
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
      window.confirm("Login Failed: " + error.message);
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

  // --- NEW: WIPE SESSION ON TAB CLOSE ---
  useEffect(() => {
    const handleTabClose = () => {
      // This wipes the Supabase token from the browser's memory 
      // ensuring the next time the app opens, it asks for a password.
      supabase.auth.signOut();
    };

    window.addEventListener('beforeunload', handleTabClose);
    return () => window.removeEventListener('beforeunload', handleTabClose);
  }, []);

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
  if (!isAuthenticated) { setIsLoading(false); return; }
  setIsLoading(true);

  const fetchData = async () => {
    try {
      // 1. Fetch Menu Data
      const { data: menuSettings, error: menuError } = await supabase.from('shop_settings').select('menu_data').eq('id', 1).single();
      if (menuError) throw menuError;
      setMenuData(menuSettings.menu_data);
      
      const firstCategory = Object.keys(menuSettings.menu_data.categories)[0];
      if (firstCategory) setNewItemForm(prev => ({ ...prev, category: firstCategory }));

      // 2. NEW: Fetch All Expenses (General + Inventory Purchases)
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false }); // Show newest first
      
      if (!expensesError && expensesData) {
        setExpenses(expensesData); 
        // Sync back to localStorage so the Register tab sees them too
        localStorage.setItem('tinypos_expenses', JSON.stringify(expensesData));
      }

      // 3. Load UI Settings (Receipt, General, Loyalty)
      if (menuSettings.menu_data.receiptSettings) setReceiptForm(prev => ({ ...prev, ...menuSettings.menu_data.receiptSettings }));
      if (menuSettings.menu_data.posSettings) setGeneralSettings(prev => ({ ...prev, ...menuSettings.menu_data.posSettings }));
      if (menuSettings.menu_data.loyaltySettings) setLoyaltyForm(prev => ({ ...prev, ...menuSettings.menu_data.loyaltySettings }));

      // 4. Fetch Sales History
      const { data: salesHistory, error: salesError } = await supabase.from('sales').select('*');
      if (!salesError && salesHistory) {
        setSalesData(salesHistory);
        await db.sales.bulkPut(salesHistory);
      }

      // 5. Fetch Recipes & Inventory
      const { data: recipesData } = await supabase.from('recipes').select('*').order('created_at', { ascending: false });
      if (recipesData) setRecipes(recipesData);

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
      window.confirm("Failed to save to cloud: " + error.message);
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
    showAlert("Success", "Receipt settings & App Logo saved successfully!");
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

      showAlert("Success", "Settings saved and branding updated!");
    } catch (err) {
      console.error(err);
      showAlert("Error", "Failed to save settings: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Saves the custom loyalty settings to our JSON cloud object
  const handleSaveLoyalty = () => {
    if (loyaltyForm.isActive) {
      if (loyaltyForm.visitsRequired < 1) return showAlert(t('common.error'), "Visits required must be at least 1.");
      if (!loyaltyForm.rewardDescription || !loyaltyForm.rewardDescription.trim()) return showAlert(t('common.error'), "Please describe the reward.");
    }

    const updatedMenu = { ...menuData, loyaltySettings: loyaltyForm };
    saveMenuToCloud(updatedMenu);
    showAlert(t('common.success'), "Loyalty program settings saved successfully!");
  };

  // --- DANGER ZONE: RESET ALL CUSTOMER STARS ---
  const handleResetLoyaltyData = async () => {
    const confirmMessage = "CRITICAL WARNING: This will permanently delete ALL customer stars and reset everyone to 0 visits. \n\nAre you absolutely sure you want to start a fresh program?";

    showConfirm("Wipe Loyalty Data?", confirmMessage, async () => {
      try {
        setIsSaving(true);
        const { error } = await supabase.from('customers').update({ visits: 0 }).not('phone', 'is', null);
        if (error) throw error;

        showAlert("Success", "All customer stars have been wiped. You are ready to start a new promotion.");
      } catch (err) {
        showAlert("Database Error", "Failed to reset database: " + err.message);
      } finally {
        setIsSaving(false);
      }
    });
  };

  // --- CASHIER MANAGEMENT (NOW CLOUD SYNCED) ---
  const cashiers = menuData?.cashiers || [
    { id: 1, name: 'Admin', pin: '1234', isAdmin: true },
    { id: 2, name: 'Barista 1', pin: '0000'}
  ];

  const [newCashier, setNewCashier] = useState({ name: '', pin: '', isAdmin: false });
  const [editingCashier, setEditingCashier] = useState(null);

  // --- CASHIER FUNCTIONS ---
  const handleAddCashier = () => {
    if (!newCashier.name || newCashier.pin.length !== 4) {
      return showAlert("Invalid Info", "Please enter a name and a 4-digit PIN.");
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
    setNewCashier({ name: '', pin: '', isAdmin: false }); // Reset form
  };

  const handleDeleteCashier = (idToRemove) => {
    if (cashiers.length <= 1) return window.confirm("You cannot delete the last profile!");
    if (window.confirm("Are you sure you want to remove this cashier?")) {
      const updatedCashiers = cashiers.filter(c => c.id !== idToRemove);
      saveMenuToCloud({ ...menuData, cashiers: updatedCashiers });
    }
  };

  const handleSaveEditCashier = () => {
    if (!editingCashier.name || editingCashier.pin.length !== 4) return showAlert("Error", "Check name and PIN.");
    
    const updatedCashiers = menuData.cashiers.map(c => 
      c.id === editingCashier.id ? editingCashier : c // This keeps the isAdmin boolean!
    );
    
    saveMenuToCloud({ ...menuData, cashiers: updatedCashiers });
    setEditingCashier(null);
  };


  // Basic Menu/Modifier/Deletion Logic (Unchanged)
  const handleAddCategory = () => { if (!newCategoryName.trim()) return; const updatedMenu = { ...menuData }; updatedMenu.categories[newCategoryName] = []; saveMenuToCloud(updatedMenu); setNewCategoryName(""); };
  const handleAddDrink = () => { 
    // 1. Added 'return' so the function stops if fields are missing
    if (!newItemForm.category || !newItemForm.name || !newItemForm.price) {
      return showAlert("Missing Info", "Please fill out all required fields.");
    }

    const updatedMenu = { ...menuData }; 

    const newDrink = { 
      id: newItemForm.name.toLowerCase().replace(/\s+/g, '_'), 
      name: newItemForm.name, 
      basePrice: parseFloat(newItemForm.price), 
      emoji: newItemForm.emoji || '',
      allowedModifiers: [],
      inventoryMode: newItemForm.inventoryMode || 'none',
      linkedWarehouseId: newItemForm.linkedWarehouseId || '',
      linkedRecipeId: newItemForm.linkedRecipeId || '' 
    }; 
      updatedMenu.categories[newItemForm.category].push(newDrink); 

      saveMenuToCloud(updatedMenu); 
      setNewItemForm({ ...newItemForm, 
        name: "", 
        price: "" ,
        inventoryMode: 'none', 
        linkedWarehouseId: '', 
        linkedRecipeId: ''
      }); 
    };
    
  const handleAddModifierGroup = () => { if (!newModGroupName.trim()) return; const groupKey = newModGroupName.toLowerCase().replace(/\s+/g, '_'); const updatedMenu = { ...menuData }; if (!updatedMenu.modifierGroups[groupKey]) { updatedMenu.modifierGroups[groupKey] = []; saveMenuToCloud(updatedMenu); } setNewModGroupName(""); };

  const handleAddModifierOption = () => {
    if (!newModOption.groupKey || !newModOption.name || (!newModOption.isTextInput && newModOption.price === "")) {
      return showAlert("Missing Info", "Please fill all required fields.");
    }

    const updatedMenu = { ...menuData };
    const newOption = {
      id: newModOption.name.toLowerCase().replace(/\s+/g, '_'),
      name: newModOption.name,
      price: newModOption.isTextInput ? 0 : parseFloat(newModOption.price),
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

  // FIX: Upgraded to showConfirm!
  const handleDeleteDrink = (categoryName, drinkId, drinkName) => {
    showConfirm("Delete Drink", `Permanently delete "${drinkName}"?`, () => {
      const updatedMenu = { ...menuData };
      updatedMenu.categories[categoryName] = updatedMenu.categories[categoryName].filter(drink => drink.id !== drinkId);
      saveMenuToCloud(updatedMenu);
    });
  };

  // FIX: Upgraded to showConfirm!
  const handleDeleteCategory = (categoryName) => {
    if (menuData.categories[categoryName].length > 0) return window.confirm(`Cannot delete "${categoryName}" - contains drinks.`);
    showConfirm("Delete Category", `Delete the empty category "${categoryName}"?`, () => {
      const updatedMenu = { ...menuData };
      delete updatedMenu.categories[categoryName];
      saveMenuToCloud(updatedMenu);
    });
  };

  // NEW: Delete an entire modifier group and scrub it from all drinks
  const handleDeleteModifierGroup = (groupKey) => {
    showConfirm(
      "Delete Modifier Group",
      `Are you sure you want to delete the entire "${groupKey.replace('_', ' ')}" group and all its options? This will also remove it from any items currently using it.`,
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
    showConfirm("Delete Modifier", `Delete the "${optionName}" option?`, () => {
      const updatedMenu = { ...menuData };
      updatedMenu.modifierGroups[groupKey] = updatedMenu.modifierGroups[groupKey].filter(opt => opt.id !== optionId);
      saveMenuToCloud(updatedMenu);
    });
  };

  // --- OPTIMIZED ANALYTICS CALCULATIONS ---
  // 1. Filter the raw data based on the selected timeframe
  const dexieSales = useLiveQuery(() => db.sales.toArray(), []) || [];
  const dexieInventory = useLiveQuery(() => db.inventory_logs.toArray(), []) || [];

  const filteredSales = useMemo(() => {
    const now = new Date();
    return dexieSales.filter(sale => {
      if (timeFilter === 'all') return true;

      const saleDate = new Date(sale.created_at);
      
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
  }, [dexieSales, timeFilter]); // FIX 2: Listens to dexieSales instead of static salesData

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

      if (timeFilter === 'today') {
        return expDate.toDateString() === now.toDateString();
      }

      const daysDifference = (now - expDate) / (1000 * 60 * 60 * 24);
      if (timeFilter === 'week') return daysDifference <= 7;
      if (timeFilter === 'month') return daysDifference <= 30;
      return true;
    });
  }, [expenses, timeFilter]);

  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [filteredExpenses]);

  const netProfit = totalRevenue - totalExpenses;

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

  // 3. The CSV Exporter Function
  const handleDownloadCSV = () => {
    if (filteredSales.length === 0) return window.confirm("No data to export for this timeframe.");

    // Create the CSV headers
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Time,Total Amount,Payment Method,Items Sold\n";

    // Format each row
    filteredSales.forEach(sale => {
      const dateObj = new Date(sale.created_at);
      const date = dateObj.toLocaleDateString();
      const time = dateObj.toLocaleTimeString();
      const amount = sale.total_amount;
      const method = sale.payment_method;
      // Join items with a pipe (|) so commas don't break the CSV format
      const items = sale.items_sold ? sale.items_sold.join(' | ') : 'None';

      csvContent += `${date},${time},${amount},${method},${items}\n`;
    });

    // Trigger the download via a hidden HTML tag
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tinypos_sales_${timeFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    if (!activeRecipe.name.trim()) return showAlert("Validation Error", "Please give this recipe a name before saving.");

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
        recipeToSave.custom_price = parseFloat(recipeToSave.custom_price);
      }

      const { data, error } = await supabase
        .from('recipes')
        .upsert(recipeToSave)
        .select()
        .single();

      if (error) throw error;

      // Update local state organically
      setRecipes(prev => {
        const existing = prev.find(r => r.id === activeRecipe.id);
        if (existing) {
          return prev.map(r => r.id === activeRecipe.id ? data : r);
        } else {
          // It was a draft, unshift it to the top
          return [data, ...prev.filter(r => r.id !== activeRecipe.id)];
        }
      });

      // Switch active recipe to the formalized UUID instance
      setActiveRecipe(data);
      showAlert("Success", "Recipe saved directly to Supabase!");

    } catch (err) {
      console.error(err);
      showAlert("Database Error", err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecipe = async (recipeId) => {
    showConfirm("Delete Recipe", "Are you sure you want to permanently delete this recipe from Supabase?", async () => {
      setIsSaving(true);
      try {
        const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
        if (error) throw error;

        setRecipes(prev => prev.filter(r => r.id !== recipeId));
        if (activeRecipe?.id === recipeId) setActiveRecipe(null);
        showAlert("Success", "Recipe deleted!");
      } catch (err) {
        showAlert("Error", err.message);
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
        onSubmit={() => {
          const isStaffAdmin = (menuData?.cashiers || []).some(c => c.isAdmin && c.pin === adminPinInput);
          const isMasterPin = adminPinInput === generalSettings.pinCode;
          if (isStaffAdmin || isMasterPin) { 
            setIsAdminUnlocked(true); 
            setPinError(false); 
          } else { 
            setPinError(true); 
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
          <button className="desktop-hidden" onClick={() => setIsMobileMenuOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', display: 'flex' }}>
            <Icon icon="lucide:x" />
          </button>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', padding: '16px 0', flex: 1, gap: '4px' }}>
          {[
            { id: 'analytics', icon: 'lucide:bar-chart-3', label: t('admin.analytics') },
            { id: 'orders', icon: 'lucide:receipt', label: t('admin.orders') },
            { id: 'menu', icon: 'lucide:coffee', label: t('admin.menu') },
            { id: 'modifiers', icon: 'lucide:sparkles', label: t('admin.modifiers') },
            { id: 'receipt', icon: 'lucide:printer', label: t('admin.receipt') },
            { id: 'calculator', icon: 'lucide:flask-conical', label: t('admin.recipe'), advancedOnly: true },
            { id: 'inventory', icon: 'lucide:database', label: t('admin.inventory'), advancedOnly: true },
            { id: 'loyalty', icon: 'lucide:star', label: t('admin.loyalty'), advancedOnly: true },
            { id: 'discounts', icon: 'lucide:percent', label: t('admin.promotions'), advancedOnly: true },
            { id: 'team', icon: 'lucide:users', label: t('admin.team') },
            { id: 'settings', icon: 'lucide:settings', label: t('admin.settings') },
          ].filter(tab => !tab.advancedOnly || generalSettings.isAdvancedMode === true).map(tab => (
            <button 
              key={tab.id}
              onClick={() => switchTab(tab.id)} 
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
                borderLeft: activeTab === tab.id ? '4px solid var(--brand-color)' : '4px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              <Icon icon={tab.icon} style={{ fontSize: '1.2rem', opacity: activeTab === tab.id ? 1 : 0.7 }} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={handleLogout} style={{ width: '100%', padding: '12px', background: 'transparent', color: '#ccc', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Icon icon="lucide:log-out" />
            <span>{t('admin.signOut')}</span>
          </button>
          <button onClick={handleBackToRegister} style={{ width: '100%', padding: '12px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(231, 76, 60, 0.3)' }}>
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
            handleDownloadCSV={handleDownloadCSV} 
            totalRevenue={totalRevenue} 
            totalExpenses={totalExpenses} 
            totalRefunds={totalRefunds} 
            netProfit={netProfit} 
            methodCounts={methodCounts} 
            topItemsArray={topItemsArray} 
            filteredSales={filteredSales}
            
            // ADD THESE TWO NEW LINES:
            inventoryLogs={inventoryLogs} 
            inventoryItems={inventoryItems} 
          />
        )}

        
              {/* 1.5 RECEIPT HISTORY / REFUNDS TAB */}
        {activeTab === 'orders' && (
          <OrdersTab dexieSales={dexieSales} generalSettings={generalSettings} menuData={menuData} />
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
              saveMenuToCloud={saveMenuToCloud}
              /* ADD THESE TWO LINES: */
              recipes={recipes}
              inventoryItems={inventoryItems}
              showAlert={showAlert}
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
          <TeamTab newCashier={newCashier} setNewCashier={setNewCashier} handleAddCashier={handleAddCashier} cashiers={cashiers} editingCashier={editingCashier} setEditingCashier={setEditingCashier} handleSaveEditCashier={handleSaveEditCashier} handleDeleteCashier={handleDeleteCashier} />
        )}

        {/* 5. GENERAL SETTINGS TAB */}
        {activeTab === 'settings' && (
          <GeneralSettingsTab generalSettings={generalSettings} setGeneralSettings={setGeneralSettings} handleAppLogoUpload={handleAppLogoUpload} handleSaveGeneralSettings={handleSaveGeneralSettings} menuData={menuData} saveMenuToCloud={saveMenuToCloud} setLoyaltyForm={setLoyaltyForm} />
        )}

        {/* 6. RECIPE BUILDER TAB */}
        {activeTab === 'calculator' && (
          <RecipeBuilderTab recipes={recipes} activeRecipe={activeRecipe} setActiveRecipe={setActiveRecipe} handleCreateDraftRecipe={handleCreateDraftRecipe} menuData={menuData} handleAddIngredient={handleAddIngredient} handleUpdateIngredient={handleUpdateIngredient} handleDeleteIngredient={handleDeleteIngredient} handleDeleteRecipe={handleDeleteRecipe} handleSaveRecipeToCloud={handleSaveRecipeToCloud} inventoryItems={inventoryItems} />
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
