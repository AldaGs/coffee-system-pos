import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './App.css';

function Register() {
  const navigate = useNavigate();

  const [menuData, setMenuData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [activeCategory, setActiveCategory] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);
  // --- SUCCESS ANIMATION STATE ---
  const [successTicket, setSuccessTicket] = useState(null);

  // --- KDS REVERSE BRIDGE (TOAST STATE) ---
  const [toastNotifications, setToastNotifications] = useState([]);

  useEffect(() => {
    // Listen for KDS completing an order
    const channel = supabase
      .channel('kds-register-listener')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sales' },
        (payload) => {
          if (payload.new.status === 'completed') {
            const orderName = payload.new.order_name || `Order #${payload.new.id}`;
            const newId = Date.now() + Math.random();

            setToastNotifications(prev => {
              const newToasts = [...prev, { id: newId, message: `${orderName} is Ready!` }];

              // Keep a max of 3, discarding the oldest
              if (newToasts.length > 3) {
                return newToasts.slice(newToasts.length - 3);
              }
              return newToasts;
            });

            // Auto hide after 5 seconds
            setTimeout(() => {
              setToastNotifications(current => current.filter(t => t.id !== newId));
            }, 5000);
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const tickets = useLiveQuery(() => db.active_tickets.toArray(), []) || [];

  const [activeTicketId, setActiveTicketId] = useState(() => {
    const savedId = localStorage.getItem('tinypos_activeTicketId');
    return savedId ? JSON.parse(savedId) : 1;
  });

  // --- DAILY EXPENSES (GASTOS) STATE ---
  const [expenses, setExpenses] = useState(() => {
    const saved = localStorage.getItem('tinypos_expenses');
    return saved ? JSON.parse(saved) : [];
  });

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ amount: '', reason: '' });

  useEffect(() => {
    localStorage.setItem('tinypos_expenses', JSON.stringify(expenses));
  }, [expenses]);

  // --- SAVE EXPENSE LOGIC ---
  const handleSaveExpense = async () => {
    if (!expenseForm.amount || !expenseForm.reason) {
      return showAlert("Missing Info", "Please enter both the amount and the reason for the expense.");
    }

    const expenseAmount = parseFloat(expenseForm.amount);

    // 1. Build the local record
    const newExpense = {
      id: Date.now(),
      amount: expenseAmount,
      reason: expenseForm.reason,
      timestamp: new Date().toISOString(),
      cashierId: activeCashier?.id || 'unknown',
      cashierName: activeCashier?.name || 'Unknown Cashier'
    };

    // 2. Build the cloud record (For when you create the 'expenses' table in Supabase)
    const cloudExpense = {
      amount: expenseAmount,
      reason: expenseForm.reason,
      cashier_name: activeCashier?.name || 'Unknown Cashier'
    };

    try {
      if (!navigator.onLine) throw new Error("Device is offline");

      const { error } = await supabase.from('expenses').insert([cloudExpense]);
      if (error) throw error;
    } catch {
      console.warn("Cloud expense failed. Moving to offline queue.");
      // PUSH TO SECRET QUEUE INSTEAD OF FAILING!
      setExpenseQueue(prev => [...prev, cloudExpense]);
    }

    // 3. ALWAYS DO THIS (Online or Offline)
    setExpenses([...expenses, newExpense]);
    setIsExpenseModalOpen(false);
    setExpenseForm({ amount: '', reason: '' });
    showAlert("Expense Recorded", `Successfully logged $${expenseAmount.toFixed(2)} out of the drawer for:\n${expenseForm.reason}`);
  };

  // --- DISCOUNT STATE & LOGIC ---
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [discountForm, setDiscountForm] = useState({ type: 'percentage', value: '' });

  const handleApplyDiscount = async () => {
    const val = parseFloat(discountForm.value);
    if (isNaN(val) || val <= 0) return showAlert("Invalid Discount", "Please enter a valid amount.");

    if (activeTicket) await db.active_tickets.update(activeTicket.id, { discount: { type: discountForm.type, value: val } });
    setIsDiscountModalOpen(false);
    setDiscountForm({ type: 'percentage', value: '' }); // Reset form
  };

  const handleRemoveDiscount = async () => {
    if (activeTicket) {
      const updatedItems = { ...activeTicket };
      delete updatedItems.discount;
      await db.active_tickets.put(updatedItems);
    }
    setIsDiscountModalOpen(false);
  };

  // --- OFFLINE SYNC QUEUES & MODAL ---
  const syncQueue = useLiveQuery(() => db.syncQueue.toArray(), []) || [];
  const [expenseQueue, setExpenseQueue] = useState(() => {
    const saved = localStorage.getItem('tinypos_expense_queue');
    return saved ? JSON.parse(saved) : [];
  });
  const [waQueue] = useState(() => {
    const saved = localStorage.getItem('tinypos_wa_queue');
    return saved ? JSON.parse(saved) : [];
  });
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('tinypos_expense_queue', JSON.stringify(expenseQueue));
    localStorage.setItem('tinypos_wa_queue', JSON.stringify(waQueue));
  }, [expenseQueue, waQueue]);

  // --- UNIFIED BACKGROUND CLOUD SYNC ---
  useEffect(() => {
    const attemptSync = async () => {
      // Don't try if we are offline or if the database queues are empty
      if (!navigator.onLine) return;
      if (syncQueue.length === 0 && expenseQueue.length === 0) return;

      console.log("Wi-Fi connected! Attempting background sync...");
      try {
        // Sync Sales
        if (syncQueue.length > 0) {
          const { error: salesErr } = await supabase.from('sales').insert(syncQueue);
          if (!salesErr) {
            await db.syncQueue.clear();
          }
        }
        // Sync Expenses
        if (expenseQueue.length > 0) {
          const { error: expErr } = await supabase.from('expenses').insert(expenseQueue);
          if (!expErr) setExpenseQueue([]);
        }
      } catch (err) {
        console.error("Background sync failed:", err);
      }
    };

    window.addEventListener('online', attemptSync);
    const syncInterval = setInterval(attemptSync, 60000); // Try every 60s

    return () => {
      window.removeEventListener('online', attemptSync);
      clearInterval(syncInterval);
    };
  }, [syncQueue, expenseQueue]);

  // --- CORTE DE CAJA (END OF SHIFT) STATES ---
  const [lastCorteTimestamp, setLastCorteTimestamp] = useState(() => {
    // Default to the beginning of time if a corte has never been done
    return localStorage.getItem('tinypos_last_corte') || new Date(0).toISOString();
  });
  const [isCorteModalOpen, setIsCorteModalOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("");

  // --- PROCESS CORTE DE CAJA ---
  const handleProcessCorte = () => {
    const actualCash = parseFloat(countedCash) || 0;
    const difference = actualCash - expectedCash;

    // Safety check to ensure they actually counted
    if (countedCash === "") {
      return showAlert("Missing Count", "Please enter the physical cash counted in the drawer.");
    }

    // Determine the status string
    let statusMsg = "Perfectly Balanced ⚖️";
    if (difference > 0) statusMsg = `Over (Sobrante) by $${difference.toFixed(2)} ⬆️`;
    if (difference < 0) statusMsg = `Short (Faltante) by $${Math.abs(difference).toFixed(2)} ⬇️`;

    const confirmMessage = `
SHIFT SUMMARY:
Total Tickets: ${shiftOrders.length}
Gross Revenue: $${shiftTotalRevenue.toFixed(2)}
Cash Expenses: $${shiftTotalExpenses.toFixed(2)}

CASH RECONCILIATION:
Expected Cash: $${expectedCash.toFixed(2)}
Counted Cash: $${actualCash.toFixed(2)}
Result: ${statusMsg}

Are you sure you want to close this shift? This will reset the register for the next cashier.`;

    showConfirm("Confirm Corte de Caja", confirmMessage, () => {
      // 1. Mark the current exact time as the new baseline
      const newTimestamp = new Date().toISOString();
      setLastCorteTimestamp(newTimestamp);
      localStorage.setItem('tinypos_last_corte', newTimestamp);

      // 2. Reset the modal
      setIsCorteModalOpen(false);
      setCountedCash("");

      showAlert("Shift Closed", "The Corte de Caja was successful. The register is ready for the next shift.");
    });
  };

  // --- ORDER NUMBER ENGINE ---
  const [nextOrderNum, setNextOrderNum] = useState(() => {
    const saved = localStorage.getItem('tinypos_nextOrderNum');
    return saved ? parseInt(saved) : 1;
  });

  const [lastResetDate, setLastResetDate] = useState(() => {
    return localStorage.getItem('tinypos_lastResetDate') || new Date().toDateString();
  });


  useEffect(() => {
    localStorage.setItem('tinypos_activeTicketId', JSON.stringify(activeTicketId));
  }, [activeTicketId]);

  // --- AUTO-RESET LOGIC ---
  useEffect(() => {
    // FIX: Read directly from menuData so we don't care about variable order!
    const policy = menuData?.posSettings?.orderResetPolicy || 'daily';
    const today = new Date();
    const lastReset = new Date(lastResetDate);
    let shouldReset = false;

    if (policy === 'daily' && today.toDateString() !== lastReset.toDateString()) {
      shouldReset = true;
    } else if (policy === 'monthly' && today.getMonth() !== lastReset.getMonth()) {
      shouldReset = true;
    } else if (policy === 'yearly' && today.getFullYear() !== lastReset.getFullYear()) {
      shouldReset = true;
    }

    if (shouldReset) {
      setNextOrderNum(1);
      setLastResetDate(today.toDateString());
      localStorage.setItem('tinypos_nextOrderNum', 1);
      localStorage.setItem('tinypos_lastResetDate', today.toDateString());
    }
    // FIX: Update the dependency array here too
  }, [menuData?.posSettings?.orderResetPolicy, lastResetDate]);

  // --- NEW STATE: The Checkout & Split Payment Engine ---
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [splitMode, setSplitMode] = useState('full'); // 'full', 'even', 'product', 'custom'
  const [splitPayments, setSplitPayments] = useState([]); // [{ amount: X, method: 'Y' }]
  const [nWays, setNWays] = useState(2);
  const [customVal, setCustomVal] = useState('');
  const [paidProductIds, setPaidProductIds] = useState([]);

  // --- BOTTOM SHEET STATE ---
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

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

  // --- NEW STATE: POS SETTINGS & SECURITY ---
  const [isLocked, setIsLocked] = useState(true);

  // --- DEVICE IDENTITY & SESSION ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const myDeviceId = useMemo(() => {
    let id = localStorage.getItem('tinypos_device_id');
    if (!id) {
      id = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('tinypos_device_id', id);
    }
    return id;
  }, []);

  const [sessionTime, setSessionTime] = useState(() => {
    const saved = localStorage.getItem('tinypos_session_time');
    return saved ? parseInt(saved) : 0;
  });

  // --- SECURITY PIN CHALLENGE STATE ---
  const [pinChallenge, setPinChallenge] = useState({ isOpen: false, title: "", onAuthorized: null });
  const [challengePinAttempt, setChallengePinAttempt] = useState('');
  const [challengeError, setChallengeError] = useState(false);

  // Helper function to intercept high-privilege actions
  const requirePin = (title, onAuthorizedAction) => {
    setPinChallenge({ isOpen: true, title, onAuthorized: onAuthorizedAction });
  };

  // Logic to verify the PIN
  const handleChallengeSubmit = () => {
    // Allow if it matches the current Cashier's PIN OR the master Admin PIN
    const isCashierMatch = challengePinAttempt === activeCashier?.pin;
    const isAdminMatch = challengePinAttempt === posSettings.pinCode;

    if (isCashierMatch || isAdminMatch) {
      // Success: Clear the challenge and run the intercepted action
      setChallengePinAttempt('');
      setPinChallenge({ isOpen: false, title: "", onAuthorized: null });
      if (pinChallenge.onAuthorized) pinChallenge.onAuthorized();
    } else {
      // Fail: Trigger the exact same shake animation you built for the Lock Screen
      setChallengeError(true);
      setTimeout(() => setChallengeError(false), 500);
      setChallengePinAttempt('');
    }
  };

  const handleChallengeKeyDown = (e) => {
    if (e.key === 'Enter') handleChallengeSubmit();
  };

  // --- LOYALTY & WHATSAPP STATES ---
  const [loyaltyModal, setLoyaltyModal] = useState({ isOpen: false, step: 'phone', phone: '', data: null });
  const [phoneError, setPhoneError] = useState(false); // NEW: Controls the shake

  // --- CASHIER PROFILES (CLOUD SYNCED) ---
  // We read directly from the cloud menuData now!
  const cashiers = menuData?.cashiers || [
    { id: 1, name: 'Admin', pin: '1234' },
    { id: 2, name: 'Barista 1', pin: '0000' }
  ];

  // We KEEP activeCashier in localStorage because whoever is logged into THIS specific iPad/Phone should stay logged in.
  const [activeCashier, setActiveCashier] = useState(() => {
    const saved = localStorage.getItem('tinypos_activeCashier');
    return saved ? JSON.parse(saved) : cashiers[0];
  });


  // Lock Screen temporary states
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [pinAttempt, setPinAttempt] = useState('');

  // --- UNLOCK LOGIC & ENTER KEY ---
  const handleUnlockSubmit = () => {
    if (!selectedProfile) return;

    if (pinAttempt === selectedProfile.pin) {
      setIsLocked(false);
      setActiveCashier(selectedProfile);
      localStorage.setItem('tinypos_activeCashier', JSON.stringify(selectedProfile));

      const newSessionTime = Date.now();
      setSessionTime(newSessionTime);
      localStorage.setItem('tinypos_session_time', newSessionTime.toString());

      // Reset the lock screen for next time
      setPinAttempt('');
      setSelectedProfile(null);
    } else {
      // Wrong PIN! Trigger the shake animation
      setPhoneError(true);
      setTimeout(() => setPhoneError(false), 500);
      setPinAttempt('');
    }
  };

  const handlePinKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleUnlockSubmit();
    }
  };

  // Extract POS settings with safe fallbacks
  const posSettings = menuData?.posSettings || {
    name: "Main Register",
    brandColor: "#2c3e50",
    isDarkMode: false,
    autoLockMinutes: .1,
    pinCode: "1234",
    enableCorte: true,
    ticketVisibility: "open"
  };

  // --- ORDER HISTORY (ANALYTICS LEDGER) ---
  const [orderHistory, setOrderHistory] = useState(() => {
    const saved = localStorage.getItem('tinypos_orderHistory');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('tinypos_orderHistory', JSON.stringify(orderHistory));
  }, [orderHistory]);

  // --- AUTO-LOCK LOGIC ---
  useEffect(() => {
    if (!menuData || isLocked || posSettings.autoLockMinutes === 0) return;

    let timeoutId;

    // Function that triggers the lock
    const lockScreen = () => setIsLocked(true);

    // Function that resets the countdown every time they touch the screen
    const resetTimer = () => {
      clearTimeout(timeoutId);
      // Convert minutes to milliseconds
      timeoutId = setTimeout(lockScreen, posSettings.autoLockMinutes * 60000);
    };

    // Listen for any interaction
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('keydown', resetTimer);

    // Start the timer initially
    resetTimer();

    // Cleanup listeners when component unmounts
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [menuData, isLocked, posSettings.autoLockMinutes]);

  // --- SUPABASE PRESENCE (SESSION LOCK) ---
  useEffect(() => {
    // Only track presence if we are actively logged in (not locked)
    if (!activeCashier || isLocked) return;

    const channel = supabase.channel('cashier-presence', {
      config: {
        presence: { key: myDeviceId },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();

      let shouldLockOut = false;

      // Loop through all connected devices
      for (const [key, presenceData] of Object.entries(state)) {
        if (key !== myDeviceId) {
          // If another device is using the same cashier profile
          presenceData.forEach(p => {
            if (p.cashierId === activeCashier.id) {
              // If their session is NEWER than ours, we lost the tie-breaker
              if (p.sessionTime > sessionTime) {
                shouldLockOut = true;
              }
            }
          });
        }
      }

      if (shouldLockOut) {
        setIsLocked(true);
        setActiveCashier(null);
        setSessionTime(0);
        localStorage.removeItem('tinypos_activeCashier');
        localStorage.removeItem('tinypos_session_time');
        showAlert("Access Revoked", "This profile was securely logged into from another device. Your session has been locked to prevent system conflicts.");
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ cashierId: activeCashier.id, sessionTime: sessionTime });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCashier, isLocked, sessionTime, myDeviceId]);

  // --- SHIFT CALCULATIONS ---
  // 1. Filter data to ONLY include things that happened after the last Corte
  const shiftOrders = orderHistory.filter(o => new Date(o.timestamp) > new Date(lastCorteTimestamp));
  const shiftExpenses = expenses.filter(e => new Date(e.timestamp) > new Date(lastCorteTimestamp));

  // 2. Break down the revenue by payment method
  const calcTotalByMethod = (method) => {
    return shiftOrders.reduce((sum, o) => {
      if (o.method === method) return sum + o.total;
      if (o.method === 'Split' && o.splits) {
        return sum + o.splits.filter(s => s.method === method).reduce((acc, s) => acc + s.amount, 0);
      }
      return sum;
    }, 0);
  };

  const shiftCashSales = calcTotalByMethod('Cash');
  const shiftCardSales = calcTotalByMethod('Card');
  const shiftTransferSales = calcTotalByMethod('Transfer');
  const shiftTotalRevenue = shiftOrders.reduce((sum, o) => sum + o.total, 0);

  // 3. Sum up the expenses
  const shiftTotalExpenses = shiftExpenses.reduce((sum, e) => sum + e.amount, 0);

  // 4. Calculate Expected Cash in Drawer (Cash In - Cash Out)
  const expectedCash = shiftCashSales - shiftTotalExpenses;

  // --- THEME INJECTION LOGIC ---
  useEffect(() => {
    if (!menuData) return;

    // 1. NEW: Update the Browser Tab Title!
    const registerName = posSettings.name || "Main Register";
    document.title = `${registerName} | TinyPOS`;

    // 2. Inject custom brand color
    document.documentElement.style.setProperty('--brand-color', posSettings.brandColor);

    // 3. Toggle Dark Mode class on the main body
    if (posSettings.isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [menuData, posSettings.name, posSettings.brandColor, posSettings.isDarkMode]);

  // --- MENU FETCH & OFFLINE CACHE ENGINE ---
  useEffect(() => {
    const fetchMenu = async () => {
      try {
        // 1. Try to fetch the live menu from the cloud
        const { data, error } = await supabase.from('shop_settings').select('menu_data').eq('id', 1).single();
        if (error) throw error;

        // 2. Success! Load it into the app
        setMenuData(data.menu_data);
        const firstCategory = Object.keys(data.menu_data.categories)[0];
        setActiveCategory(firstCategory);

        // 3. Secretly save a backup copy to the iPad's hard drive!
        localStorage.setItem('tinypos_cached_menu', JSON.stringify(data.menu_data));

      } catch {
        console.warn("Cloud menu fetch failed. Searching for local backup...");

        // 4. OFFLINE FALLBACK: Grab the backup if the internet is dead
        const cachedMenu = localStorage.getItem('tinypos_cached_menu');
        if (cachedMenu) {
          const parsedMenu = JSON.parse(cachedMenu);
          setMenuData(parsedMenu);
          const firstCategory = Object.keys(parsedMenu.categories)[0];
          setActiveCategory(firstCategory);
          console.log("Success! Loaded menu from local offline cache.");
        } else {
          // If they have literally never connected to the internet on this device before:
          console.error("FATAL: No internet and no cached menu found.");
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchMenu();
  }, []);


  const handleNewTicket = async () => {
    const newId = Date.now();
    const currentNum = nextOrderNum; // Grab the global counter

    await db.active_tickets.add({
      id: newId,
      name: `Order #${currentNum}`,
      items: [],
      cashierId: activeCashier?.id
    });

    setActiveTicketId(newId);

    // Increment the global counter for the NEXT time
    setNextOrderNum(currentNum + 1);
    localStorage.setItem('tinypos_nextOrderNum', currentNum + 1);
  };

  const handleItemClick = (item) => {
    if (item.allowedModifiers.length > 0) {
      setPendingItem({ ...item, selectedModifiers: [] });
      setIsModalOpen(true);
    } else {
      addToTicket(item, []);
    }
  };

  const handleToggleModifier = (modGroupKey, modifierObj) => {
    let updatedModifiers = [...pendingItem.selectedModifiers];
    const existingIndex = updatedModifiers.findIndex(m => m.groupId === modGroupKey);
    if (existingIndex >= 0) {
      updatedModifiers[existingIndex] = { ...modifierObj, groupId: modGroupKey };
    } else {
      updatedModifiers.push({ ...modifierObj, groupId: modGroupKey });
    }
    setPendingItem({ ...pendingItem, selectedModifiers: updatedModifiers });
  };

  // NEW: Handles typing into a text modifier field
  const handleTextModifierChange = (modGroupKey, option, text) => {
    let updatedModifiers = [...pendingItem.selectedModifiers];
    const existingIndex = updatedModifiers.findIndex(m => m.id === option.id);

    if (text.trim() === '') {
      // If they delete the text, remove the modifier entirely
      if (existingIndex >= 0) updatedModifiers.splice(existingIndex, 1);
    } else {
      // If typing, add or update the text value
      if (existingIndex >= 0) {
        updatedModifiers[existingIndex].textValue = text;
      } else {
        updatedModifiers.push({ ...option, groupId: modGroupKey, textValue: text });
      }
    }
    setPendingItem({ ...pendingItem, selectedModifiers: updatedModifiers });
  };

  const addToTicket = async (item, modifiers) => {
    // FIX: Provide UX feedback instead of failing silently!
    if (!activeTicket) {
      showAlert("No Active Order", "Please click '+ Start New Ticket' before adding items.");
      setIsModalOpen(false); // Close the modifier modal if they had it open to check prices
      setPendingItem(null);
      return;
    }

    // Added a randomizer so clicking ultra-fast doesn't accidentally group items
    const newItem = { ...item, uniqueId: Date.now() + Math.random(), selectedModifiers: modifiers };

    if (activeTicket) await db.active_tickets.update(activeTicket.id, { items: [...activeTicket.items, newItem] });
    setIsModalOpen(false);
    setPendingItem(null);
  };

  const handleRemoveItem = async (itemUniqueId) => {
    if (!activeTicket) return;

    if (activeTicket) {
       await db.active_tickets.update(activeTicket.id, { items: activeTicket.items.filter(i => i.uniqueId !== itemUniqueId) });
    }
  };

  const clearCurrentTicket = async () => {
    if (!activeTicket) return;

    await db.active_tickets.delete(activeTicket.id);
    const remainingTickets = tickets.filter(t => t.id !== activeTicket.id);

    // Try to find another ticket that belongs to this cashier
    if (remainingTickets.length > 0) {
      const nextVisible = remainingTickets.find(t => posSettings.ticketVisibility === 'open' || t.cashierId === activeCashier?.id);
      if (nextVisible) {
        setActiveTicketId(nextVisible.id);
      } else {
        setActiveTicketId(null); // None of the remaining tickets belong to them
      }
    } else {
      setActiveTicketId(null); // The master cart is totally empty
    }
  };

  const handleCancelTicket = () => {
    // Check if ticket is empty. If it is, don't even ask, just close it.
    if (activeTicket.items.length === 0) {
      clearCurrentTicket();
      return;
    }

    showConfirm(
      "Void Ticket",
      `Are you sure you want to completely void "${activeTicket.name}"? This cannot be undone.`,
      () => clearCurrentTicket()
    );
  };

  const handleSendToBarista = async () => {
    if (!activeTicket || activeTicket.items.length === 0) return;

    const partialOrder = {
      total_amount: cartTotal,
      payment_method: 'Pending', // Mark as unpaid
      items_sold: activeTicket.items.map(item => item.name),
      cashier_name: activeCashier?.name || 'Unknown',
      status: 'pending', // NEW: Tells the KDS this is a live prep order
      order_name: activeTicket.name
    };

    try {
      await db.sales.add({ ...partialOrder, created_at: new Date().toISOString() });
      if (!navigator.onLine) throw new Error("Offline");
      const { error } = await supabase.from('sales').insert([partialOrder]);
      if (error) throw error;
      if (activeTicket) await db.active_tickets.update(activeTicket.id, { sentToBarista: true });
      showAlert("Sent to Kitchen", "The barista has received the order!");
    } catch {
      await db.syncQueue.add(partialOrder);
      if (activeTicket) await db.active_tickets.update(activeTicket.id, { sentToBarista: true });
      showAlert("Sync Error", "Offline: Saved to local queue, will sync when online.");
    }
  };

  const printVirtualReceipt = (ticket, total) => {
    // 1. Grab settings from cloud (with fallbacks)
    const receiptSettings = menuData?.receiptSettings || {
      header: "TINY COFFEE BAR",
      subheader: "Puebla, Mexico",
      footer: "Thank you for your visit!",
      logo: null
    };

    // 2. Build actual HTML for the receipt
    // We use a fixed width of 300px to perfectly simulate 80mm thermal paper
    let htmlContent = `
      <html>
        <head>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace; 
              width: 300px; 
              margin: 0;
              padding: 20px;
              color: black;
              background: white;
            }
            .center { text-align: center; }
            .divider { border-bottom: 1px dashed black; margin: 10px 0; }
            .flex-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .logo { max-width: 100%; max-height: 100px; object-fit: contain; filter: grayscale(100%) contrast(200%); margin-bottom: 10px; }
          </style>
        </head>
        <body>
    `;

    // Add Logo if it exists
    if (receiptSettings.logo) {
      htmlContent += `<div class="center"><img src="${receiptSettings.logo}" class="logo" /></div>`;
    }

    // Add Header & Info
    htmlContent += `
          <div class="center" style="font-size: 1.2rem; font-weight: bold;">${receiptSettings.header}</div>
          <div class="center" style="margin-bottom: 10px;">${receiptSettings.subheader}</div>
          <div class="divider"></div>
          <div>Ticket: ${ticket.name}</div>
          <div>Date: ${new Date().toLocaleString()}</div>
          <div class="divider"></div>
    `;

    // Loop through Drinks and Modifiers
    ticket.items.forEach(item => {
      // NEW: Added the emoji fallback right before item.name
      htmlContent += `
          <div class="flex-row">
            <span>${item.emoji || '•'} ${item.name}</span>
            <span>$${item.basePrice.toFixed(2)}</span>
          </div>
      `;
      item.selectedModifiers.forEach(mod => {
        const modPrice = mod.price > 0 ? `+$${mod.price.toFixed(2)}` : "";
        htmlContent += `
          <div class="flex-row" style="font-size: 0.9em; color: #444; padding-left: 10px;">
            <span>+ ${mod.name}</span>
            <span>${modPrice}</span>
          </div>
        `;
      });
    });

    // Add Footer and Total
    let discountHtml = '';

    // 1. Calculate raw subtotal for the receipt
    const subtotal = ticket.items.reduce((sum, item) => {
      let cost = item.basePrice;
      item.selectedModifiers.forEach(mod => cost += mod.price);
      return sum + cost;
    }, 0);

    // 2. Scan for Auto Discounts
    let autoDiscountAmount = 0;
    let activeAutoRuleName = "";
    const activeRules = menuData?.discountRules?.filter(r => r.isActive) || [];

    if (activeRules.length > 0 && subtotal > 0) {
      activeRules.forEach(rule => {
        if (rule.targetType === 'cart') {
          const ruleValue = rule.type === 'percentage' ? subtotal * (rule.value / 100) : rule.value;
          autoDiscountAmount += ruleValue;
          activeAutoRuleName = rule.name;
        } else if (rule.targetType === 'item') {
          ticket.items.forEach(item => {
            if (item.name === rule.targetValue) {
              let itemCost = item.basePrice;
              item.selectedModifiers.forEach(mod => { itemCost += mod.price; });
              const ruleValue = rule.type === 'percentage' ? itemCost * (rule.value / 100) : rule.value;
              autoDiscountAmount += ruleValue;
              activeAutoRuleName = rule.name;
            }
          });
        }
      });
    }

    // 3. Scan for Manual Overrides
    let manualDiscountAmount = 0;
    let manualDiscountLabel = "";
    if (ticket.discount) {
      const subtotalAfterAuto = Math.max(0, subtotal - autoDiscountAmount);
      manualDiscountAmount = ticket.discount.type === 'percentage' ? subtotalAfterAuto * (ticket.discount.value / 100) : ticket.discount.value;
      manualDiscountLabel = ticket.discount.type === 'percentage' ? `${ticket.discount.value}%` : `$${manualDiscountAmount.toFixed(2)}`;
    }

    // 4. Build the HTML if ANY discount exists
    if (autoDiscountAmount > 0 || manualDiscountAmount > 0) {
      discountHtml += `
          <div class="flex-row" style="color: #555; font-size: 0.95rem;">
            <span>Subtotal</span>
            <span>$${subtotal.toFixed(2)}</span>
          </div>`;

      if (autoDiscountAmount > 0) {
        discountHtml += `
          <div class="flex-row" style="color: #555; font-size: 0.95rem;">
            <span>⭐ Auto: ${activeAutoRuleName}</span>
            <span>-$${autoDiscountAmount.toFixed(2)}</span>
          </div>`;
      }

      if (manualDiscountAmount > 0) {
        discountHtml += `
          <div class="flex-row" style="color: #555; font-size: 0.95rem;">
            <span>Discount (${manualDiscountLabel})</span>
            <span>-$${manualDiscountAmount.toFixed(2)}</span>
          </div>`;
      }
    }
    

    htmlContent += `
          <div class="divider"></div>
          ${discountHtml}
          <div class="flex-row" style="font-weight: bold; font-size: 1.1rem;">
            <span>TOTAL</span>
            <span>$${total.toFixed(2)}</span>
          </div>
          <div class="divider" style="margin-bottom: 20px;"></div>
          <div class="center" style="font-size: 0.9rem; white-space: pre-wrap;">${receiptSettings.footer}</div>
        </body>
      </html>
    `;

    // --- NEW: THE SAT TAX EXTRACTION ENGINE ---
    if (receiptSettings.enableTaxBreakdown) {
      const taxRatePercentage = receiptSettings.taxRate || 16;
      const taxDecimal = taxRatePercentage / 100;
      
      // Backwards math: Total = Subtotal * (1 + TaxRate)
      const baseSubtotal = total / (1 + taxDecimal);
      const extractedTax = total - baseSubtotal;

      htmlContent += `
          <div class="flex-row" style="color: #555; font-size: 0.95rem;">
            <span>Subtotal (Sin IVA)</span>
            <span>$${baseSubtotal.toFixed(2)}</span>
          </div>
          <div class="flex-row" style="color: #555; font-size: 0.95rem; margin-bottom: 8px;">
            <span>IVA (${taxRatePercentage}%)</span>
            <span>$${extractedTax.toFixed(2)}</span>
          </div>
      `;
    }

    htmlContent += `
          <div class="flex-row" style="font-weight: bold; font-size: 1.1rem;">
            <span>TOTAL</span>
            <span>$${total.toFixed(2)}</span>
          </div>
    `;

    

    // 3. Create the Invisible Iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    // 4. Write the HTML inside the iframe
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // 5. Wait a fraction of a second for the logo image to load, then trigger Print
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();

      // 6. Clean up: Delete the iframe 1 second after the print dialog opens
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    };
  };


  // --- NEW: SPLIT CHECKOUT LOGIC ---

  // Action 1: Just print the ticket, do not close the tab.
  const handlePrintOnly = () => {
    printVirtualReceipt(activeTicket, cartTotal);
    // You could add a little toast notification here later saying "Printing..."
  };

  // --- 1. THE UNIFIED RECEIPT SENDER ---
  const sendFinalMessage = (phone, loyaltyData = null) => {
    const receiptSettings = menuData?.receiptSettings || { header: "TINY COFFEE BAR", subheader: "Puebla, Mexico", footer: "Thank you!" };

    // ==========================================
    // 1. THE LOGIC (Math & Calculations)
    // ==========================================

    // A. Calculate the raw subtotal first
    const rawSubtotal = activeTicket.items.reduce((sum, item) => {
      let cost = item.basePrice;
      item.selectedModifiers.forEach(mod => cost += mod.price);
      return sum + cost;
    }, 0);

    // B. Calculate Auto Discounts
    let autoDiscountAmount = 0;
    let activeAutoRuleName = "";
    const activeRules = menuData?.discountRules?.filter(r => r.isActive) || [];

    if (activeRules.length > 0 && rawSubtotal > 0) {
      activeRules.forEach(rule => {
        if (rule.targetType === 'cart') {
          const ruleValue = rule.type === 'percentage' ? rawSubtotal * (rule.value / 100) : rule.value;
          autoDiscountAmount += ruleValue;
          activeAutoRuleName = rule.name;
        } else if (rule.targetType === 'item') {
          activeTicket.items.forEach(item => {
            if (item.name === rule.targetValue) {
              let itemCost = item.basePrice;
              item.selectedModifiers.forEach(mod => { itemCost += mod.price; });
              const ruleValue = rule.type === 'percentage' ? itemCost * (rule.value / 100) : rule.value;
              autoDiscountAmount += ruleValue;
              activeAutoRuleName = rule.name;
            }
          });
        }
      });
    }

    // C. Calculate Manual Discounts
    let manualDiscountAmount = 0;
    let manualDiscountLabel = "";
    if (activeTicket.discount) {
      const subtotalAfterAuto = Math.max(0, rawSubtotal - autoDiscountAmount);
      manualDiscountAmount = activeTicket.discount.type === 'percentage' ? subtotalAfterAuto * (activeTicket.discount.value / 100) : activeTicket.discount.value;
      manualDiscountLabel = activeTicket.discount.type === 'percentage' ? `${activeTicket.discount.value}%` : `$${manualDiscountAmount.toFixed(2)}`;
    }

    // D. Calculate FINAL Total (Fixes the undefined cartTotal bug!)
    const cartTotal = Math.max(0, rawSubtotal - autoDiscountAmount - manualDiscountAmount);

    // E. Extract the Tax (Based on the final discounted total)
    let subtotalLine = "";
    let taxLine = "";
    
    if (receiptSettings.enableTaxBreakdown) {
      const taxRate = receiptSettings.taxRate || 16;
      const taxDecimal = taxRate / 100;
      
      const baseSubtotal = cartTotal / (1 + taxDecimal);
      const extractedTax = cartTotal - baseSubtotal;
      
      subtotalLine = `Subtotal: $${baseSubtotal.toFixed(2)}\n`;
      taxLine = `IVA (${taxRate}%): $${extractedTax.toFixed(2)}\n`;
    }

    // ==========================================
    // 2. THE UI (String Template Builder)
    // ==========================================

    let waText = `*${receiptSettings.header}*\n_${receiptSettings.subheader}_\n---------------------------------\n`;
    waText += `*Ticket:* ${activeTicket.name}\n*Date:* ${new Date().toLocaleString()}\n---------------------------------\n`;

    // Print Items
    activeTicket.items.forEach(item => {
      const itemIcon = item.emoji || '•';
      waText += `${itemIcon} ${item.name} - $${item.basePrice.toFixed(2)}\n`;
      item.selectedModifiers.forEach(mod => {
        const modPrice = mod.price > 0 ? ` (+$${mod.price.toFixed(2)})` : "";
        waText += `    + ${mod.name}${modPrice}\n`;
      });
      waText += `\n`;
    });

    // Print Discounts (if any)
    if (autoDiscountAmount > 0 || manualDiscountAmount > 0) {
      waText += `---------------------------------\n`;
      waText += `Subtotal: $${rawSubtotal.toFixed(2)}\n`;

      if (autoDiscountAmount > 0) {
        waText += `⭐ Auto: ${activeAutoRuleName}: -$${autoDiscountAmount.toFixed(2)}\n`;
      }
      if (manualDiscountAmount > 0) {
        waText += `Discount (${manualDiscountLabel}): -$${manualDiscountAmount.toFixed(2)}\n`;
      }
    }

    waText += `---------------------------------\n`;
    
    // Print Tax Breakdown (will be completely invisible if disabled in settings)
    waText += subtotalLine;
    waText += taxLine;
    
    // Print Final Total
    waText += `*TOTAL: $${cartTotal.toFixed(2)}*\n---------------------------------\n`;

    // Print Loyalty Program
    if (loyaltyData) {
      if (loyaltyData.isRewardReady) {
        waText += `🎉 *¡Felicidades!*\nEsta es tu visita #${loyaltyData.visits}. ¡Te has ganado ${loyaltyData.reward}!\n`;
      } else {
        const remaining = loyaltyData.target - (loyaltyData.visits % loyaltyData.target);
        const starString = "⭐".repeat(loyaltyData.visits % loyaltyData.target || loyaltyData.target);
        waText += `${starString}\nTienes *${loyaltyData.visits}* visitas.\n¡Faltan ${remaining} para ${loyaltyData.reward}!\n`;
      }
      waText += `---------------------------------\n`;
    }

    waText += `_${receiptSettings.footer}_`;

    // ==========================================
    // 3. THE ROUTING LOGIC
    // ==========================================
    
    const encodedText = encodeURIComponent(waText);
    const fullPhone = `52${phone}`; // Mexico country code applied here
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    let waUrl = '';
    if (isMobile) {
      waUrl = `whatsapp://send?phone=${fullPhone}&text=${encodedText}`;
    } else {
      waUrl = `https://web.whatsapp.com/send?phone=${fullPhone}&text=${encodedText}`;
    }

    window.open(waUrl, '_blank');
    setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null });
  };

  // --- 2. THE GUEST CHECKOUT (NO TRACKING) ---
  const handleGuestReceipt = () => {
    const cleanPhone = loyaltyModal.phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setPhoneError(true);
      setTimeout(() => setPhoneError(false), 500);
      return;
    }
    // Instantly send the receipt with NO loyalty data
    sendFinalMessage(cleanPhone, null);
  };

  // --- 3. THE LOYALTY CHECKOUT ---
  const handleCheckLoyalty = async () => {
    // FAIL-SAFE: Prevent checking if the program is paused or not explicitly activated
    const isLoyaltyActive = menuData?.loyaltySettings?.isActive === true || menuData?.loyaltySettings?.isActive === "true";
    if (!isLoyaltyActive) {
      setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null });
      return showAlert("Program Paused", "No current promotions active");
    }

    const cleanPhone = loyaltyModal.phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setPhoneError(true);
      setTimeout(() => setPhoneError(false), 500);
      return;
    }

    const loyaltySettings = menuData?.loyaltySettings || { visitsRequired: 10, rewardDescription: "tu pr\u00F3xima bebida GRATIS" };
    let currentVisits = 1;

    try {
      const { data: customer } = await supabase.from('customers').select('visits').eq('phone', cleanPhone).single();
      if (customer) currentVisits = customer.visits + 1;

      if (customer) {
        await supabase.from('customers').update({ visits: currentVisits }).eq('phone', cleanPhone);
      } else {
        await supabase.from('customers').insert([{ phone: cleanPhone, visits: 1 }]);
      }
    } catch (err) {
      console.error("Loyalty error:", err);
    }

    setLoyaltyModal(prev => ({
      ...prev,
      step: 'result',
      data: {
        visits: currentVisits,
        target: loyaltySettings.visitsRequired,
        reward: loyaltySettings.rewardDescription,
        isRewardReady: currentVisits > 0 && (currentVisits % loyaltySettings.visitsRequired === 0)
      }
    }));
  };

  // --- SPLIT PAYMENT LOGIC & PERSISTENCE ---
  const handleOpenCheckout = () => {
    if (!activeTicket) return;
    setSplitPayments(activeTicket.savedSplitPayments || []);
    setPaidProductIds(activeTicket.savedPaidProductIds || []);
    setSplitMode(activeTicket.savedSplitMode || 'full');
    setNWays(activeTicket.savedNWays || 2);
    setIsCheckoutModalOpen(true);
  };

  const handleSavePartialPayments = async () => {
    if (activeTicket) await db.active_tickets.update(activeTicket.id, { savedSplitPayments: splitPayments, savedPaidProductIds: paidProductIds, savedSplitMode: splitMode, savedNWays: nWays });
    setIsCheckoutModalOpen(false);
  };

  const handleVoidPartialPayments = () => {
    showConfirm("Void Partial Payments", "This will completely erase the payment history for this ticket. Are you sure you want to proceed if cash was already taken?", async () => {
      if (activeTicket) await db.active_tickets.update(activeTicket.id, { savedSplitPayments: [], savedPaidProductIds: [], savedSplitMode: null, savedNWays: 2 });
      setSplitPayments([]);
      setPaidProductIds([]);
      setSplitMode('full');
      setNWays(2);
      setIsCheckoutModalOpen(false);
    });
  };

  const handlePartialPayment = (amountToPay, method, itemsToMark = []) => {
    // 1. Log the new payment slice
    const newPayments = [...splitPayments, { amount: amountToPay, method }];
    setSplitPayments(newPayments);

    // 2. Mark any purchased items (For Product splitting mode)
    if (itemsToMark.length > 0) setPaidProductIds([...paidProductIds, ...itemsToMark]);

    // 3. Test if the ticket is completed
    const totalPaidSoFar = newPayments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(cartTotal - totalPaidSoFar) < 0.01 || totalPaidSoFar >= cartTotal) {
      handleConfirmPayment(newPayments);
    }
  };

  const handleCancelCheckout = () => {
    setIsCheckoutModalOpen(false);
    setSplitMode('full');
    setSplitPayments([]);
    setNWays(2);
    setCustomVal('');
    setPaidProductIds([]);
  };

  // Action 2: The actual finalization of the sale
  const handleConfirmPayment = async (paymentsArray) => {

    // Determine the master string for backwards compatibility
    const isSplit = paymentsArray.length > 1;
    const masterMethodString = isSplit ? 'Split' : paymentsArray[0].method;

    // 1. Build the LOCAL Analytics Data (This powers your Admin Dashboard!)
    const localAnalyticsRecord = {
      ...activeTicket, // Copies all items and modifiers
      total: cartTotal,
      method: masterMethodString,
      splits: isSplit ? paymentsArray : null, // The critical array
      timestamp: new Date().toISOString(),
      cashierId: activeCashier?.id || 'unknown',
      cashier_name: activeCashier?.name || 'Unknown Cashier'
    };

    // 2. Build the CLOUD Data specifically matching your Supabase columns
    const currentSale = {
      total_amount: cartTotal,
      payment_method: masterMethodString,
      items_sold: activeTicket.items.map(item => item.name),
      cashier_name: activeCashier?.name || 'Unknown Cashier'
    };

    try {
      await db.sales.add({ ...currentSale, created_at: new Date().toISOString(), status: 'completed' });

      // NEW: INVENTORY DEDUCTION LOGIC
      const inventoryLogs = [];
      activeTicket.items.forEach(item => {
        if (item.inventoryRules && Array.isArray(item.inventoryRules)) {
          item.inventoryRules.forEach(rule => {
            inventoryLogs.push({
              item: rule.name,
              qty: parseFloat(rule.qty),
              timestamp: new Date().toISOString(),
              ticket_id: activeTicket.id
            });
          });
        }
      });
      if (inventoryLogs.length > 0) {
        await db.inventory_logs.bulkAdd(inventoryLogs);
      }
      if (!navigator.onLine) throw new Error("Device is offline");

      // 3. Send it to the cloud!
      const { error } = await supabase.from('sales').insert([currentSale]);
      if (error) throw error;

      console.log("SALE COMPLETE & SAVED TO CLOUD");
    } catch {
      console.warn("Cloud save failed. Moving to offline queue.");
      await db.syncQueue.add(currentSale);
    }

    // 4. ALWAYS DO THIS (Whether online or offline)
    setOrderHistory([...orderHistory, localAnalyticsRecord]);

    // Trigger the flying ticket animation!
    setSuccessTicket({
      name: activeTicket.name,
      items: activeTicket.items,
      total: cartTotal,
      method: masterMethodString
    });
    setTimeout(() => setSuccessTicket(null), 2500);

    handleCancelCheckout(); // Instantly reset split states
    clearCurrentTicket();
  };

  // --- THE NEW BRANDED BOOT SCREEN ---
  if (isLoading) {
    // Read directly from local storage so it renders in 0 milliseconds
    const bootLogo = localStorage.getItem('tinypos_boot_logo');
    
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-main)' }}>
        
        {bootLogo ? (
          // If they uploaded a logo, show it with a smooth pop-in animation
          <img 
            src={bootLogo} 
            alt="App Logo" 
            className="pop-in" 
            style={{ width: '140px', height: '140px', objectFit: 'contain', marginBottom: '24px' }} 
          />
        ) : (
          // Fallback if they haven't set a logo yet
          <div className="spinner" style={{ marginBottom: '24px' }}></div>
        )}

        <h1 style={{ color: 'var(--text-main)', letterSpacing: '6px', textTransform: 'uppercase', margin: 0, fontSize: '1.5rem' }}>
          {posSettings.name || "TinyPOS"}
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>
          Starting system...
        </p>

      </div>
    );
  }

  // --- THE LOCK SCREEN ---
  if (isLocked) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>

        <h1 style={{ color: 'var(--text-main)', marginBottom: '40px' }}>Who is using the register?</h1>

        {/* STEP 1: CHOOSE PROFILE */}
        {!selectedProfile ? (
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {cashiers.map(cashier => (
              <button
                key={cashier.id}
                onClick={() => setSelectedProfile(cashier)}
                style={{ height: '120px', width: '120px', borderRadius: '16px', border: 'none', background: 'var(--bg-surface)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'transform 0.1s' }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{ height: '50px', width: '50px', borderRadius: '25px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {cashier.name.charAt(0)}
                </div>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{cashier.name}</span>
              </button>
            ))}
          </div>
        ) : (

          /* STEP 2: ENTER PIN */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <h2 style={{ color: 'var(--text-main)', margin: 0 }}>Welcome, {selectedProfile.name}</h2>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Enter your 4-digit PIN</p>

            <input
              type="password"
              maxLength="4"
              autoFocus // Automatically highlights the input so they can type instantly
              value={pinAttempt}
              onChange={(e) => setPinAttempt(e.target.value)}
              onKeyDown={handlePinKeyDown} // THE ENTER KEY FIX
              className={phoneError ? 'input-error-shake' : ''}
              style={{ padding: '15px', fontSize: '2rem', width: '150px', textAlign: 'center', letterSpacing: '8px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none' }}
            />

            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button
                onClick={() => { setSelectedProfile(null); setPinAttempt(''); }}
                style={{ flex: 1, padding: '15px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Back
              </button>
              <button
                onClick={handleUnlockSubmit}
                style={{ flex: 2, padding: '15px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Unlock
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!menuData) return <div>Error: Menu data is missing.</div>;

  // Calculate total offline burdens for the UI badge
  const totalOfflineRecords = syncQueue.length + expenseQueue.length + waQueue.length;
  const isCurrentlyOffline = !navigator.onLine;

  // --- TICKET FILTERING ENGINE ---
  // If isolated, only show tickets that belong to the logged-in cashier
  const visibleTickets = posSettings.ticketVisibility === 'isolated'
    ? tickets.filter(t => t.cashierId === activeCashier?.id)
    : tickets;

  // Grab the active ticket from the VISIBLE list, not the master list
  const activeTicket = visibleTickets.find(t => t.id === activeTicketId) || visibleTickets[0];

  // --- THE NEW CART MATH (With Auto & Manual Discounts) ---

  // 1. Calculate the raw subtotal of all items and modifiers
  const cartSubtotal = activeTicket ? activeTicket.items.reduce((total, item) => {
    let itemCost = item.basePrice;
    item.selectedModifiers.forEach(mod => { itemCost += mod.price; });
    return total + itemCost;
  }, 0) : 0;

  // 2. Scan for AUTOMATED rules
  let autoDiscountAmount = 0;
  let activeAutoRuleName = ""; // We track this to show it on the receipt!
  const activeRules = menuData?.discountRules?.filter(r => r.isActive) || [];

  if (activeRules.length > 0 && cartSubtotal > 0) {
    activeRules.forEach(rule => {
      // Rule Type A: Applies to the Entire Order
      if (rule.targetType === 'cart') {
        const ruleValue = rule.type === 'percentage' ? cartSubtotal * (rule.value / 100) : rule.value;
        autoDiscountAmount += ruleValue;
        activeAutoRuleName = rule.name;
      }
      // Rule Type B: Applies ONLY to specific items
      else if (rule.targetType === 'item') {
        activeTicket.items.forEach(item => {
          if (item.name === rule.targetValue) {
            // Figure out the item's cost (base + mods) to calculate percentage accurately
            let itemCost = item.basePrice;
            item.selectedModifiers.forEach(mod => { itemCost += mod.price; });

            const ruleValue = rule.type === 'percentage' ? itemCost * (rule.value / 100) : rule.value;
            autoDiscountAmount += ruleValue;
            activeAutoRuleName = rule.name;
          }
        });
      }
    });
  }

  // 3. Scan for MANUAL Manager Overrides
  let manualDiscountAmount = 0;
  if (activeTicket?.discount) {
    // Note: Manual percentage discounts are applied to the REMAINING balance after auto-discounts!
    const subtotalAfterAuto = Math.max(0, cartSubtotal - autoDiscountAmount);
    if (activeTicket.discount.type === 'percentage') {
      manualDiscountAmount = subtotalAfterAuto * (activeTicket.discount.value / 100);
    } else if (activeTicket.discount.type === 'flat') {
      manualDiscountAmount = activeTicket.discount.value;
    }
  }

  // 4. Calculate Final Total
  const totalDiscounts = autoDiscountAmount + manualDiscountAmount;
  const cartTotal = Math.max(0, cartSubtotal - totalDiscounts);

  return (
    <div className="pos-container">
      <main className="menu-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative' }}>
          <h2 style={{ margin: 0 }}>{activeCategory}</h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* THE NEW DYNAMIC STATUS BADGE */}
            {(isCurrentlyOffline || totalOfflineRecords > 0) && (
              <button
                onClick={() => setIsSyncModalOpen(true)}
                // NEW: Dynamic classes for the pop-in and the glowing pulse!
                className={`pop-in ${isCurrentlyOffline ? 'status-badge-offline' : 'status-badge-syncing'}`}
                style={{ padding: '8px 12px', background: isCurrentlyOffline ? '#e74c3c' : '#f39c12', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {isCurrentlyOffline ? '📵' : '☁️'}
                {totalOfflineRecords > 0 && (
                  <span style={{ background: 'white', color: 'black', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' }}>
                    {totalOfflineRecords}
                  </span>
                )}
              </button>
            )}

            <button className="mobile-hamburger desktop-hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              ☰
            </button>

            <div className={`action-buttons-container ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
              <span style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '9999px', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--brand-color)', border: '1px solid var(--border)' }}>
                👤 {activeCashier?.name}
              </span>

              {/* GASTO BUTTON (SECURED) */}
              <button
                onClick={() => { requirePin("Authorize Gasto", () => setIsExpenseModalOpen(true)); setIsMobileMenuOpen(false); }}
                style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                💸 Gasto
              </button>

              {/* CORTE BUTTON (SECURED) */}
              {posSettings.enableCorte !== false && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    if (shiftOrders.length === 0 && shiftExpenses.length === 0) {
                      return showAlert("No Activity", "There are no sales or expenses to report for this shift yet.");
                    }

                    // Warning about hidden cash!
                    const hasPendingCash = tickets.some(t => t.savedSplitPayments && t.savedSplitPayments.some(p => p.method === 'Cash'));
                    if (hasPendingCash) {
                      return showConfirm("Pending Cash Warning", "There are open tickets with 'Saved Partial Payments' in Cash. This physical cash is currently in your drawer but is NOT counted in the Corte report until those tickets are finalized. Close shift anyway?", () => {
                        requirePin("Authorize Corte de Caja", () => setIsCorteModalOpen(true));
                      });
                    }

                    // Wrap the modal trigger in the security challenge
                    requirePin("Authorize Corte de Caja", () => setIsCorteModalOpen(true));
                  }}
                  style={{ padding: '8px 16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  📊 Corte
                </button>
              )}

              <button onClick={() => { setIsLocked(true); setIsMobileMenuOpen(false); }} className={"lock-btn"}>🔒 Lock</button>
              <button onClick={() => { navigate('/admin'); setIsMobileMenuOpen(false); }} className="admin-btn">⚙️ Admin</button>
            </div>
          </div>
        </div>

        <div className="category-tabs">
          {Object.keys(menuData.categories).map(category => (
            <button key={category} onClick={() => setActiveCategory(category)} className={`tab-btn ${activeCategory === category ? 'active' : ''}`}>
              {category}
            </button>
          ))}
        </div>

        <div className="menu-grid">
          {menuData.categories[activeCategory].map(item => (
            <button key={item.id} onClick={() => handleItemClick(item)} className="item-btn">
              <span className="item-name">{item.emoji || ''} {item.name}</span>
              <span className="item-price">${item.basePrice}</span>
            </button>
          ))}
        </div>
      </main>

      <aside className="ticket-area">
        <div className="ticket-tabs-container">
          {visibleTickets.map(ticket => (
            <button key={ticket.id} onClick={() => setActiveTicketId(ticket.id)} className={`ticket-tab ${activeTicketId === ticket.id ? 'active' : ''}`}>
              {ticket.name}
            </button>
          ))}
          <button className="new-ticket-btn" onClick={handleNewTicket}>+</button>
        </div>

        {/* SAFE GUARD: If this cashier has no tickets, show an empty state! */}
        {!activeTicket ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '10px' }}>No Active Orders</h3>
            <p style={{ marginBottom: '20px' }}>You don't have any open tickets right now.</p>
            <button onClick={handleNewTicket} style={{ padding: '12px 24px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              + Start New Ticket
            </button>
          </div>
        ) : (
          <>
            <ul className="ticket-items">
              {activeTicket.items.length === 0 ? (
                <li className="empty-cart">Cart is empty</li>
              ) : (
                activeTicket.items.map(item => (
                  <li key={item.uniqueId} className="ticket-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div className="item-row">
                      <div>
                        <span>{item.emoji || '•'} {item.name}</span>
                        <span style={{ marginLeft: '10px' }}>${item.basePrice}</span>
                      </div>
                      <button className="delete-item-btn" onClick={() => handleRemoveItem(item.uniqueId)}>✕</button>
                    </div>
                    {item.selectedModifiers.map(mod => (
                      <div key={mod.id} style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', width: '100%', paddingLeft: '10px', paddingRight: '30px' }}>
                        <span>
                          + {mod.name}
                          {/* NEW: Display the custom text value directly on the screen! */}
                          {mod.textValue && (
                            <strong style={{ color: 'var(--text-main)', marginLeft: '4px' }}>
                              : "{mod.textValue}"
                            </strong>
                          )}
                        </span>
                        <span>{mod.price > 0 ? `$${mod.price.toFixed(2)}` : ''}</span>
                      </div>
                    ))}
                  </li>
                ))
              )}
            </ul>

            <div className="ticket-footer">

              {/* SUBTOTAL ROW (Shrinks if there is a discount) */}
              <div className="total-row" style={{ marginBottom: activeTicket.discount ? '4px' : '16px', fontSize: activeTicket.discount ? '1.1rem' : '1.5rem', color: activeTicket.discount ? 'var(--text-muted)' : 'var(--text-main)' }}>
                <span>Subtotal</span>
                <span>${cartSubtotal.toFixed(2)}</span>
              </div>

              {/* AUTOMATED DISCOUNT ROW */}
              {autoDiscountAmount > 0 && (
                <div className="total-row" style={{ marginBottom: '4px', fontSize: '1.1rem', color: '#27ae60' }}>
                  <span>⭐ Auto: {activeAutoRuleName}</span>
                  <span>-${autoDiscountAmount.toFixed(2)}</span>
                </div>
              )}

              {/* DISCOUNT ROW (Only shows if a discount is active) */}
              {activeTicket.discount && (
                <div className="total-row" style={{ marginBottom: '4px', fontSize: '1.1rem', color: '#e74c3c' }}>
                  <span>Discount ({activeTicket.discount.type === 'percentage' ? `${activeTicket.discount.value}%` : `$${activeTicket.discount.value}`})</span>
                  <span>-${manualDiscountAmount.toFixed(2)}</span>
                </div>
              )}

              {/* NEW GRAND TOTAL ROW */}
              {activeTicket.discount && (
                <div className="total-row" style={{ marginBottom: '16px', fontSize: '1.5rem', color: 'var(--text-main)' }}>
                  <span>Total</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
              )}

              <button
                onClick={handleSendToBarista}
                disabled={activeTicket.items.length === 0 || activeTicket.sentToBarista}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: activeTicket.sentToBarista ? 'var(--bg-main)' : '#f39c12',
                  color: activeTicket.sentToBarista ? 'var(--text-muted)' : 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '1.1rem',
                  marginBottom: '10px',
                  cursor: activeTicket.sentToBarista ? 'default' : 'pointer'
                }}
              >
                {activeTicket.sentToBarista ? '✓ Sent to Barista' : '☕ Send to Barista'}
              </button>

              <div className="checkout-actions">
                <button
                  className="options-btn"
                  onClick={() => setIsActionSheetOpen(true)}
                  disabled={activeTicket.items.length === 0}
                  style={{ flex: '0 0 auto', width: '60px', padding: '16px 0', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2rem', opacity: activeTicket.items.length === 0 ? 0.5 : 1, cursor: activeTicket.items.length === 0 ? 'not-allowed' : 'pointer' }}
                >
                  ⚙️
                </button>
                <button className="charge-btn" onClick={handleOpenCheckout} disabled={activeTicket.items.length === 0} style={{ flex: 1 }}>
                  Pay & Close
                </button>
              </div>
            </div>

            {/* --- SLIDE-UP TICKET ACTIONS DRAWER --- */}
            <div className={`bottom-sheet-overlay ${isActionSheetOpen ? 'open' : ''}`} onClick={() => setIsActionSheetOpen(false)}></div>
            <div className={`bottom-sheet ${isActionSheetOpen ? 'open' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Ticket Options</h3>
                <button onClick={() => setIsActionSheetOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button className="cancel-btn" onClick={() => { setIsActionSheetOpen(false); handleCancelTicket(); }} style={{ flex: 1, padding: '16px', fontSize: '1.1rem' }}>
                  Void Ticket
                </button>

                <button
                  onClick={() => { setIsActionSheetOpen(false); requirePin("Authorize Discount", () => setIsDiscountModalOpen(true)); }}
                  style={{ flex: 1, padding: '16px', background: 'var(--bg-main)', color: '#8e44ad', border: '1px solid #8e44ad', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1rem' }}
                >
                  % Discount
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button style={{ flex: 1, padding: '16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }} onClick={() => { setIsActionSheetOpen(false); handlePrintOnly(); }}>
                    🖨️ Print
                  </button>
                  <button style={{ flex: 1, padding: '16px', background: '#25D366', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }} onClick={() => { setIsActionSheetOpen(false); setLoyaltyModal({ isOpen: true, step: 'phone', phone: '', data: null }); }}>
                    📱 WhatsApp
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* DRINK MODIFIER MODAL (Unchanged) */}
      {isModalOpen && pendingItem && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Customize: {pendingItem.name}</h2>
            {pendingItem.allowedModifiers.map(modKey => (
              <div key={modKey} className="modifier-group">
                <h4 style={{ textTransform: 'capitalize' }}>{modKey.replace('_', ' ')}</h4>
                {menuData.modifierGroups[modKey].map(option => {
                  const existingMod = pendingItem.selectedModifiers.find(m => m.id === option.id);
                  const isSelected = !!existingMod;

                  // IF IT IS A TEXT INPUT (For Liverpool Customization)
                  if (option.isTextInput) {
                    return (
                      <div key={option.id} style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>{option.name}</label>
                        <input
                          type="text"
                          placeholder="Type here..."
                          value={existingMod ? existingMod.textValue : ''}
                          onChange={(e) => handleTextModifierChange(modKey, option, e.target.value)}
                          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `2px solid ${isSelected ? 'var(--brand-color)' : 'var(--border)'}`, background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }}
                        />
                      </div>
                    )
                  }

                  // IF IT IS A STANDARD BUTTON (For Coffee Shop)
                  return (
                    <button key={option.id} onClick={() => handleToggleModifier(modKey, option)} className={`modifier-btn ${isSelected ? 'selected' : ''}`} style={{ margin: '4px' }}>
                      {option.name} {option.price > 0 && `(+$${option.price})`}
                    </button>
                  )
                })}
              </div>
            ))}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="btn-confirm" onClick={() => addToTicket(pendingItem, pendingItem.selectedModifiers)}>Add to Ticket</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: PAYMENT MODAL WITH SPLIT ENGINE */}
      {isCheckoutModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '10px', color: 'var(--text-main)' }}>Payment Checkout</h2>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px', background: 'var(--bg-main)', padding: '15px', borderRadius: '8px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Total Due</span>
                <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '5px 0 0 0', color: 'var(--brand-color)' }}>${cartTotal.toFixed(2)}</p>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '20px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Paid</span>
                <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '5px 0 0 0', color: '#27ae60' }}>${splitPayments.reduce((s, p) => s + p.amount, 0).toFixed(2)}</p>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '20px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Remaining</span>
                <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '5px 0 0 0', color: '#e74c3c' }}>${Math.max(0, cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0)).toFixed(2)}</p>
              </div>
            </div>

            {/* SPLIT TABS (ALWAYS VISIBLE NOW TO ALLOW MIXED METHODS) */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px', paddingBottom: '4px' }}>
              <button onClick={() => setSplitMode('full')} style={{ flex: '1 1 45%', padding: '12px 8px', background: splitMode === 'full' ? 'var(--brand-color)' : 'var(--bg-main)', color: splitMode === 'full' ? 'white' : 'var(--text-main)', borderRadius: '8px', border: splitMode === 'full' ? 'none' : '2px solid var(--border)', fontWeight: 'bold' }}>💰 Remaining</button>
              <button onClick={() => setSplitMode('even')} style={{ flex: '1 1 45%', padding: '12px 8px', background: splitMode === 'even' ? 'var(--brand-color)' : 'var(--bg-main)', color: splitMode === 'even' ? 'white' : 'var(--text-main)', borderRadius: '8px', border: splitMode === 'even' ? 'none' : '2px solid var(--border)', fontWeight: 'bold' }}>👥 Even By N</button>
              <button onClick={() => setSplitMode('product')} style={{ flex: '1 1 45%', padding: '12px 8px', background: splitMode === 'product' ? 'var(--brand-color)' : 'var(--bg-main)', color: splitMode === 'product' ? 'white' : 'var(--text-main)', borderRadius: '8px', border: splitMode === 'product' ? 'none' : '2px solid var(--border)', fontWeight: 'bold' }}>🛍️ By Prod.</button>
              <button onClick={() => setSplitMode('custom')} style={{ flex: '1 1 45%', padding: '12px 8px', background: splitMode === 'custom' ? 'var(--brand-color)' : 'var(--bg-main)', color: splitMode === 'custom' ? 'white' : 'var(--text-main)', borderRadius: '8px', border: splitMode === 'custom' ? 'none' : '2px solid var(--border)', fontWeight: 'bold' }}>🔢 Custom</button>
            </div>

            {/* THE TENDER BUTTONS (Dynamic based on mode) */}
            <div style={{ textAlign: 'left', minHeight: '150px' }}>

              {/* === FULL MODE === */}
              {splitMode === 'full' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button onClick={() => handlePartialPayment(cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0), 'Cash')} style={{ padding: '20px', fontSize: '1.2rem', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>💵 Cash</button>
                  <button onClick={() => handlePartialPayment(cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0), 'Card')} style={{ padding: '20px', fontSize: '1.2rem', background: '#2980b9', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>💳 Credit / Debit</button>
                  <button onClick={() => handlePartialPayment(cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0), 'Transfer')} style={{ padding: '20px', fontSize: '1.2rem', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>📱 Transfer</button>
                </div>
              )}

              {/* === EVEN SPLIT MODE (REDESIGNED FOR MIXED SUPPORT) === */}
              {splitMode === 'even' && (
                <div style={{ background: 'var(--bg-main)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '16px', textAlign: 'center' }}>Divide the remaining balance evenly.</p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '20px' }}>
                    <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.2rem' }}>Remaining People:</span>
                    <button onClick={() => setNWays(Math.max(1, nWays - 1))} style={{ padding: '10px 20px', borderRadius: '8px', border: '2px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontSize: '1.2rem', cursor: 'pointer' }}>-</button>
                    <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{nWays}</span>
                    <button onClick={() => setNWays(nWays + 1)} style={{ padding: '10px 20px', borderRadius: '8px', border: '2px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontSize: '1.2rem', cursor: 'pointer' }}>+</button>
                  </div>

                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--brand-color)' }}>
                      ${((cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0)) / nWays).toFixed(2)}
                    </span>
                    <span style={{ color: 'var(--text-muted)', display: 'block', marginTop: '5px' }}>due per person</span>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => {
                      handlePartialPayment((cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0)) / nWays, 'Cash');
                      setNWays(Math.max(1, nWays - 1)); // Auto decrement
                    }} style={{ flex: 1, padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2rem', cursor: 'pointer' }}>💵 Cash</button>
                    <button onClick={() => {
                      handlePartialPayment((cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0)) / nWays, 'Card');
                      setNWays(Math.max(1, nWays - 1)); // Auto decrement
                    }} style={{ flex: 1, padding: '16px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2rem', cursor: 'pointer' }}>💳 Card</button>
                  </div>
                </div>
              )}

              {/* === BY PRODUCT MODE === */}
              {splitMode === 'product' && (
                <div>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Select an item to pay for it independently.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', padding: '4px' }}>
                    {activeTicket.items.map(item => {
                      const isPaid = paidProductIds.includes(item.id);
                      let itemTotal = item.basePrice;
                      if (item.selectedModifiers) {
                        itemTotal += Object.values(item.selectedModifiers).reduce((s, m) => s + (m.price || 0), 0);
                      }

                      return (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: isPaid ? 'rgba(0,0,0,0.05)' : 'var(--bg-main)', opacity: isPaid ? 0.6 : 1, borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>{item.name}</div>
                            <div style={{ color: 'var(--brand-color)' }}>${itemTotal.toFixed(2)}</div>
                          </div>
                          {isPaid ? (
                            <span>✅ Paid</span>
                          ) : (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handlePartialPayment(itemTotal, 'Cash', [item.id])} style={{ padding: '8px 12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Cash</button>
                              <button onClick={() => handlePartialPayment(itemTotal, 'Card', [item.id])} style={{ padding: '8px 12px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Card</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Catch-all for discounts/tips/taxes that alter the base sum of items */}
                  {(cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0)) > 0 && paidProductIds.length === activeTicket.items.length && (
                    <div style={{ marginTop: '20px', padding: '16px', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffeeba' }}>
                      <strong style={{ color: '#856404' }}>Unitemized Balance: ${(cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0)).toFixed(2)}</strong>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button onClick={() => handlePartialPayment(cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0), 'Cash')} style={{ flex: 1, padding: '10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Cash</button>
                        <button onClick={() => handlePartialPayment(cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0), 'Card')} style={{ flex: 1, padding: '10px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Card</button>
                        <button onClick={() => handlePartialPayment(cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0), 'Transfer')} style={{ flex: 1, padding: '10px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Transfer</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* === CUSTOM AMOUNT MODE === */}
              {splitMode === 'custom' && (
                <div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Enter partial amount:</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        step="0.01"
                        value={customVal}
                        onChange={(e) => setCustomVal(e.target.value)}
                        style={{ width: '100%', padding: '16px', fontSize: '1.5rem', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'flex-end' }}>
                      <button onClick={() => {
                        const amt = parseFloat(customVal);
                        const rem = cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0);
                        if (amt > 0 && amt <= rem + 0.01) {
                          handlePartialPayment(amt, 'Cash');
                          setCustomVal('');
                        } else alert('Please enter a valid amount less than or equal to the remaining balance.');
                      }} style={{ padding: '10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Cash</button>

                      <button onClick={() => {
                        const amt = parseFloat(customVal);
                        const rem = cartTotal - splitPayments.reduce((s, p) => s + p.amount, 0);
                        if (amt > 0 && amt <= rem + 0.01) {
                          handlePartialPayment(amt, 'Card');
                          setCustomVal('');
                        } else alert('Please enter a valid amount less than or equal to the remaining balance.');
                      }} style={{ padding: '10px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Card</button>
                    </div>
                  </div>

                  {/* Show history of payments */}
                  {splitPayments.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-main)' }}>Payment Log</h4>
                      {splitPayments.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                          <span>✅ {p.method}</span>
                          <span>${p.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {splitPayments.length > 0 ? (
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={handleSavePartialPayments}
                  style={{ flex: 2, padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}
                >
                  💾 Save & Hide
                </button>
                <button
                  onClick={handleVoidPartialPayments}
                  style={{ flex: 1, padding: '16px', background: 'transparent', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}
                >
                  🗑️ Void
                </button>
              </div>
            ) : (
              <button
                onClick={handleCancelCheckout}
                style={{ width: '100%', marginTop: '24px', padding: '16px', background: 'transparent', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}
              >
                Close Checkout
              </button>
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

      {/* --- CUSTOM LOYALTY & WHATSAPP MODAL --- */}
      {loyaltyModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: 'var(--text-main)' }}>Loyalty Rewards</h2>
              <button onClick={() => setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null })} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* STEP 1: ENTER PHONE */}
            {loyaltyModal.step === 'phone' && (
              <div>
                {/* Dynamically change the text if the program is paused */}
                <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                  {(() => {
                    const isLoyaltyActive = menuData?.loyaltySettings?.isActive === true || menuData?.loyaltySettings?.isActive === "true";
                    return isLoyaltyActive
                      ? "Enter customer's WhatsApp number to check their status."
                      : "Enter customer's WhatsApp number to send receipt.";
                  })()}
                </p>

                <input
                  type="tel"
                  maxLength="10"
                  placeholder="222 123 4567"
                  value={loyaltyModal.phone}
                  onChange={(e) => setLoyaltyModal({ ...loyaltyModal, phone: e.target.value })}
                  className={phoneError ? 'input-error-shake' : ''}
                  style={{ width: '100%', padding: '15px', fontSize: '1.5rem', letterSpacing: '2px', textAlign: 'center', marginBottom: '20px', borderRadius: '8px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s' }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

                  {/* HIDE THE LOYALTY BUTTON IF THE PROGRAM IS PAUSED */}
                  {(menuData?.loyaltySettings?.isActive === true || menuData?.loyaltySettings?.isActive === "true") && (
                    <button onClick={handleCheckLoyalty} style={{ width: '100%', padding: '15px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>
                      Check Loyalty Status
                    </button>
                  )}

                  {/* ALWAYS SHOW THE GUEST / STANDARD RECEIPT BUTTON */}
                  <button onClick={handleGuestReceipt} style={{ width: '100%', padding: '15px', background: (menuData?.loyaltySettings?.isActive === true || menuData?.loyaltySettings?.isActive === "true") ? 'transparent' : '#25D366', color: (menuData?.loyaltySettings?.isActive === true || menuData?.loyaltySettings?.isActive === "true") ? 'var(--text-muted)' : 'white', border: (menuData?.loyaltySettings?.isActive === true || menuData?.loyaltySettings?.isActive === "true") ? '1px solid var(--border)' : 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    {(menuData?.loyaltySettings?.isActive === true || menuData?.loyaltySettings?.isActive === "true") ? "Send Receipt Only (Do Not Track)" : "Send Receipt"}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: THE CASHIER ALERT & SEND SCRIPT */}
            {loyaltyModal.step === 'result' && loyaltyModal.data && (
              <div>
                {loyaltyModal.data.isRewardReady ? (
                  <div style={{ background: '#fff0f5', border: '2px solid #ff69b4', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
                    <h1 style={{ margin: '0 0 10px 0', fontSize: '3rem' }}>🎉</h1>
                    <h2 style={{ color: '#ff1493', margin: '0 0 10px 0' }}>REWARD READY!</h2>
                    <p style={{ fontSize: '1.1rem', color: '#333', margin: 0 }}>
                      <strong>Tell the customer:</strong><br />
                      "This is your {loyaltyModal.data.visits}th visit! You get {loyaltyModal.data.reward} today!"
                    </p>
                  </div>
                ) : (
                  <div style={{ background: 'var(--bg-main)', border: '2px solid var(--border)', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
                    <h2 style={{ color: 'var(--brand-color)', margin: '0 0 10px 0' }}>Visit #{loyaltyModal.data.visits}</h2>
                    <div style={{ fontSize: '1.5rem', margin: '10px 0' }}>
                      {"⭐".repeat(loyaltyModal.data.visits % loyaltyModal.data.target || loyaltyModal.data.target)}
                    </div>
                    <p style={{ fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>
                      <strong>Tell the customer:</strong><br />
                      "You have {loyaltyModal.data.visits} visits! You only need {loyaltyModal.data.target - (loyaltyModal.data.visits % loyaltyModal.data.target)} more for {loyaltyModal.data.reward}."
                    </p>
                  </div>
                )}

                {/* Find this button in STEP 2 and update the onClick */}
                <button
                  onClick={() => sendFinalMessage(loyaltyModal.phone.replace(/\D/g, ''), loyaltyModal.data)}
                  style={{ width: '100%', padding: '15px', background: '#25D366', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                >
                  📱 Send WhatsApp Receipt

                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- THE FLYING SUCCESS RECEIPT --- */}
      {successTicket && (
        <div className="flying-receipt">
          <h2 style={{ textAlign: 'center', margin: '0 0 15px 0', fontSize: '2rem', color: '#27ae60' }}>PAID</h2>
          <div style={{ textAlign: 'center', marginBottom: '15px', fontSize: '1.2rem', fontWeight: 'bold' }}>
            {successTicket.name}
          </div>

          <div style={{ marginBottom: '15px' }}>
            {successTicket.items.map(item => (
              <div key={item.uniqueId} className="flying-receipt-row">
                <span>{item.emoji || '•'} {item.name}</span>
                <span>${item.basePrice.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px dashed black', margin: '15px 0' }}></div>

          <div className="flying-receipt-row" style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
            <span>TOTAL</span>
            <span>${successTicket.total.toFixed(2)}</span>
          </div>

          <div style={{ textAlign: 'center', marginTop: '20px', color: '#666', fontSize: '0.9rem' }}>
            Method: {successTicket.method}
          </div>
        </div>
      )}

      {/* --- EXPENSE (GASTO) MODAL --- */}
      {isExpenseModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="modal-content fade-in" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#e74c3c' }}>Record Expense (Gasto)</h2>
              <button onClick={() => setIsExpenseModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
            </div>

            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Log money taken out of the cash drawer to keep your register balanced.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g., 150.50"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  style={{ width: '100%', padding: '15px', fontSize: '1.2rem', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>Reason / Vendor</label>
                <input
                  type="text"
                  placeholder="e.g., Hielo, Leche, Propinas"
                  value={expenseForm.reason}
                  onChange={(e) => setExpenseForm({ ...expenseForm, reason: e.target.value })}
                  style={{ width: '100%', padding: '15px', fontSize: '1.2rem', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                />
              </div>

              <button
                onClick={handleSaveExpense}
                style={{ width: '100%', padding: '16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '10px' }}
              >
                Withdraw Cash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CORTE DE CAJA MODAL --- */}
      {isCorteModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="modal-content fade-in" style={{ maxWidth: '450px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: 'var(--text-main)' }}>Corte de Caja</h2>
              <button onClick={() => setIsCorteModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
            </div>

            <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Shift Breakdown</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--text-main)' }}>
                <span>💵 Cash Sales:</span> <span>${shiftCashSales.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--text-main)' }}>
                <span>💳 Card Sales:</span> <span>${shiftCardSales.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--text-main)' }}>
                <span>📱 Transfer Sales:</span> <span>${shiftTransferSales.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: '#e74c3c' }}>
                <span>💸 Cash Expenses:</span> <span>-${shiftTotalExpenses.toFixed(2)}</span>
              </div>
              <div style={{ borderTop: '2px dashed var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-main)' }}>
                <span>Expected Cash in Drawer:</span>
                <span style={{ color: '#27ae60' }}>${expectedCash.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>Actual Cash Counted ($)</label>
              <input
                type="number"
                step="0.01"
                placeholder="How much physical money is there?"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                style={{ width: '100%', padding: '15px', fontSize: '1.5rem', textAlign: 'center', borderRadius: '8px', border: '2px solid var(--brand-color)', background: 'var(--bg-surface)', color: 'var(--text-main)' }}
              />
            </div>

            <button
              onClick={handleProcessCorte}
              style={{ width: '100%', padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '20px' }}
            >
              Close Shift
            </button>
          </div>
        </div>
      )}

      {/* --- PIN CHALLENGE MODAL --- */}
      {pinChallenge.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content fade-in" style={{ maxWidth: '350px', textAlign: 'center', background: 'var(--bg-surface)' }}>

            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🛡️</div>
            <h2 style={{ color: 'var(--text-main)', margin: '0 0 10px 0' }}>{pinChallenge.title}</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Enter PIN to continue</p>

            <input
              type="password"
              maxLength="4"
              autoFocus
              value={challengePinAttempt}
              onChange={(e) => setChallengePinAttempt(e.target.value.replace(/\D/g, ''))} // Force numbers only
              onKeyDown={handleChallengeKeyDown} // Supports the physical Enter key
              className={challengeError ? 'input-error-shake' : ''}
              style={{ padding: '15px', fontSize: '2rem', width: '150px', textAlign: 'center', letterSpacing: '8px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }}
            />

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => { setPinChallenge({ isOpen: false, title: "", onAuthorized: null }); setChallengePinAttempt(''); }}
                style={{ flex: 1, padding: '12px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Cancel
              </button>
              <button
                onClick={handleChallengeSubmit}
                style={{ flex: 1, padding: '12px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Verify
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- OFFLINE SYNC STATUS MODAL --- */}
      {isSyncModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content fade-in" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: 'var(--text-main)' }}>System Status</h2>
              <button onClick={() => setIsSyncModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
            </div>

            {isCurrentlyOffline ? (
              <div style={{ background: '#fdf0ed', color: '#e74c3c', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e74c3c' }}>
                <strong>📵 You are currently offline.</strong><br />
                Don't worry! You can keep ringing up orders and logging expenses. Everything is saved safely on this device.
              </div>
            ) : (
              <div style={{ background: '#eafaf1', color: '#27ae60', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #27ae60' }}>
                <strong>🟢 Internet Connected!</strong><br />
                We are currently uploading your saved data to the cloud.
              </div>
            )}

            <h4 style={{ color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Pending Uploads:</h4>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px dashed var(--border)', fontSize: '1.1rem', color: 'var(--text-main)' }}>
              <span>🛒 Sales Tickets</span>
              <span style={{ fontWeight: 'bold' }}>{syncQueue.length}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px dashed var(--border)', fontSize: '1.1rem', color: 'var(--text-main)' }}>
              <span>💸 Gastos (Expenses)</span>
              <span style={{ fontWeight: 'bold' }}>{expenseQueue.length}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', fontSize: '1.1rem', color: 'var(--text-main)' }}>
              <span>📱 WhatsApp Receipts</span>
              <span style={{ fontWeight: 'bold' }}>{waQueue.length}</span>
            </div>

            <button
              onClick={() => setIsSyncModalOpen(false)}
              style={{ width: '100%', padding: '16px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '2px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '20px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* --- DISCOUNT MODAL --- */}
      {isDiscountModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="modal-content fade-in" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#8e44ad' }}>Apply Discount</h2>
              <button onClick={() => setIsDiscountModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button
                onClick={() => setDiscountForm({ ...discountForm, type: 'percentage' })}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 'bold', border: `2px solid ${discountForm.type === 'percentage' ? '#8e44ad' : 'var(--border)'}`, background: discountForm.type === 'percentage' ? '#f5eef8' : 'var(--bg-main)', color: discountForm.type === 'percentage' ? '#8e44ad' : 'var(--text-main)' }}
              >
                % Percentage
              </button>
              <button
                onClick={() => setDiscountForm({ ...discountForm, type: 'flat' })}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 'bold', border: `2px solid ${discountForm.type === 'flat' ? '#8e44ad' : 'var(--border)'}`, background: discountForm.type === 'flat' ? '#f5eef8' : 'var(--bg-main)', color: discountForm.type === 'flat' ? '#8e44ad' : 'var(--text-main)' }}
              >
                $ Flat Amount
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>
                {discountForm.type === 'percentage' ? 'Discount Percentage (%)' : 'Discount Amount ($)'}
              </label>
              <input
                type="number"
                step={discountForm.type === 'percentage' ? "1" : "0.01"}
                placeholder={discountForm.type === 'percentage' ? "e.g., 10" : "e.g., 5.00"}
                value={discountForm.value}
                onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })}
                style={{ width: '100%', padding: '15px', fontSize: '1.5rem', textAlign: 'center', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {activeTicket?.discount && (
                <button
                  onClick={handleRemoveDiscount}
                  style={{ flex: 1, padding: '16px', background: 'transparent', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}
                >
                  Remove
                </button>
              )}
              <button
                onClick={handleApplyDiscount}
                style={{ flex: 2, padding: '16px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- KDS REVERSE BRIDGE TOAST --- */}
      <div className="toast-container">
        {toastNotifications.map(toast => (
          <div key={toast.id} className="toast">
            <span style={{ fontSize: '1.5rem' }}>✅</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

    </div>
  );
}

export default Register;