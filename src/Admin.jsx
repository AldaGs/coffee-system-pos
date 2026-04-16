import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';


function Admin() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('analytics');
  const [menuData, setMenuData] = useState(null);
  const [salesData, setSalesData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemForm, setNewItemForm] = useState({ category: '', name: '', price: '', emoji: '☕' });
  const [newModGroupName, setNewModGroupName] = useState("");
  const [newModOption, setNewModOption] = useState({ groupKey: "", name: "", price: "0", isTextInput: false });
  // --- UNIVERSAL CUSTOM DIALOG SYSTEM ---
  const [uiDialog, setUiDialog] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });

  // Helper function for quick ALERTS
  const showAlert = (title, message) => {
    setUiDialog({ isOpen: true, type: 'alert', title, message, onConfirm: null });
  };

  // Helper function for quick CONFIRMATIONS
  const showConfirm = (title, message, onConfirmAction) => {
    setUiDialog({ isOpen: true, type: 'confirm', title, message, onConfirm: onConfirmAction });
  };

  const closeDialog = () => setUiDialog({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });
  const [editingDrink, setEditingDrink] = useState(null);

  const [timeFilter, setTimeFilter] = useState('all');

  // --- NEW: AUTOMATED DISCOUNT RULES STATE ---
  const [newRule, setNewRule] = useState({ name: '', type: 'percentage', value: '', targetType: 'cart', targetValue: '' });

  // 1. Fetch Expenses (Gastos)
  const [expenses] = useState(() => {
    const saved = localStorage.getItem('tinypos_expenses');
    return saved ? JSON.parse(saved) : [];
  });

  // --- NEW: RECEIPT STATE ---
  const [receiptForm, setReceiptForm] = useState({
    header: "TINY COFFEE BAR",
    subheader: "Puebla, Mexico",
    footer: "Thank you for your visit!",
    logo: null, // This will hold our massive Base64 text string
    enableTaxBreakdown: false, 
    taxRate: 16 
  });

  // --- NEW: GENERAL SETTINGS STATE ---
  const [generalSettings, setGeneralSettings] = useState({
    name: "Main Register",
    brandColor: "#2c3e50",
    isDarkMode: false,
    autoLockMinutes: 5,
    pinCode: "1234",
    orderResetPolicy: "daily",
    enableCorte: true,
    ticketVisibility: "open"
  });

  // --- NEW: LOYALTY SETTINGS STATE ---
  const [loyaltyForm, setLoyaltyForm] = useState({
    isActive: true, // NEW: Master switch
    visitsRequired: 10,
    rewardDescription: "tu pr\u00F3xima bebida GRATIS"
  });

  // --- NEW: CALCULATOR & RECIPE BUILDER STATE ---
  const [recipes, setRecipes] = useState([]);
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
        const { data: menuSettings, error: menuError } = await supabase.from('shop_settings').select('menu_data').eq('id', 1).single();
        if (menuError) throw menuError;
        setMenuData(menuSettings.menu_data);
        const firstCategory = Object.keys(menuSettings.menu_data.categories)[0];
        if (firstCategory) setNewItemForm(prev => ({ ...prev, category: firstCategory }));

        // Check if there are existing receipt settings in the cloud and load them!
        if (menuSettings.menu_data.receiptSettings) {
          setReceiptForm(menuSettings.menu_data.receiptSettings);
        }

        // Load General Settings if they exist in the cloud
        if (menuSettings.menu_data.posSettings) {
          setGeneralSettings(menuSettings.menu_data.posSettings);
        }

        // Load Loyalty Settings if they exist in the cloud
        if (menuSettings.menu_data.loyaltySettings) {
          setLoyaltyForm(menuSettings.menu_data.loyaltySettings);
        }

        const { data: salesHistory, error: salesError } = await supabase.from('sales').select('*');
        if (salesError) throw salesError;
        setSalesData(salesHistory);
        if (salesHistory && salesHistory.length > 0) {
           await db.sales.bulkPut(salesHistory);
        }

        // Load Advanced Recipes
        const { data: recipesData, error: recipesError } = await supabase.from('recipes').select('*').order('created_at', { ascending: false });
        if (recipesError) {
          console.warn("Recipes fetch error (Have you run the SQL yet?):", recipesError.message);
        } else if (recipesData) {
          setRecipes(recipesData);
        }

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
    if (!menuData) return;

    // Extract settings safely
    const settings = menuData.posSettings || { brandColor: "#2c3e50", isDarkMode: false, name: "Main Register" };

    // 1. NEW: Update the Browser Tab Title!
    document.title = `${settings.name} Admin | TinyPOS`;

    // 2. Inject custom brand color instantly
    document.documentElement.style.setProperty('--brand-color', settings.brandColor);

    // 3. Toggle Dark Mode class on the main body
    if (settings.isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [menuData]);

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

  // Saves the custom receipt form to our JSON cloud object
  const handleSaveReceipt = () => {
    const updatedMenu = { ...menuData, receiptSettings: receiptForm };
    saveMenuToCloud(updatedMenu);
    
    // NEW: Save the logo locally so the boot screen can access it instantly!
    if (receiptForm.logo) {
      localStorage.setItem('tinypos_boot_logo', receiptForm.logo);
    } else {
      localStorage.removeItem('tinypos_boot_logo'); // If they removed the logo
    }
    
    showAlert("Success", "Receipt settings & App Logo saved successfully!");
  };

  // --- DYNAMIC FAVICON INJECTION ---
  useEffect(() => {
    // Try to get the logo from the cloud first, fallback to local storage
    const savedLogo = menuData?.receiptSettings?.logo || localStorage.getItem('tinypos_boot_logo');
    
    if (savedLogo) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = savedLogo; 
    }
  }, [menuData]);

  // Saves the general POS settings (colors, locks)
  const handleSaveGeneralSettings = () => {
    // Safety check for PIN
    if (!generalSettings.pinCode || generalSettings.pinCode.length < 4) {
      return showAlert("Invalid PIN", "Please enter at least a 4-digit PIN code so you don't get locked out!");
    }

    const updatedMenu = { ...menuData, posSettings: generalSettings };
    saveMenuToCloud(updatedMenu);
    showAlert("Success", "Settings saved! Changes will instantly apply.");
  };

  // Saves the custom loyalty settings to our JSON cloud object
  const handleSaveLoyalty = () => {
    if (loyaltyForm.visitsRequired < 1) return window.confirm("Visits required must be at least 1.");
    if (!loyaltyForm.rewardDescription.trim()) return window.confirm("Please describe the reward.");

    const updatedMenu = { ...menuData, loyaltySettings: loyaltyForm };
    saveMenuToCloud(updatedMenu);
    showAlert("Success", "Loyalty program settings saved successfully!");
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
    { id: 1, name: 'Admin', pin: '1234' },
    { id: 2, name: 'Barista 1', pin: '0000' }
  ];

  const [newCashier, setNewCashier] = useState({ name: '', pin: '' });
  const [editingCashier, setEditingCashier] = useState(null);

  // --- CASHIER FUNCTIONS ---
  const handleAddCashier = () => {
    if (!newCashier.name || newCashier.pin.length !== 4) return window.confirm("Please enter a name and a exactly 4-digit PIN.");
    const updatedCashiers = [...cashiers, { id: Date.now(), name: newCashier.name, pin: newCashier.pin }];
    saveMenuToCloud({ ...menuData, cashiers: updatedCashiers });
    setNewCashier({ name: '', pin: '' });
  };

  const handleDeleteCashier = (idToRemove) => {
    if (cashiers.length <= 1) return window.confirm("You cannot delete the last profile!");
    if (window.confirm("Are you sure you want to remove this cashier?")) {
      const updatedCashiers = cashiers.filter(c => c.id !== idToRemove);
      saveMenuToCloud({ ...menuData, cashiers: updatedCashiers });
    }
  };

  const handleSaveEditCashier = () => {
    if (!editingCashier.name || editingCashier.pin.length !== 4) return window.confirm("Please enter a name and exactly 4 digits for the PIN.");
    const updatedCashiers = cashiers.map(c => c.id === editingCashier.id ? editingCashier : c);
    saveMenuToCloud({ ...menuData, cashiers: updatedCashiers });
    setEditingCashier(null);
  };


  // Basic Menu/Modifier/Deletion Logic (Unchanged)
  const handleAddCategory = () => { if (!newCategoryName.trim()) return; const updatedMenu = { ...menuData }; updatedMenu.categories[newCategoryName] = []; saveMenuToCloud(updatedMenu); setNewCategoryName(""); };
  const handleAddDrink = () => { if (!newItemForm.category || !newItemForm.name || !newItemForm.price) return window.confirm("Fill all fields."); const updatedMenu = { ...menuData }; const newDrink = { id: newItemForm.name.toLowerCase().replace(/\s+/g, '_'), name: newItemForm.name, basePrice: parseFloat(newItemForm.price), emoji: newItemForm.emoji, allowedModifiers: [] }; updatedMenu.categories[newItemForm.category].push(newDrink); saveMenuToCloud(updatedMenu); setNewItemForm({ ...newItemForm, name: "", price: "" }); };
  const handleAddModifierGroup = () => { if (!newModGroupName.trim()) return; const groupKey = newModGroupName.toLowerCase().replace(/\s+/g, '_'); const updatedMenu = { ...menuData }; if (!updatedMenu.modifierGroups[groupKey]) { updatedMenu.modifierGroups[groupKey] = []; saveMenuToCloud(updatedMenu); } setNewModGroupName(""); };

  const handleAddModifierOption = () => {
    // Safety check: If it's a standard button, it needs a price. If it's text, it doesn't!
    if (!newModOption.groupKey || !newModOption.name || (!newModOption.isTextInput && newModOption.price === "")) {
      return showAlert("Missing Info", "Please fill all required fields.");
    }

    const updatedMenu = { ...menuData };
    const newOption = {
      id: newModOption.name.toLowerCase().replace(/\s+/g, '_'),
      name: newModOption.name,
      // If it's a text input, force price to 0. Otherwise, parse the number.
      price: newModOption.isTextInput ? 0 : parseFloat(newModOption.price),
      isTextInput: newModOption.isTextInput // Save the flag!
    };

    updatedMenu.modifierGroups[newModOption.groupKey].push(newOption);
    saveMenuToCloud(updatedMenu);

    // Reset the form
    setNewModOption({ groupKey: newModOption.groupKey, name: "", price: "0", isTextInput: false });
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

  // 2.5 Calculate Total Expenses & Net Profit
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    return expenses.filter(exp => {
      if (timeFilter === 'all') return true;
      
      const expDate = new Date(exp.timestamp);

      // FIX 3: Strict calendar-day matching for Gastos
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
    const newIngredient = { id: `ing_${Date.now()}`, name: "", cost: "" };
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
      <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#2c3e50', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ margin: 0, color: '#2c3e50' }}>Admin Login</h2>
            <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕ Close</button>
          </div>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#666' }}>Email Address</label>
              <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#666' }}>Password</label>
              <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }} />
            </div>
            <button type="submit" style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '8px' }}>Access Dashboard</button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <h1 style={{ letterSpacing: '2px', textTransform: 'uppercase' }}>
          Loading Admin
        </h1>
      </div>
    );
  }

  const switchTab = (tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="admin-layout">

      {/* --- MOBILE OVERLAY --- */}
      <div
        className={`admin-overlay ${isMobileMenuOpen ? 'open' : ''}`}
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      {/* --- SIDEBAR --- */}
      {/* UPDATED: Background is now var(--brand-color) */}
      <aside className={`admin-aside ${isMobileMenuOpen ? 'open' : ''}`}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{generalSettings.name} - POS <p>Admin</p></h2>
          <button className="desktop-hidden" onClick={() => setIsMobileMenuOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', padding: '16px 0', flex: 1 }}>
          <button onClick={() => switchTab('analytics')} style={{ padding: '16px 24px', textAlign: 'left', background: activeTab === 'analytics' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>📊 Analytics</button>
          <button onClick={() => switchTab('orders')} style={{ padding: '16px 24px', textAlign: 'left', background: activeTab === 'orders' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>🧾 Receipt History</button>
          <button onClick={() => switchTab('menu')} style={{ padding: '16px 24px', textAlign: 'left', background: activeTab === 'menu' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>📋 Menu Editor</button>
          <button onClick={() => switchTab('modifiers')} style={{ padding: '16px 24px', textAlign: 'left', background: activeTab === 'modifiers' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>🎛️ Modifier Library</button>
          <button onClick={() => switchTab('receipt')} style={{ padding: '16px 24px', textAlign: 'left', background: activeTab === 'receipt' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>🖨️ Receipt Settings</button>
          <button onClick={() => switchTab('calculator')} style={{ padding: '16px 24px', textAlign: 'left', background: activeTab === 'calculator' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>🧮 Price Calculator</button>
          <button onClick={() => switchTab('loyalty')} style={{ padding: '16px 24px', textAlign: 'left', background: activeTab === 'loyalty' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>🎁 Loyalty Program</button>
          <button onClick={() => switchTab('discounts')} style={{ padding: '16px 24px', textAlign: 'left', background: activeTab === 'discounts' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>🏷️ Auto Discounts</button>
          <button onClick={() => switchTab('team')} style={{ padding: '16px 24px', textAlign: 'left', background: activeTab === 'team' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>👥 Team & PINs</button>
          <button onClick={() => switchTab('settings')} style={{ padding: '16px 24px', textAlign: 'left', background: activeTab === 'settings' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem' }}>⚙️ General Settings</button>
        </nav>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={handleLogout} style={{ width: '100%', padding: '12px', background: 'transparent', color: '#ccc', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Sign Out</button>
          <button onClick={() => navigate('/')} style={{ width: '100%', padding: '12px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>← Back to Register</button>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="admin-main">
        <div className="desktop-hidden" style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <button className="mobile-hamburger" onClick={() => setIsMobileMenuOpen(true)}>☰</button>
          <h2 style={{ margin: '0 0 0 16px', fontSize: '1.2rem', color: 'var(--text-main)' }}>Admin Dashboard</h2>
        </div>

        {isSaving && <div style={{ position: 'fixed', top: 20, right: 20, background: '#27ae60', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>Saving to Cloud...</div>}

        {/* --- MERGED ANALYTICS & PERFORMANCE TAB --- */}
        {activeTab === 'analytics' && (
          <div className="admin-section fade-in">

            {/* 1. HEADER & FILTERS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div>
                <h1 style={{ margin: 0, color: 'var(--text-main)' }}>Dashboard Overview</h1>
                <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Real-time sales performance and inventory movement.</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-surface)', color: 'var(--text-main)' }}>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                  <option value="6months">Last 6 Months</option>
                  <option value="year">Last Year</option>
                  <option value="all">All Time</option>
                </select>
                <button onClick={handleDownloadCSV} style={{ padding: '10px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📥 Export CSV
                </button>
              </div>
            </div>

            {/* 2. TOP STATS CARDS */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '32px', flexWrap: 'wrap' }}>

              <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #2980b9' }}>
                <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Gross Revenue</h3>
                <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>${totalRevenue.toFixed(2)}</p>
              </div>

              <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #e74c3c' }}>
                <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Total Expenses</h3>
                <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c' }}>-${totalExpenses.toFixed(2)}</p>
              </div>

              <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #f39c12' }}>
                  <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Total Refunded</h3>
                  <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#f39c12' }}>${totalRefunds.toFixed(2)}</p>
                </div>
                <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #27ae60' }}>
                  <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Net Profit</h3>
                  <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#27ae60' }}>${netProfit.toFixed(2)}</p>
                </div>

              <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #9b59b6' }}>
                <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Payment Methods</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', color: 'var(--text-main)', fontWeight: 'bold', flexWrap: 'wrap', gap: '8px' }}>
                  <span>💵 {methodCounts['Cash'] || 0}</span>
                  <span>💳 {methodCounts['Card'] || 0}</span>
                  <span>📱 {methodCounts['Transfer'] || 0}</span>
                  {(methodCounts['Split'] > 0) && <span style={{ color: 'var(--brand-color)' }}>🔀 {methodCounts['Split']} Splits</span>}
                </div>
              </div>

            </div>

            {/* 3. TWO-COLUMN LAYOUT FOR LISTS */}
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>

              {/* LEFT COLUMN: Top Selling Drinks */}
              <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Top Selling Drinks</h3>
                {topItemsArray.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No sales data yet.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {topItemsArray.map(([itemName, count], index) => (
                      <li key={itemName} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px dashed var(--border)', fontSize: '1.1rem', color: 'var(--text-main)' }}>
                        <span><span style={{ color: 'var(--text-muted)', marginRight: '10px' }}>#{index + 1}</span> {itemName}</span>
                        <span style={{ fontWeight: 'bold', background: 'var(--bg-main)', padding: '4px 12px', borderRadius: '20px', color: 'var(--text-main)' }}>{count} sold</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* RIGHT COLUMN: Cashier Leaderboard */}
              <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Team Performance</h3>

                {filteredSales.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No cashier data yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {Object.entries(
                      // FIX: Use filteredSales so it respects your time drop-down!
                      filteredSales.reduce((acc, order) => {

                        // FIX: Look for Supabase's snake_case
                        const name = order.cashier_name || 'Unknown';

                        if (!acc[name]) acc[name] = { sales: 0, tickets: 0 };

                        // FIX: Look for Supabase's total_amount
                        acc[name].sales += order.total_amount || 0;
                        acc[name].tickets += 1;

                        return acc;
                      }, {})
                    )
                      .sort((a, b) => b[1].sales - a[1].sales) // Sort by highest sales
                      .map(([name, data]) => (
                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ height: '36px', width: '36px', borderRadius: '18px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem' }}>
                              {name.charAt(0)}
                            </div>
                            <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.05rem' }}>{name}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#27ae60' }}>${data.sales.toFixed(2)}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{data.tickets} tickets</div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        
              {/* 1.5 RECEIPT HISTORY / REFUNDS TAB */}
          {activeTab === 'orders' && (
            <div className="admin-section fade-in">
              <h1 style={{ color: 'var(--text-main)', marginBottom: '24px' }}>Receipt History & Refunds</h1>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {dexieSales.slice().reverse().map(order => (
                  <div key={order.id} style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--brand-color)' }}>Order #{order.id}</span>
                        {order.status === 'refunded' && <span style={{ background: '#e74c3c', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>VOIDED</span>}
                        {order.status === 'partial_refund' && <span style={{ background: '#f39c12', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>PARTIAL REFUND</span>}
                        {order.status === 'completed' && <span style={{ background: '#27ae60', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>COMPLETED</span>}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {new Date(order.created_at).toLocaleString()} | Cashier: {order.cashier_name} | {order.payment_method}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)', textDecoration: order.status === 'refunded' ? 'line-through' : 'none' }}>
                          ${Number(order.total_amount || 0).toFixed(2)}
                        </div>
                        {order.refund_amount > 0 && <div style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: '0.9rem' }}>-${Number(order.refund_amount).toFixed(2)} refunded</div>}
                      </div>
                      
                      <button 
                        onClick={() => {
                          const typedPin = window.prompt("Admin/Manager PIN REQUIRED to issue refund:");
                          if (typedPin !== generalSettings.pinCode) return alert("Invalid PIN.");
                          
                          const refundAmtRaw = window.prompt("Enter amount to refund (Type 'ALL' for full refund):");
                          if (!refundAmtRaw) return;
                          
                          let isFull = refundAmtRaw.toUpperCase() === 'ALL';
                          let rAmt = 0;
                          
                          if (isFull) {
                            rAmt = Number(order.total_amount);
                          } else {
                            rAmt = parseFloat(refundAmtRaw);
                            if (isNaN(rAmt) || rAmt <= 0) return alert("Invalid amount.");
                          }
                          
                          if (rAmt > order.total_amount) return alert("Cannot refund more than ticket total.");
                          
                          let newStatus = 'completed';
                          if (rAmt >= order.total_amount) {
                            newStatus = 'refunded';
                            rAmt = order.total_amount;
                          } else if (rAmt > 0) {
                            newStatus = 'partial_refund';
                          }

                          const prevRefund = Number(order.refund_amount || 0);

                          db.sales.update(order.id, { status: newStatus, refund_amount: prevRefund + rAmt });
                          
                          if (navigator.onLine) {
                            supabase.from('sales').update({ status: newStatus, refund_amount: prevRefund + rAmt }).eq('id', order.id).then();
                          }
                        }}
                        disabled={order.status === 'refunded'}
                        style={{ padding: '12px 24px', background: order.status === 'refunded' ? 'var(--bg-main)' : 'rgba(231, 76, 60, 0.1)', color: order.status === 'refunded' ? 'var(--text-muted)' : '#e74c3c', border: `2px solid ${order.status==='refunded' ? 'transparent' : '#e74c3c'}`, borderRadius: '8px', cursor: order.status === 'refunded' ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: '0.2s' }}
                      >
                        Issue Refund
                      </button>
                    </div>
                  </div>
                ))}
                
                {dexieSales.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '40px 0' }}>No sales history yet.</p>}
              </div>
            </div>
          )}

          {/* 2. MENU EDITOR TAB */}
        {activeTab === 'menu' && (
          <div>
            <h1 style={{ color: 'var(--text-main)' }}>Menu Editor</h1>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Add New Category</h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="text" placeholder="e.g., Cold Brews" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                    <button onClick={handleAddCategory} style={{ padding: '10px 20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Add</button>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Add New Drink / Item</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <select value={newItemForm.category} onChange={(e) => setNewItemForm({ ...newItemForm, category: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                      {Object.keys(menuData.categories).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>

                    {/* NEW: Emoji & Name Row */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="text"
                        maxLength="2"
                        placeholder="☕"
                        value={newItemForm.emoji}
                        onChange={(e) => setNewItemForm({ ...newItemForm, emoji: e.target.value })}
                        style={{ width: '60px', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', fontSize: '1.2rem' }}
                        title="Item Emoji"
                      />
                      <input
                        type="text"
                        placeholder="Item Name (e.g., Cold Brew)"
                        value={newItemForm.name}
                        onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
                        style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                      />
                    </div>

                    <input type="number" placeholder="Base Price" value={newItemForm.price} onChange={(e) => setNewItemForm({ ...newItemForm, price: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                    <button onClick={handleAddDrink} style={{ padding: '12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Save Item</button>
                  </div>
                </div>

              </div>

              <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Live Menu Preview</h3>
                {Object.keys(menuData.categories).map(category => (
                  <div key={category} style={{ marginBottom: '20px', padding: '10px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ color: 'var(--text-main)', margin: 0 }}>{category}</h4>
                      <button onClick={() => handleDeleteCategory(category)} style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>🗑️</button>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {menuData.categories[category].length === 0 ? <li style={{ color: 'var(--text-muted)', fontSize: '0.9rem', paddingLeft: '10px' }}>No items yet...</li> : (
                        menuData.categories[category].map(item => (
                          <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px dashed var(--border)', fontSize: '0.95rem', background: 'var(--bg-surface)' }}>

                            {/* 1. The Drink Name & Price (Now with Emojis!) */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ color: 'var(--text-main)' }}>{item.emoji || '•'} {item.name}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>${item.basePrice}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => setEditingDrink({ categoryName: category, drink: item })}
                                style={{ background: '#e8f4fd', border: 'none', color: '#2980b9', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                              >
                                Edit Modifiers
                              </button>
                              <button
                                onClick={() => handleDeleteDrink(category, item.id, item.name)}
                                style={{ background: '#ffeeee', border: 'none', color: '#e74c3c', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                              >
                                Delete
                              </button>
                            </div>

                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3. MODIFIER LIBRARY TAB */}
        {activeTab === 'modifiers' && (
          <div className="admin-section fade-in">
            <h1 style={{ color: 'var(--text-main)' }}>Modifier Library</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Create groups (e.g., Milk, Personalización) and their options (e.g., Oat +$12, Nombre del Cliente).</p>

            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

              <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* CREATE GROUP */}
                <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Create Modifier Group</h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="text" placeholder="e.g., Tipo de Letra" value={newModGroupName} onChange={(e) => setNewModGroupName(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                    <button onClick={handleAddModifierGroup} style={{ padding: '10px 20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Create</button>
                  </div>
                </div>

                {/* ADD OPTION TO GROUP */}
                <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Add Option to Group</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    <select value={newModOption.groupKey} onChange={(e) => setNewModOption({ ...newModOption, groupKey: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                      <option value="">Select a Group...</option>
                      {Object.keys(menuData.modifierGroups).map(key => <option key={key} value={key}>{key.replace('_', ' ').toUpperCase()}</option>)}
                    </select>

                    <input type="text" placeholder="e.g., Nombre a Bordar" value={newModOption.name} onChange={(e) => setNewModOption({ ...newModOption, name: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />

                    {/* NEW: THE TEXT INPUT TOGGLE */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={newModOption.isTextInput}
                        onChange={(e) => setNewModOption({ ...newModOption, isTextInput: e.target.checked })}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>This is a Text Input Field</span>
                    </label>

                    {/* ONLY SHOW PRICE IF IT IS A STANDARD BUTTON */}
                    {!newModOption.isTextInput && (
                      <input type="number" placeholder="Additional Price (0 if free)" value={newModOption.price} onChange={(e) => setNewModOption({ ...newModOption, price: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                    )}

                    <button onClick={handleAddModifierOption} style={{ padding: '12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Add Option</button>
                  </div>
                </div>
              </div>

              {/* GLOBAL MODIFIER LIST */}
              <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Global Modifier Groups</h3>
                {Object.keys(menuData.modifierGroups).map(groupKey => (
                  <div key={groupKey} style={{ marginBottom: '20px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '12px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 'bold', textTransform: 'capitalize', color: 'var(--text-main)' }}>
                        {groupKey.replace('_', ' ')}
                      </span>
                      <button
                        onClick={() => handleDeleteModifierGroup(groupKey)}
                        style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '1.2rem' }}
                        title="Delete Entire Group"
                      >
                        🗑️
                      </button>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {menuData.modifierGroups[groupKey].length === 0 ? <li style={{ padding: '12px', color: 'var(--text-muted)' }}>No options added.</li> : (
                        menuData.modifierGroups[groupKey].map(opt => (
                          <li key={opt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid var(--border)', color: 'var(--text-main)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{opt.name}</span>
                              {/* NEW: VISUAL BADGE FOR TEXT INPUTS */}
                              {opt.isTextInput ? (
                                <span style={{ background: '#3498db', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>TEXT FIELD ✍️</span>
                              ) : (
                                <span style={{ color: '#27ae60', fontWeight: 'bold' }}>+${opt.price}</span>
                              )}
                            </div>
                            <button onClick={() => handleDeleteModifierOption(groupKey, opt.id, opt.name)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>✕</button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ))}
              </div>

            </div>
          </div>
        )}

        {/* 4. RECEIPT TAB */}
        {activeTab === 'receipt' && (
          <div>
            <h1 style={{ color: 'var(--text-main)' }}>Receipt Settings</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Customize the text and logo that prints on customer tickets.</p>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Thermal Printer Logo (PNG Format)</label>
                  <input type="file" accept="image/png" onChange={handleLogoUpload} style={{ padding: '8px', color: 'var(--text-main)' }} />
                  {receiptForm.logo && (
                    <button onClick={() => setReceiptForm({ ...receiptForm, logo: null })} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '0.9rem' }}>Remove Logo</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Header Text (Shop Name)</label>
                  <input type="text" value={receiptForm.header} onChange={(e) => setReceiptForm({ ...receiptForm, header: e.target.value })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Sub-Header (Location / Info)</label>
                  <input type="text" value={receiptForm.subheader} onChange={(e) => setReceiptForm({ ...receiptForm, subheader: e.target.value })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Footer Message (Wi-Fi, IG, etc.)</label>
                  <textarea rows="3" value={receiptForm.footer} onChange={(e) => setReceiptForm({ ...receiptForm, footer: e.target.value })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'inherit', background: 'var(--bg-main)', color: 'var(--text-main)' }} />                    
                </div>

                <h3 style={{ marginTop: '24px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Tax / SAT Compliance</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Print Tax Breakdown on Receipts</label>
                  <select 
                    value={receiptForm.enableTaxBreakdown || false} 
                    onChange={(e) => setReceiptForm({ ...receiptForm, enableTaxBreakdown: e.target.value === 'true' })} 
                    style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                  >
                    <option value={false}>No - Just show the Grand Total</option>
                    <option value={true}>Yes - Extract IVA</option>
                  </select>
                  <small style={{ color: 'var(--text-muted)' }}>This does NOT add tax on top of your prices. It extracts the tax from your existing menu prices.</small>
                </div>

                {receiptForm.enableTaxBreakdown && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Tax Rate (%)</label>
                    <input 
                      type="number" 
                      value={receiptForm.taxRate || 16} 
                      onChange={(e) => setReceiptForm({ ...receiptForm, taxRate: parseFloat(e.target.value) || 0 })} 
                      style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
                    />
                  </div>
                )}
                <button onClick={handleSaveReceipt} style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>Save Global Receipt Settings</button>
              </div>
              <div style={{ flex: 1, minWidth: '300px', maxWidth: '400px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h3 style={{ marginTop: 0, alignSelf: 'flex-start', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Live Preview</h3>
                <div style={{ width: '100%', padding: '20px', background: '#fdfdfd', border: '1px solid #ddd', fontFamily: 'monospace', textAlign: 'center', whiteSpace: 'pre-wrap', color: 'black' }}>
                  {receiptForm.logo && <img src={receiptForm.logo} alt="Shop Logo" style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain', filter: 'grayscale(100%) contrast(200%)', marginBottom: '10px' }} />}
                  <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{receiptForm.header}</div>
                  <div>{receiptForm.subheader}</div>
                  <div style={{ margin: '15px 0' }}>---------------------------------</div>
                  <div style={{ textAlign: 'left' }}>               1x Americano       $45.00</div>
                  <div style={{ textAlign: 'left' }}>               1x Flat White        $55.00</div>
                  <div style={{ textAlign: 'left' }}>               1x Croissant         $35.00</div>
                  <div style={{ margin: '15px 0' }}>---------------------------------</div>

                  
                  {/* --- NEW: Dynamic Tax Preview --- */}
                  {receiptForm.enableTaxBreakdown && (
                    <>
                      <div style={{ textAlign: 'left', fontSize: '0.9rem', color: '#555' }}>                  Subtotal             ${(135 / (1 + ((receiptForm.taxRate || 16) / 100))).toFixed(2)}</div>
                      <div style={{ textAlign: 'left', fontSize: '0.9rem', color: '#555', marginBottom: '8px' }}>                  IVA ({receiptForm.taxRate || 16}%)           ${(135 - (135 / (1 + ((receiptForm.taxRate || 16) / 100)))).toFixed(2)}</div>
                    </>
                  )}
                  {/* -------------------------------- */}
                  <div style={{ margin: '15px 0', fontSize: '0.9rem' }}>{receiptForm.footer}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. LOYALTY SETTINGS TAB */}
        {activeTab === 'loyalty' && (
          <div className="admin-section fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h1 style={{ margin: 0, color: 'var(--text-main)' }}>Loyalty Program</h1>
                <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Design your customer reward system and manage active promotions.</p>
              </div>

              {/* MASTER KILL SWITCH (Now auto-saves to prevent desync!) */}
              <button
                onClick={() => {
                  const newForm = { ...loyaltyForm, isActive: !loyaltyForm.isActive };
                  setLoyaltyForm(newForm);
                  // Auto-save this critical state instantly
                  const updatedMenu = { ...menuData, loyaltySettings: newForm };
                  saveMenuToCloud(updatedMenu);
                  showAlert("Success", newForm.isActive ? "Loyalty Program is now ACTIVE!" : "Loyalty Program is now PAUSED!");
                }}
                style={{ padding: '10px 20px', background: loyaltyForm.isActive ? '#27ae60' : 'transparent', color: loyaltyForm.isActive ? 'white' : 'var(--text-muted)', border: `2px solid ${loyaltyForm.isActive ? '#27ae60' : 'var(--border)'}`, borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
              >
                {loyaltyForm.isActive ? '🟢 Program is ACTIVE' : '⏸️ Program is PAUSED'}
              </button>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: loyaltyForm.isActive ? 1 : 0.5, pointerEvents: loyaltyForm.isActive ? 'auto' : 'none' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Visits Required</label>
                <input
                  type="number"
                  min="1"
                  value={loyaltyForm.visitsRequired}
                  onChange={(e) => setLoyaltyForm({ ...loyaltyForm, visitsRequired: parseInt(e.target.value) || 10 })}
                  style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1.2rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                />
                <small style={{ color: 'var(--text-muted)' }}>How many stars do they need to collect before unlocking the reward?</small>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: loyaltyForm.isActive ? 1 : 0.5, pointerEvents: loyaltyForm.isActive ? 'auto' : 'none' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Reward Description</label>
                <input
                  type="text"
                  placeholder="e.g., tu próxima bebida GRATIS"
                  value={loyaltyForm.rewardDescription}
                  onChange={(e) => setLoyaltyForm({ ...loyaltyForm, rewardDescription: e.target.value })}
                  style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1.1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                />
                <small style={{ color: 'var(--text-muted)' }}>This exact text will be sent to the customer on WhatsApp when they hit their goal!</small>
              </div>

              {/* Live WhatsApp Preview Box */}
              <div style={{ background: '#fff0f5', border: '2px solid #ff69b4', padding: '20px', borderRadius: '8px', marginTop: '10px', opacity: loyaltyForm.isActive ? 1 : 0.5 }}>
                <h4 style={{ color: '#ff1493', margin: '0 0 10px 0', textTransform: 'uppercase' }}>WhatsApp Preview (Visit #{loyaltyForm.visitsRequired}):</h4>
                <p style={{ margin: 0, fontFamily: 'monospace', color: '#333', whiteSpace: 'pre-wrap' }}>
                  {`🎉 *¡Felicidades!*\nEsta es tu visita #${loyaltyForm.visitsRequired}. ¡Te has ganado ${loyaltyForm.rewardDescription}!\n`}
                </p>
              </div>

              <button
                onClick={handleSaveLoyalty}
                style={{ padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '8px', fontSize: '1.1rem' }}
              >
                Save Settings
              </button>

              {/* DANGER ZONE */}
              <div style={{ marginTop: '20px', paddingTop: '24px', borderTop: '2px dashed #e74c3c' }}>
                <h3 style={{ color: '#e74c3c', marginTop: 0 }}>Danger Zone</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>Starting a new promotion? Wipe all current customer stars back to zero.</p>
                <button
                  onClick={handleResetLoyaltyData}
                  style={{ width: '100%', padding: '12px', background: 'transparent', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ⚠️ Reset All Customer Stars to Zero
                </button>
              </div>

            </div>
          </div>
        )}

        {/* --- AUTOMATED DISCOUNTS TAB --- */}
        {activeTab === 'discounts' && (
          <div className="admin-section fade-in">
            <h1 style={{ color: 'var(--text-main)' }}>Automated Discount Rules</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Create rules that automatically apply discounts to the cart without the cashier doing anything.</p>

            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

              {/* CREATE RULE FORM */}
              <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Create New Rule</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <input type="text" placeholder="Rule Name (e.g., Happy Hour)" value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select value={newRule.type} onChange={(e) => setNewRule({ ...newRule, type: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                      <option value="percentage">% Percentage</option>
                      <option value="flat">$ Flat Amount</option>
                    </select>
                    <input type="number" placeholder="Value (e.g., 10)" value={newRule.value} onChange={(e) => setNewRule({ ...newRule, value: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>What does this apply to?</label>
                    <select value={newRule.targetType} onChange={(e) => setNewRule({ ...newRule, targetType: e.target.value, targetValue: '' })} style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                      <option value="cart">The Entire Order</option>
                      <option value="item">A Specific Item</option>
                    </select>
                  </div>

                  {newRule.targetType === 'item' && (
                    <select value={newRule.targetValue} onChange={(e) => setNewRule({ ...newRule, targetValue: e.target.value })} style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                      <option value="">Select an Item...</option>
                      {Object.keys(menuData.categories).map(cat =>
                        menuData.categories[cat].map(item => (
                          <option key={item.id} value={item.name}>{item.name} (from {cat})</option>
                        ))
                      )}
                    </select>
                  )}

                  <button
                    onClick={() => {
                      if (!newRule.name || !newRule.value || (newRule.targetType === 'item' && !newRule.targetValue)) return showAlert("Error", "Please fill all fields.");
                      const updatedMenu = { ...menuData };
                      if (!updatedMenu.discountRules) updatedMenu.discountRules = [];
                      updatedMenu.discountRules.push({ ...newRule, id: Date.now(), value: parseFloat(newRule.value), isActive: true });
                      saveMenuToCloud(updatedMenu);
                      setNewRule({ name: '', type: 'percentage', value: '', targetType: 'cart', targetValue: '' });
                      showAlert("Success", "Automated rule created!");
                    }}
                    style={{ padding: '14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    + Add Rule
                  </button>
                </div>
              </div>

              {/* LIST OF ACTIVE RULES */}
              <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Active Rules</h3>
                {(!menuData.discountRules || menuData.discountRules.length === 0) ? (
                  <p style={{ color: 'var(--text-muted)' }}>No automated rules exist yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {menuData.discountRules.map(rule => (
                      <div key={rule.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: rule.isActive ? 'var(--bg-main)' : 'var(--bg-surface)', opacity: rule.isActive ? 1 : 0.6 }}>
                        <div>
                          <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>{rule.name}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {rule.type === 'percentage' ? `${rule.value}% off` : `$${rule.value.toFixed(2)} off`} • {rule.targetType === 'cart' ? 'Entire Order' : `Item: ${rule.targetValue}`}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            onClick={() => {
                              const updatedMenu = { ...menuData };
                              const ruleIndex = updatedMenu.discountRules.findIndex(r => r.id === rule.id);
                              updatedMenu.discountRules[ruleIndex].isActive = !rule.isActive;
                              saveMenuToCloud(updatedMenu);
                            }}
                            style={{ padding: '8px 12px', background: 'transparent', color: 'var(--brand-color)', border: '1px solid var(--brand-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            {rule.isActive ? 'Pause' : 'Activate'}
                          </button>
                          <button
                            onClick={() => {
                              showConfirm("Delete Rule", "Are you sure you want to delete this discount rule?", () => {
                                const updatedMenu = { ...menuData };
                                updatedMenu.discountRules = updatedMenu.discountRules.filter(r => r.id !== rule.id);
                                saveMenuToCloud(updatedMenu);
                              });
                            }}
                            style={{ padding: '8px 12px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- TEAM & CASHIER MANAGEMENT TAB --- */}
        {activeTab === 'team' && (
          <div className="admin-section fade-in">
            <h2 style={{ color: 'var(--text-main)', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>Team Management</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Create profiles and 4-digit PINs for your staff to track who is running the register.</p>

            {/* ADD NEW CASHIER FORM */}
            <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
              <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Add New Team Member</h3>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Cashier Name (e.g., Alex)"
                  value={newCashier.name}
                  onChange={(e) => setNewCashier({ ...newCashier, name: e.target.value })}
                  style={{ flex: 2, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem' }}
                />
                <input
                  type="password"
                  maxLength="4"
                  placeholder="4-Digit PIN"
                  value={newCashier.pin}
                  onChange={(e) => setNewCashier({ ...newCashier, pin: e.target.value.replace(/\D/g, '') })} // Force numbers only
                  style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.2rem', letterSpacing: '4px', textAlign: 'center' }}
                />
                <button
                  onClick={handleAddCashier}
                  style={{ padding: '12px 24px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
                >
                  + Add Profile
                </button>
              </div>
            </div>

            {/* CURRENT STAFF LIST */}
            <h3 style={{ color: 'var(--text-main)', marginBottom: '15px' }}>Current Staff</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cashiers.map(cashier => (
                <div key={cashier.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--border)' }}>

                  {/* IF THIS ROW IS IN EDIT MODE */}
                  {editingCashier && editingCashier.id === cashier.id ? (
                    <div style={{ display: 'flex', gap: '10px', width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={editingCashier.name}
                        onChange={(e) => setEditingCashier({ ...editingCashier, name: e.target.value })}
                        style={{ flex: 2, padding: '10px', borderRadius: '6px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                      />
                      <input
                        type="password"
                        maxLength="4"
                        value={editingCashier.pin}
                        onChange={(e) => setEditingCashier({ ...editingCashier, pin: e.target.value.replace(/\D/g, '') })}
                        style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', letterSpacing: '4px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                        <button onClick={() => setEditingCashier(null)} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={handleSaveEditCashier} style={{ padding: '8px 16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                      </div>
                    </div>
                  ) : (

                    /* IF THIS ROW IS IN NORMAL DISPLAY MODE */
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ height: '40px', width: '40px', borderRadius: '20px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
                          {cashier.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>{cashier.name}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>PIN: ****</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        {/* THE NEW EDIT BUTTON */}
                        <button
                          onClick={() => setEditingCashier(cashier)}
                          style={{ padding: '8px 16px', background: 'transparent', color: '#2980b9', border: '1px solid #2980b9', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteCashier(cashier.id)}
                          style={{ padding: '8px 16px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}

                </div>
              ))}
            </div>

          </div>
        )}

        {/* 5. GENERAL SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div>
            <h1 style={{ color: 'var(--text-main)' }}>General Settings</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Customize the look, feel, and security of your POS terminal.</p>
            <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Register Name</label>
                <input type="text" value={generalSettings.name} onChange={(e) => setGeneralSettings({ ...generalSettings, name: e.target.value })} placeholder="e.g., Front Counter iPad" style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Primary Brand Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <input type="color" value={generalSettings.brandColor} onChange={(e) => setGeneralSettings({ ...generalSettings, brandColor: e.target.value })} style={{ width: '60px', height: '50px', border: 'none', cursor: 'pointer', padding: 0, borderRadius: '8px', overflow: 'hidden' }} />
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '1.1rem' }}>{generalSettings.brandColor.toUpperCase()}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Color Theme</label>
                <select value={generalSettings.isDarkMode} onChange={(e) => setGeneralSettings({ ...generalSettings, isDarkMode: e.target.value === 'true' })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                  <option value={false}>☀️ Light Mode</option>
                  <option value={true}>🌙 Dark Mode</option>
                </select>
              </div>
              <h3 style={{ marginTop: '16px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Security</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Auto-Lock Timer (Minutes)</label>
                <input type="number" min="0" value={generalSettings.autoLockMinutes} onChange={(e) => setGeneralSettings({ ...generalSettings, autoLockMinutes: parseInt(e.target.value) || 0 })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                <small style={{ color: 'var(--text-muted)' }}>If the register is not touched for this many minutes, it will require a PIN. Set to 0 to turn off.</small>
              </div>

              <h3 style={{ marginTop: '16px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Team Workflow</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Ticket Visibility Mode</label>
                <select
                  value={generalSettings.ticketVisibility || 'open'}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, ticketVisibility: e.target.value })}
                  style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                >
                  <option value="open">Open Floor (Everyone sees all active tickets)</option>
                  <option value="isolated">Isolated (Staff only see their own tickets)</option>
                </select>
                <small style={{ color: 'var(--text-muted)' }}>Isolated mode is great for traditional waiters who manage their own specific tables/orders.</small>
              </div>

              {/* <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Unlock PIN Code</label>
                <input type="text" maxLength="8" value={generalSettings.pinCode} onChange={(e) => setGeneralSettings({...generalSettings, pinCode: e.target.value})} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', letterSpacing: '4px', fontFamily: 'monospace', fontSize: '1.2rem', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
              </div>*/}
              <h3 style={{ marginTop: '16px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Order Numbers</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Auto-Reset Frequency</label>
                <select
                  value={generalSettings.orderResetPolicy || 'daily'}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, orderResetPolicy: e.target.value })}
                  style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                >
                  <option value="never">Never Reset (Count infinitely)</option>
                  <option value="daily">Daily (Resets to #1 every morning)</option>
                  <option value="weekly">Weekly (Resets every Monday)</option>
                  <option value="monthly">Monthly (Resets 1st of the month)</option>
                  <option value="yearly">Yearly (Resets Jan 1st)</option>
                </select>
                <small style={{ color: 'var(--text-muted)' }}>How often should the ticket numbers go back to Order #1?</small>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Manual Override</label>
                <button
                  onClick={() => {
                    if (window.confirm("Are you sure? This will force the next ticket to be Order #1.")) {
                      localStorage.setItem('tinypos_nextOrderNum', 1);
                      window.confirm("Done! The next ticket will be #1.");
                    }
                  }}
                  style={{ padding: '12px', background: 'transparent', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: 'fit-content' }}
                >
                  Force Reset to #1 Now
                </button>
              </div>

              <h3 style={{ marginTop: '16px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Shift Management</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Enable "Corte de Caja" (End of Shift)</label>
                <select
                  value={generalSettings.enableCorte !== false}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, enableCorte: e.target.value === 'true' })}
                  style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                >
                  <option value={true}>Yes - Show the Corte button</option>
                  <option value={false}>No - Hide shift management</option>
                </select>
                <small style={{ color: 'var(--text-muted)' }}>Turn this off if the café does not reconcile the cash drawer per shift.</small>
              </div>


              <button onClick={handleSaveGeneralSettings} style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '16px', fontSize: '1.1rem' }}>Save General Settings</button>
            </div>
          </div>
        )}

        {/* --- ADVANCED RECIPE BUILDER TAB --- */}
        {activeTab === 'calculator' && (
          <div className="admin-section fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h1 style={{ margin: 0, color: 'var(--text-main)' }}>Recipe Builder</h1>
                <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Calculate profitable selling prices based on item cost and target margins.</p>
              </div>
              <button
                onClick={handleCreateDraftRecipe}
                style={{ padding: '10px 20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                + Create New Recipe
              </button>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>

              {/* LEFT: SAVED RECIPES LIST */}
              <div style={{ flex: '0 0 300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
                <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Saved Recipes</h3>

                {recipes.length === 0 && !activeRecipe && (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>No recipes saved yet.</p>
                )}

                {/* Show draft if it exists */}
                {activeRecipe && activeRecipe.isDraft && (
                  <button
                    style={{ padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold' }}
                  >
                    📝 {activeRecipe.name || "Draft"}
                  </button>
                )}

                {recipes.map(recipe => (
                  <button
                    key={recipe.id}
                    onClick={() => setActiveRecipe(recipe)}
                    style={{ padding: '16px', background: activeRecipe?.id === recipe.id ? 'var(--brand-color)' : 'var(--bg-main)', color: activeRecipe?.id === recipe.id ? 'white' : 'var(--text-main)', border: `1px solid ${activeRecipe?.id === recipe.id ? 'var(--brand-color)' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span>{recipe.name}</span>
                    <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                      ${(recipe.ingredients || []).reduce((sum, ing) => sum + parseFloat(ing.cost || 0), 0).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>

              {/* RIGHT: DYNAMIC BUILDER */}
              {activeRecipe ? (
                <div style={{ flex: 1, minWidth: '400px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                  {/* TOP HEADER SETTINGS */}
                  <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 2, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Recipe Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Mocha 16oz"
                          value={activeRecipe.name}
                          onChange={(e) => setActiveRecipe({ ...activeRecipe, name: e.target.value })}
                          style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1.2rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Link to POS Item (Optional)</label>
                        <select
                          value={activeRecipe.linked_menu_item || ""}
                          onChange={(e) => setActiveRecipe({ ...activeRecipe, linked_menu_item: e.target.value })}
                          style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                        >
                          <option value="">-- No Link --</option>
                          {menuData?.categories && Object.entries(menuData.categories).map(([cat, items]) => (
                            <optgroup key={cat} label={cat.toUpperCase()}>
                              {items.map(item => (
                                <option key={item.name} value={item.name}>{item.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* INGREDIENTS LIST */}
                  <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                      <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Ingredients Breakdown</h3>
                      <button onClick={handleAddIngredient} style={{ padding: '8px 16px', background: 'rgba(52, 152, 219, 0.1)', color: '#3498db', border: '1px solid #3498db', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold' }}>
                        + Add Row
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(!activeRecipe.ingredients || activeRecipe.ingredients.length === 0) && (
                        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', margin: '20px 0' }}>Add your first ingredient to start calculating COGS.</p>
                      )}

                      {activeRecipe.ingredients?.map((ing, index) => (
                        <div key={ing.id} className="fade-in" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 'bold', width: '20px' }}>{index + 1}.</span>
                          <input
                            type="text"
                            placeholder="Ingredient Name (e.g. Milk 8oz)"
                            value={ing.name}
                            onChange={(e) => handleUpdateIngredient(ing.id, 'name', e.target.value)}
                            style={{ flex: 2, padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0 12px', flex: 1 }}>
                            <span style={{ color: 'var(--text-muted)' }}>$</span>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={ing.cost}
                              onChange={(e) => handleUpdateIngredient(ing.id, 'cost', e.target.value)}
                              style={{ width: '100%', padding: '12px', border: 'none', background: 'transparent', color: 'var(--text-main)', outline: 'none' }}
                            />
                          </div>
                          <button onClick={() => handleDeleteIngredient(ing.id)} style={{ padding: '12px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* PROFIT ENGINE */}
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>

                    {/* LEFT OUTPUT */}
                    <div style={{ flex: 1, minWidth: '250px', background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderTop: '4px solid #2980b9' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                        <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Target Food Cost %</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <input
                            type="range" min="10" max="60"
                            value={activeRecipe.target_margin || 25}
                            onChange={(e) => setActiveRecipe({ ...activeRecipe, target_margin: parseFloat(e.target.value) })}
                            style={{ flex: 1 }}
                          />
                          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{activeRecipe.target_margin || 25}%</span>
                        </div>
                      </div>

                      {(() => {
                        const totalCost = (activeRecipe.ingredients || []).reduce((sum, ing) => sum + parseFloat(ing.cost || 0), 0);
                        const recommendedPrice = totalCost / ((activeRecipe.target_margin || 25) / 100);
                        const expectedProfit = recommendedPrice - totalCost;
                        return (
                          <div style={{ textAlign: 'center' }}>
                            <p style={{ color: 'var(--text-muted)', margin: '0 0 5px 0', textTransform: 'uppercase', fontSize: '0.8rem' }}>Total Ingredients COGS</p>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '16px' }}>${totalCost.toFixed(2)}</div>

                            <div style={{ padding: '16px', background: 'rgba(46, 204, 113, 0.1)', borderRadius: '8px', border: '1px solid #27ae60' }}>
                              <p style={{ color: '#27ae60', margin: '0 0 5px 0', fontWeight: 'bold' }}>Recommended Selling Price</p>
                              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#27ae60' }}>${recommendedPrice.toFixed(2)}</div>
                              <small style={{ color: '#27ae60' }}>Est. Profit: ${expectedProfit.toFixed(2)}</small>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* RIGHT: WHAT-IF */}
                    <div style={{ flex: 1, minWidth: '250px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                      <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>"What-If" Analysis</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>What happens if you sell it at a custom price?</p>

                      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0 12px', marginBottom: '24px' }}>
                        <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>$</span>
                        <input
                          type="number" step="0.01" placeholder="My Custom Price..."
                          value={activeRecipe.custom_price || ""}
                          onChange={(e) => setActiveRecipe({ ...activeRecipe, custom_price: e.target.value })}
                          style={{ flex: 1, padding: '12px', border: 'none', background: 'transparent', fontSize: '1.2rem', color: 'var(--text-main)', outline: 'none' }}
                        />
                      </div>

                      {activeRecipe.custom_price && parseFloat(activeRecipe.custom_price) > 0 ? (() => {
                        const cost = (activeRecipe.ingredients || []).reduce((sum, ing) => sum + parseFloat(ing.cost || 0), 0);
                        const customPrice = parseFloat(activeRecipe.custom_price);
                        const profit = customPrice - cost;
                        const trueCostPercentage = cost > 0 ? ((cost / customPrice) * 100).toFixed(1) : 0;

                        return (
                          <div style={{ background: profit >= 0 ? 'rgba(26, 188, 156, 0.1)' : 'rgba(231, 76, 60, 0.1)', padding: '16px', borderRadius: '8px', border: `1px solid ${profit >= 0 ? '#1abc9c' : '#e74c3c'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span style={{ color: 'var(--text-main)' }}>True Profit:</span>
                              <span style={{ fontWeight: 'bold', color: profit >= 0 ? '#1abc9c' : '#e74c3c' }}>${profit.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-main)' }}>True Margin %:</span>
                              <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{trueCostPercentage}%</span>
                            </div>
                          </div>
                        );
                      })() : null}
                    </div>
                  </div>

                  {/* MASTER ACTIONS */}
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginTop: '16px' }}>
                    {!activeRecipe.isDraft && (
                      <button onClick={() => handleDeleteRecipe(activeRecipe.id)} style={{ padding: '16px 24px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Delete Recipe
                      </button>
                    )}
                    <button onClick={handleSaveRecipeToCloud} style={{ padding: '16px 40px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2rem' }}>
                      💾 Save Recipe
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, minWidth: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-surface)', borderRadius: '12px', minHeight: '400px', border: '2px dashed var(--border)' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', textAlign: 'center' }}>
                    Select a recipe from the list<br />or create a new one to begin.
                  </p>
                </div>
              )}

            </div>
          </div>
        )}

        {/* --- UNIVERSAL SYSTEM DIALOG (ALERTS & CONFIRMS) --- */}
        {uiDialog.isOpen && (
          <div className="modal-overlay" style={{ zIndex: 9999 }}>
            <div className="modal-content fade-in" style={{ textAlign: 'center', maxWidth: '400px', background: 'var(--bg-surface)' }}>

              {/* Dynamic Icon */}
              <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>
                {uiDialog.type === 'alert' ? '🔔' : '⚠️'}
              </div>

              <h2 style={{ color: 'var(--text-main)', marginBottom: '16px', marginTop: 0 }}>{uiDialog.title}</h2>
              <p style={{ fontSize: '1.1rem', marginBottom: '24px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                {uiDialog.message}
              </p>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                {/* Only show Cancel button if it is a confirmation */}
                {uiDialog.type === 'confirm' && (
                  <button
                    onClick={closeDialog}
                    style={{ flex: 1, padding: '14px', background: 'transparent', color: 'var(--text-main)', border: '2px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem' }}
                  >
                    Cancel
                  </button>
                )}

                <button
                  onClick={() => {
                    if (uiDialog.type === 'confirm' && uiDialog.onConfirm) {
                      uiDialog.onConfirm();
                    }
                    closeDialog();
                  }}
                  style={{ flex: 1, padding: '14px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem' }}
                >
                  {uiDialog.type === 'confirm' ? 'Yes, Confirm' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        )}

        {editingDrink && (
          <div className="modal-overlay" style={{ zIndex: 100 }}>
            <div className="modal-content" style={{ maxWidth: '500px', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, color: 'var(--text-main)' }}>Edit Drink Details</h2>
                <button onClick={() => setEditingDrink(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
              </div>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                Select which modifier groups should be available when a cashier rings up a <strong>{editingDrink.drink.name}</strong>.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                {Object.keys(menuData.modifierGroups).map(groupKey => {
                  const isAssigned = editingDrink.drink.allowedModifiers.includes(groupKey);
                  return (
                    <label key={groupKey} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: `2px solid ${isAssigned ? 'var(--brand-color)' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', background: isAssigned ? 'var(--bg-main)' : 'var(--bg-surface)', transition: 'all 0.1s' }}>
                      <input type="checkbox" checked={isAssigned} onChange={() => toggleModifierForDrink(groupKey)} style={{ width: '20px', height: '20px' }} />
                      <span style={{ fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'capitalize', color: 'var(--text-main)' }}>{groupKey.replace('_', ' ')}</span>
                    </label>
                  );
                })}
              </div>
              <button onClick={() => setEditingDrink(null)} style={{ width: '100%', padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '24px' }}>
                Done
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Admin;