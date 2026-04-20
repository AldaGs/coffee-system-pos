import { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './App.css';
import { PosContext } from './utils/PosContext';

// Modular Child Components
import BootScreen from './components/register/BootScreen';
import LockScreen from './components/register/LockScreen';
import MenuArea from './components/register/MenuArea';
import TicketArea from './components/register/TicketArea';
import ModifierModal from './components/register/ModifierModal';
import CheckoutModal from './components/register/CheckoutModal';
import LoyaltyModal from './components/register/LoyaltyModal';
import FlyingReceipt from './components/register/FlyingReceipt';
import ExpenseModal from './components/register/ExpenseModal';
import CorteModal from './components/register/CorteModal';
import PinChallengeModal from './components/register/PinChallengeModal';
import SyncStatusModal from './components/register/SyncStatusModal';
import DiscountModal from './components/register/DiscountModal';

import Dialog from './components/shared/Dialog';

function Register() {
  const navigate = useNavigate();

  // --- INSTANT OFFLINE STATE INITIALIZATION ---
  const [menuData, setMenuData] = useState(() => {
    const cachedMenu = localStorage.getItem('tinypos_cached_menu');
    return cachedMenu ? JSON.parse(cachedMenu) : null;
  });

  const [isLoading, setIsLoading] = useState(true);

  // Refs to prevent Realtime re-subscription storms
  const activeTicketIdRef = useRef(null);
  const activeCashierRef = useRef(null);
  const sessionTimeRef = useRef(0);

  const [activeCategory, setActiveCategory] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);
  const [successTicket, setSuccessTicket] = useState(null);
  const tickets = useLiveQuery(() => db.active_tickets.toArray(), []) || [];

  const [activeTicketId, setActiveTicketId] = useState(() => {
    const savedId = localStorage.getItem('tinypos_activeTicketId');
    return savedId ? JSON.parse(savedId) : 1;
  });

  const [recipes, setRecipes] = useState(() => {
    const cachedRecipes = localStorage.getItem('tinypos_cached_recipes');
    return cachedRecipes ? JSON.parse(cachedRecipes) : [];
  });

  // --- MENU FETCH & OFFLINE CACHE ENGINE ---
  useEffect(() => {
    const fetchMenuAndRecipes = async () => {
      try {
        // 1. Fetch Menu
        const { data: menuResp, error: menuErr } = await supabase.from('shop_settings').select('menu_data').eq('id', 1).single();
        if (menuErr) throw menuErr;
        
        // 2. Fetch Recipes for BOM Lookups
        const { data: recipeResp, error: recipeErr } = await supabase.from('recipes').select('*');
        if (recipeErr) throw recipeErr;

        setMenuData(menuResp.menu_data);
        setRecipes(recipeResp);
        setActiveCategory(Object.keys(menuResp.menu_data.categories)[0]);

        localStorage.setItem('tinypos_cached_menu', JSON.stringify(menuResp.menu_data));
        localStorage.setItem('tinypos_cached_recipes', JSON.stringify(recipeResp));

      } catch {
        console.warn("Cloud fetch failed. Searching for local backup...");
        const cachedMenu = localStorage.getItem('tinypos_cached_menu');
        const cachedRecipes = localStorage.getItem('tinypos_cached_recipes');
        
        if (cachedMenu) {
          const parsedMenu = JSON.parse(cachedMenu);
          setMenuData(parsedMenu);
          setActiveCategory(Object.keys(parsedMenu.categories)[0]);
        }
        if (cachedRecipes) {
          setRecipes(JSON.parse(cachedRecipes));
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchMenuAndRecipes();
  }, []);


  // --- UPDATED: FULL SOURCE-OF-TRUTH SYNC ---
  const syncCloudTickets = async () => {
    if (!navigator.onLine) return;
    try {
      const { data, error } = await supabase.from('active_tickets').select('*');
      if (data && !error) {
        // 1. Get all tickets currently on this device (Phone/PC)
        const localTickets = await db.active_tickets.toArray();
        const cloudIds = data.map(t => t.id);

        // 2. Find "Ghost" tickets (Items on your phone that aren't in Supabase)
        const ghostTickets = localTickets.filter(t => !cloudIds.includes(t.id));

        if (ghostTickets.length > 0) {
          // Kill the ghosts!
          const idsToDelete = ghostTickets.map(g => g.id);
          await db.active_tickets.bulkDelete(idsToDelete);
          console.log(`Cleared ${idsToDelete.length} ghost tickets from local storage.`);
        }

        // 3. Update the local database with the actual cloud data
        await db.active_tickets.bulkPut(data);
      }
    } catch (err) {
      console.error("Could not sync cloud tickets:", err);
    }
  };

  // --- TRIGGER SYNC & SET UP REAL-TIME LISTENER ---
  useEffect(() => {
    if (!supabase || !navigator.onLine) return;
    syncCloudTickets();

    const ticketChannel = supabase
      .channel('active-tickets-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'active_tickets' },
        async (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            await db.active_tickets.put(payload.new);
          }
          else if (payload.eventType === 'DELETE') {
            await db.active_tickets.delete(payload.old.id);
            if (activeTicketIdRef.current === payload.old.id) {
              setActiveTicketId(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ticketChannel);
    };
  }, []); // Stable: Only on mount

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
      // Don't try if we are offline
      if (!navigator.onLine) return;

      try {
        // 1. Sync Sales
        if (syncQueue.length > 0) {
          // THE FIX: Strip the local Dexie ID from the sales
          const cleanSales = syncQueue.map(({ id, ...rest }) => rest);
          
          const { error: salesErr } = await supabase.from('sales').insert(cleanSales);
          if (!salesErr) {
            await db.syncQueue.clear();
          } else {
            console.error("Sales sync failed:", salesErr);
          }
        }
        
        // 2. Sync Expenses
        if (expenseQueue.length > 0) {
          // THE FIX: Strip the local ID from expenses just in case
          const cleanExpenses = expenseQueue.map(({ id, ...rest }) => rest);
          
          const { error: expErr } = await supabase.from('expenses').insert(cleanExpenses);
          if (!expErr) setExpenseQueue([]);
        }

        // 3. Sync Inventory Logs
        const pendingInventory = await db.inventory_logs.toArray();
        if (pendingInventory.length > 0) {
          // THE FIX: Strip the local Dexie ID from the inventory logs
          const cleanLogs = pendingInventory.map(({ id, ...rest }) => rest);
          
          const { error: invErr } = await supabase.from('inventory_logs').insert(cleanLogs);
          if (!invErr) {
            await db.inventory_logs.clear();
          } else {
            console.error("Inventory sync failed:", invErr);
          }
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
    let statusMsg = "Perfectly Balanced âš–ï¸";
    if (difference > 0) statusMsg = `Over (Sobrante) by $${difference.toFixed(2)} â¬†ï¸`;
    if (difference < 0) statusMsg = `Short (Faltante) by $${Math.abs(difference).toFixed(2)} â¬‡ï¸`;

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
    let id = sessionStorage.getItem('tinypos_device_id');
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

  // Keep refs in sync (moved here to ensure state is initialized)
  useEffect(() => { activeTicketIdRef.current = activeTicketId; }, [activeTicketId]);
  useEffect(() => { activeCashierRef.current = activeCashier; }, [activeCashier]);
  useEffect(() => { sessionTimeRef.current = sessionTime; }, [sessionTime]);


  // Lock Screen temporary states
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [pinAttempt, setPinAttempt] = useState('');


  // --- NEW: KEYBOARD SUPPORT FOR STAFF PIN ---
  useEffect(() => {
    // Only listen if the register is locked and a staff member is already selected
    if (!isLocked || !selectedProfile) return;

    const handleStaffKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        setPinAttempt(prev => prev.length < 4 ? prev + e.key : prev);
      } else if (e.key === 'Backspace') {
        setPinAttempt(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        if (pinAttempt.length === 4) handleUnlockSubmit();
      } else if (e.key === 'Escape') {
        setPinAttempt('');
        setSelectedProfile(null); // Return to user list
      }
    };

    window.addEventListener('keydown', handleStaffKeyDown);
    return () => window.removeEventListener('keydown', handleStaffKeyDown);
  }, [isLocked, selectedProfile, pinAttempt]);

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

  // --- CONTEXT RESTORATION (Snap to current data on login) ---
useEffect(() => {
  // If the screen just unlocked, and we know who the cashier is
  if (!isLocked && activeCashier && tickets.length > 0) {
     
     // Find all tickets belonging to this specific cashier
     const myTickets = tickets.filter(t => t.cashierId === activeCashier.id);
     
     if (myTickets.length > 0) {
        // Sort them to find the newest one (highest ID)
        const newestTicket = myTickets.sort((a, b) => b.id - a.id)[0];
        
        // Snap the UI to that ticket immediately
        setActiveTicketId(newestTicket.id);
     }
  }
}, [isLocked, activeCashier]); // This runs exactly once when you unlock the screen

// --- PRESENCE & SECURITY (Active Lockout System) ---
useEffect(() => {
  if (!activeCashier) return;

  // 1. Configure the channel to allow two-way broadcasting
  const channel = supabase.channel('cashier-presence', {
    config: { 
      presence: { key: myDeviceId },
      broadcast: { ack: true } 
    },
  });

  channel
    // 2. THE EAR: Listen for incoming kill commands
    .on('broadcast', { event: 'force-kick' }, (payload) => {
      const { incomingCashierId, incomingDeviceId } = payload.payload;
      
      // If the broadcast is for my logged-in cashier, but it came from a DIFFERENT device -> Lockout
      if (incomingCashierId === activeCashier.id && incomingDeviceId !== myDeviceId) {
        console.warn(`🔒 Session terminated by device: ${incomingDeviceId}`);
        setIsLocked(true);
        // Optional: clear the active screen state if you want them to fully start over
      }
    })
    // 3. THE EYE: Passive tracking (mostly for your console debugging)
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      console.log("Tracking Presence:", state);
    })
    // 4. THE CONNECTION
    .subscribe(async (status) => {
      console.log(`Presence Status (${activeCashier.name}):`, status);
      
      if (status === 'SUBSCRIBED') {
        // Announce our presence to the room
        await channel.track({ 
          cashierId: activeCashier.id, 
          deviceId: myDeviceId,
          loginAt: new Date().toISOString()
        });

        // THE WEAPON: Instantly fire the kick command to any older devices
        await channel.send({
          type: 'broadcast',
          event: 'force-kick',
          payload: { 
            incomingCashierId: activeCashier.id, 
            incomingDeviceId: myDeviceId 
          }
        });
      }
    });

  // Cleanup on unmount or when cashier logs out
  return () => {
    supabase.removeChannel(channel);
  };
}, [activeCashier, myDeviceId]); // Re-runs anytime the cashier changes

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

// --- PRESENCE & SECURITY (Active Lockout System) ---
useEffect(() => {
  // Don't connect if we are already locked out or offline
  if (!supabase || !navigator.onLine || !activeCashier || isLocked) return;

  const channel = supabase.channel('cashier-presence', {
    config: { 
      presence: { key: myDeviceId },
      broadcast: { ack: true } 
    },
  });

  // The function that ruthlessly kills the session
  const executeLockout = (reason) => {
    console.warn(`🔒 ${reason}`);
    setIsLocked(true);
    setActiveCashier(null);
    localStorage.removeItem('tinypos_activeCashier');
    localStorage.removeItem('tinypos_session_time');
    showAlert("Access Revoked", reason);
  };

  channel
    // 1. THE EAR: Listen for the kill command from new devices
    .on('broadcast', { event: 'force-kick' }, (payload) => {
      const { incomingCashierId, incomingDeviceId } = payload.payload;
      
      // If the login is for my profile, but from a different device -> Lockout!
      if (incomingCashierId === activeCashierRef.current?.id && incomingDeviceId !== myDeviceId) {
        executeLockout("Session terminated by a new login on another device.");
      }
    })
    // 2. THE EYE: Passive tracking (optional, but good for debugging)
    .on('presence', { event: 'sync' }, () => {
      console.log("Active Devices:", Object.keys(channel.presenceState()).length);
    })
    // 3. THE WEAPON: Connect and fire!
    .subscribe((status) => { // <-- Removed 'async' here
      console.log(`Presence Status (${activeCashierRef.current?.name}):`, status);
      
      if (status === 'SUBSCRIBED') {
        
        // 1. SHOOT FIRST: Instantly fire the kick command (No 'await')
        channel.send({
          type: 'broadcast',
          event: 'force-kick',
          payload: { 
            incomingCashierId: activeCashierRef.current.id, 
            incomingDeviceId: myDeviceId 
          }
        });

        // 2. TRACK LATER: Let presence sync in the background (No 'await')
        channel.track({ 
          cashierId: activeCashierRef.current.id, 
          deviceId: myDeviceId 
        });
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}, [activeCashier?.id, isLocked, myDeviceId]);

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


    const favicon = document.querySelector("link[rel~='icon']");
    if (favicon) {
      // Use the boot logo, or fallback to the standard PWA icon if they haven't uploaded one
      favicon.href = posSettings.appBootLogo || '/icon-192.png'; 
    } 


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

    // Grab the first 3 letters of this specific device's ID
    const prefix = myDeviceId.substring(0, 3).toUpperCase();

    const newTicket = {
      id: newId,
      name: `${prefix} - #${currentNum}`,
      items: [],
      cashierId: activeCashier?.id
    };

    // 1. Save locally
    await db.active_tickets.add(newTicket);

    // 2. NEW: Push new ticket to the cloud
    if (navigator.onLine) {
      try {
        await supabase.from('active_tickets').insert([newTicket]);
      } catch (err) {
        console.error("Cloud create failed:", err);
      }
    }

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
    if (!activeTicket) {
      showAlert("No Active Order", "Please click '+ Start New Ticket' before adding items.");
      setIsModalOpen(false);
      setPendingItem(null);
      return;
    }

    const newItem = { ...item, uniqueId: Date.now() + Math.random(), selectedModifiers: modifiers };
    const updatedItems = [...activeTicket.items, newItem];

    // 1. Update locally
    await db.active_tickets.update(activeTicket.id, { items: updatedItems });

    // 2. NEW: Update cloud instantly
    if (navigator.onLine) {
      supabase.from('active_tickets').update({ items: updatedItems }).eq('id', activeTicket.id).then();
    }

    setIsModalOpen(false);
    setPendingItem(null);
  };

  const handleRemoveItem = async (itemUniqueId) => {
    if (!activeTicket) return;

    const updatedItems = activeTicket.items.filter(i => i.uniqueId !== itemUniqueId);

    // 1. Update locally
    await db.active_tickets.update(activeTicket.id, { items: updatedItems });

    // 2. NEW: Update cloud instantly
    if (navigator.onLine) {
      supabase.from('active_tickets').update({ items: updatedItems }).eq('id', activeTicket.id).then();
    }
  };

  const clearCurrentTicket = async () => {
    if (!activeTicket) return;

    const ticketIdToDelete = activeTicket.id; // Store ID before deleting

    // 1. Delete locally
    await db.active_tickets.delete(ticketIdToDelete);

    // 2. NEW: Delete from the cloud so it vanishes from the phone!
    if (navigator.onLine) {
      try {
        await supabase.from('active_tickets').delete().eq('id', ticketIdToDelete);
        console.log("Ticket deleted");
      } catch (err) {
        console.error("Cloud delete failed:", err);
      }
    }

    const remainingTickets = tickets.filter(t => t.id !== ticketIdToDelete);

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



  // --- THE ESC/POS IMAGE ENCODER ---
  const convertLogoToESCPOS = async (base64Data) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Data;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 58mm printers have a max printable width of exactly 384 dots (pixels).
        // Let's cap the logo at 300px so it has a nice visual margin.
        const MAX_WIDTH = 300;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        // CRITICAL: ESC/POS raster images MUST have a width that is a multiple of 8.
        width = Math.ceil(width / 8) * 8;

        canvas.width = width;
        canvas.height = height;

        // 1. Fill with white first! (Otherwise transparent PNGs print as giant solid black squares)
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // 2. Draw the logo
        ctx.drawImage(img, 0, 0, width, height);

        // 3. Extract the raw pixel data
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        // 4. Calculate ESC/POS parameters
        const widthBytes = width / 8;
        const xL = widthBytes % 256;
        const xH = Math.floor(widthBytes / 256);
        const yL = height % 256;
        const yH = Math.floor(height / 256);

        // The ESC/POS command: GS v 0 (Print Raster Bit Image)
        const header = [0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH];
        const imageBytes = [];

        let currentByte = 0;
        let bitIndex = 0;

        // 5. Loop through every single pixel (RGBA) and convert to 1-bit monochrome
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          // Calculate brightness. If it's dark, it becomes a black dot.
          const isBlack = (a > 128) && ((r * 0.299 + g * 0.587 + b * 0.114) < 128);

          if (isBlack) {
            currentByte |= (1 << (7 - bitIndex)); // Turn on the bit
          }

          bitIndex++;

          // Once we have 8 bits, push the completed byte to our array
          if (bitIndex === 8) {
            imageBytes.push(currentByte);
            currentByte = 0;
            bitIndex = 0;
          }
        }

        resolve(new Uint8Array([...header, ...imageBytes]));
      };
    });
  };

  const printRawReceipt = async (ticket, total) => {
    try {
      const encoder = new TextEncoder();
      let receiptBuffer = []; // We store EVERYTHING here first

      // --- ESC/POS COMMANDS ---
      const ESC_INIT = [0x1B, 0x40];
      const ESC_ALIGN_LEFT = [0x1B, 0x61, 0x00];
      const ESC_ALIGN_CENTER = [0x1B, 0x61, 0x01];
      const ESC_BOLD_ON = [0x1B, 0x45, 0x01];
      const ESC_BOLD_OFF = [0x1B, 0x45, 0x00];

      // --- HELPERS ---
      const pushCommand = (cmdArray) => receiptBuffer.push(...cmdArray);

      const stripEmojis = (str) => {
        if (!str) return "";
        return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
      };

      const pushText = (text) => receiptBuffer.push(...encoder.encode(text));

      const pushRow = (leftText, rightText) => {
        const cleanLeft = stripEmojis(leftText);
        const spacesNeeded = Math.max(1, 32 - cleanLeft.length - rightText.length);
        pushText(`${cleanLeft}${' '.repeat(spacesNeeded)}${rightText}\n`);
      };

      // 1. GRAB SETTINGS
      const receiptSettings = menuData?.receiptSettings || {
        header: "TINY COFFEE BAR",
        subheader: "Puebla, Mexico",
        footer: "Thank you for your visit!",
        enableTaxBreakdown: false,
        taxRate: 16,
        logo: null
      };

      // ==========================================
      // --- BUILD THE RECEIPT ---
      // ==========================================
      pushCommand(ESC_INIT);
      pushCommand(ESC_ALIGN_CENTER);

      // --- LOGO INJECTION ---
      if (receiptSettings.logo) {
        try {
          const logoBytes = await convertLogoToESCPOS(receiptSettings.logo);
          // Convert the Uint8Array to a normal array so we can push it into the buffer
          pushCommand(Array.from(logoBytes));
          pushText("\n");
        } catch (e) {
          console.warn("Could not process logo:", e);
        }
      }

      // --- HEADER ---
      pushCommand(ESC_BOLD_ON);
      pushText(`${receiptSettings.header}\n`);
      pushCommand(ESC_BOLD_OFF);
      pushText(`${receiptSettings.subheader}\n`);
      pushText("--------------------------------\n");
      pushText(`Ticket: ${ticket.name}\n`);
      pushText(`Date: ${new Date().toLocaleString()}\n`);
      pushText("--------------------------------\n");

      pushCommand(ESC_ALIGN_LEFT);

      let rawSubtotal = 0;

      // --- ITEMS ---
      for (const item of ticket.items) {
        let itemTotal = item.basePrice;
        item.selectedModifiers.forEach(mod => itemTotal += mod.price);
        rawSubtotal += itemTotal;

        pushRow(item.name, `$${item.basePrice.toFixed(2)}`);

        for (const mod of item.selectedModifiers) {
          const modPrice = mod.price > 0 ? `+$${mod.price.toFixed(2)}` : "";
          pushRow(`  + ${mod.name}`, modPrice);
        }
      }

      pushText("--------------------------------\n");

      // --- DISCOUNTS ---
      if (rawSubtotal > total) {
        pushRow("Subtotal", `$${rawSubtotal.toFixed(2)}`);
        const discountAmt = rawSubtotal - total;
        pushRow("Discount", `-$${discountAmt.toFixed(2)}`);
        pushText("--------------------------------\n");
      }

      // --- SAT TAX EXTRACTION ---
      if (receiptSettings.enableTaxBreakdown) {
        const taxRate = receiptSettings.taxRate || 16;
        const taxDecimal = taxRate / 100;
        const baseSubtotal = total / (1 + taxDecimal);
        const extractedTax = total - baseSubtotal;

        pushRow("Subtotal ", `$${baseSubtotal.toFixed(2)}`);
        pushRow(`IVA (${taxRate}%)`, `$${extractedTax.toFixed(2)}`);
        pushText("--------------------------------\n");
      }

      // --- GRAND TOTAL ---
      pushCommand(ESC_ALIGN_CENTER);
      pushCommand(ESC_BOLD_ON);
      pushText(`TOTAL: $${total.toFixed(2)}\n`);
      pushCommand(ESC_BOLD_OFF);
      pushText("--------------------------------\n");
      pushText(`${receiptSettings.footer}\n`);
      pushText("\n\n\n"); // Feed paper

      // ==========================================
      // --- ROUTING: WHERE DOES THE BUFFER GO? ---
      // ==========================================
      const finalBytes = new Uint8Array(receiptBuffer);
      const isAndroid = /Android/i.test(navigator.userAgent);

      if (isAndroid) {
        // --- PATH A: ANDROID (RAWBT BRIDGE) ---
        let binary = '';
        for (let i = 0; i < finalBytes.byteLength; i++) {
          binary += String.fromCharCode(finalBytes[i]);
        }
        const base64Data = window.btoa(binary);

        const rawbtUrl = `rawbt:base64,${base64Data}`;

        const link = document.createElement('a');
        link.href = rawbtUrl;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        setTimeout(() => document.body.removeChild(link), 100);

      } else if (navigator.serial) {
        // --- PATH B: WINDOWS / MAC LAPTOP (WEB SERIAL) ---
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        const writer = port.writable.getWriter();
        await writer.write(finalBytes);
        writer.releaseLock();
        await port.close();

      } else {
        showAlert("Unsupported Device", "Direct printing is only supported on Windows/Mac via Chrome, or Android via the RawBT app.");
      }

    } catch (err) {
      console.error("Printing failed:", err);
      showAlert("Printer Error", "Could not connect to the printer.");
    }
  };

  // --- WHATSAPP RECEIPT LOGIC ---
  const sendFinalMessage = (phone, loyaltyData) => {
    if (!activeTicket) return;

    // Grab the receipt settings from the cloud (with safe fallbacks)
    const receiptSettings = menuData?.receiptSettings || {
      header: posSettings.name || 'TinyPOS',
      subheader: '',
      footer: 'Thank you for your visit! ✨',
      enableTaxBreakdown: false,
      taxRate: 16
    };

    // 1. Build Receipt Header & Subheader
    let message = `☕ *${receiptSettings.header}*\n`;
    if (receiptSettings.subheader) {
      message += `${receiptSettings.subheader}\n`;
    }
    message += `--------------------------\n`;
    message += `Order: ${activeTicket.name}\n`;
    message += `Date: ${new Date().toLocaleString()}\n`;
    message += `--------------------------\n`;

    // 2. Build Items List
    activeTicket.items.forEach(item => {
      message += `• ${item.name} - $${item.basePrice.toFixed(2)}\n`;
      if (item.selectedModifiers && item.selectedModifiers.length > 0) {
        item.selectedModifiers.forEach(mod => {
          message += `  + ${mod.name} ($${mod.price.toFixed(2)})\n`;
        });
      }
    });

    message += `--------------------------\n`;

    // 3. Build Tax Breakdown (If Enabled)
    if (receiptSettings.enableTaxBreakdown) {
      const taxRate = receiptSettings.taxRate || 16;
      const taxDecimal = taxRate / 100;
      const baseSubtotal = cartTotal / (1 + taxDecimal);
      const extractedTax = cartTotal - baseSubtotal;

      message += `Subtotal: $${baseSubtotal.toFixed(2)}\n`;
      message += `IVA (${taxRate}%): $${extractedTax.toFixed(2)}\n`;
    }

    // 4. Grand Total
    message += `*TOTAL: $${cartTotal.toFixed(2)}*\n`;

    // 5. Loyalty Status
    if (loyaltyData) {
      message += `\n🌟 *Loyalty Status*\n`;
      message += `Visits: ${loyaltyData.visits} / ${loyaltyData.target}\n`;
      if (loyaltyData.isRewardReady) {
        message += `🎉 REWARD READY: ${loyaltyData.reward}!\n`;
      } else {
        message += `Next Reward: ${loyaltyData.target - (loyaltyData.visits % loyaltyData.target)} more visits!\n`;
      }
    }

    // 6. Custom Footer
    message += `\n${receiptSettings.footer}`;

    // --- WHATSAPP ROUTING LOGIC ---
    const encodedMessage = encodeURIComponent(message);
    const targetPhone = `52${phone}`; // MX country code

    // Detect if the device is mobile (Phone/Tablet) or Desktop
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Route to native app on mobile, or web.whatsapp on PC
    const whatsappUrl = isMobile 
      ? `whatsapp://send?phone=${targetPhone}&text=${encodedMessage}`
      : `https://web.whatsapp.com/send?phone=${targetPhone}&text=${encodedMessage}`;

    // Safely execute routing
    if (isMobile) {
      window.location.href = whatsappUrl;
    } else {
      window.open(whatsappUrl, '_blank');
    }
    
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

    // --- 1. PREPARE THE DATA ---
    const finalizedSale = { ...currentSale, created_at: new Date().toISOString(), status: 'completed' };
    const inventoryLogsToPush = [];

    try {
      // Immediately save to local Dexie so it shows up in your history instantly
      await db.sales.add(finalizedSale);

      // --- THE FIX: ALWAYS FETCH LOCAL INVENTORY FIRST (Lightning Fast & Works Offline) ---
      const currentInventory = await db.inventory.toArray();
      const timestamp = finalizedSale.created_at;

      // --- 2. UPGRADED HYBRID INVENTORY DEDUCTION ENGINE ---
      for (const item of activeTicket.items) {
        
        // ==========================================
        // A. STANDARD ITEMS (Make-to-Stock)
        // ==========================================
        if (item.inventoryMode === "standard" && item.linkedWarehouseId) {
          const warehouseItem = currentInventory.find(inv => String(inv.id) === String(item.linkedWarehouseId));
          
          if (warehouseItem) {
            inventoryLogsToPush.push({ item_name: warehouseItem.name, qty_deducted: 1, deduction_type: "sale", created_at: timestamp, ticket_id: activeTicket.id });

            // 1. INSTANT LOCAL UPDATE
            const newStock = warehouseItem.current_stock - 1;
            await db.inventory.update(warehouseItem.id, { current_stock: newStock });
            warehouseItem.current_stock = newStock; // Update loop cache

            // 2. BACKGROUND CLOUD UPDATE (No 'await' - does not block the checkout!)
            if (navigator.onLine) supabase.from('inventory').update({ current_stock: newStock }).eq('id', warehouseItem.id).then();
          }

          // Process Additions on Standard Items
          if (item.selectedModifiers && item.selectedModifiers.length > 0) {
            for (const mod of item.selectedModifiers) {
              if (mod.deductionTarget && !mod.substitutionTarget) {
                inventoryLogsToPush.push({ item_name: mod.deductionTarget, qty_deducted: 1, deduction_type: "sale", created_at: timestamp, ticket_id: activeTicket.id });
                
                const modItem = currentInventory.find(inv => inv.name === mod.deductionTarget);
                if (modItem) {
                  const newModStock = modItem.current_stock - 1;
                  await db.inventory.update(modItem.id, { current_stock: newModStock }); // Instant local update
                  modItem.current_stock = newModStock; 
                  if (navigator.onLine) supabase.from('inventory').update({ current_stock: newModStock }).eq('id', modItem.id).then();
                }
              }
            }
          }
        } 
        
        // ==========================================
        // B. RECIPE ITEMS (Make-to-Order)
        // ==========================================
        else if (item.inventoryMode === "recipe" && item.linkedRecipeId) {
          const recipe = recipes.find(r => String(r.id) === String(item.linkedRecipeId));

          if (recipe && recipe.ingredients) {
            let cartBOM = recipe.ingredients.map(ing => ({ item_name: ing.name, qty: parseFloat(ing.qty) || 0 }));

            if (item.selectedModifiers && item.selectedModifiers.length > 0) {
              item.selectedModifiers.forEach(mod => {
                if (mod.deductionTarget && mod.substitutionTarget) {
                  const targetName = mod.substitutionTarget.trim().toLowerCase();
                  const baseIndex = cartBOM.findIndex(ing => ing.item_name.trim().toLowerCase() === targetName);
                  if (baseIndex !== -1) {
                    const baseQty = cartBOM[baseIndex].qty;
                    cartBOM.splice(baseIndex, 1);
                    cartBOM.push({ item_name: mod.deductionTarget, qty: baseQty });
                  } else {
                    cartBOM.push({ item_name: mod.deductionTarget, qty: 1 });
                  }
                } else if (mod.deductionTarget && !mod.substitutionTarget) {
                  cartBOM.push({ item_name: mod.deductionTarget, qty: 1 });
                }
              });
            }

            for (const ing of cartBOM) {
              if (ing.qty > 0) {
                inventoryLogsToPush.push({ item_name: ing.item_name, qty_deducted: ing.qty, deduction_type: "sale", created_at: timestamp, ticket_id: activeTicket.id });

                const whItem = currentInventory.find(inv => inv.name === ing.item_name);
                if (whItem) {
                  const newStock = whItem.current_stock - ing.qty;
                  
                  // 1. INSTANT LOCAL UPDATE
                  await db.inventory.update(whItem.id, { current_stock: newStock });
                  whItem.current_stock = newStock; // Update loop cache
                  
                  // 2. BACKGROUND CLOUD UPDATE
                  if (navigator.onLine) supabase.from('inventory').update({ current_stock: newStock }).eq('id', whItem.id).then();
                }
              }
            }
          }
        }
      }

      // --- 3. CLOUD SYNC ATTEMPT ---
      if (!navigator.onLine) throw new Error("Device is offline");

      // Strip the local Dexie ID from the sale
      const { id: localId, ...cleanSale } = finalizedSale;
      
      const { error: salesError } = await supabase.from('sales').insert([cleanSale]);
      if (salesError) throw salesError;

      if (inventoryLogsToPush.length > 0) {
        const { error: invError } = await supabase.from('inventory_logs').insert(inventoryLogsToPush);
        if (invError) throw invError;
      }

      console.log("SALE COMPLETE & SAVED TO CLOUD INSTANTLY");

    } catch (error) {
      console.warn("Cloud save failed. Moving to offline queue.", error.message);
      
      // THE FIX: We must delete the 'id' property that Dexie secretly added to finalizedSale
      // so it doesn't trigger a "Key Already Exists" error in the sync queue!
      const { id: generatedId, ...safeOfflineSale } = finalizedSale;
      
      await db.syncQueue.add(safeOfflineSale);

      if (inventoryLogsToPush.length > 0) {
        await db.inventory_logs.bulkPut(inventoryLogsToPush);
      }
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
    return <BootScreen posSettings={posSettings} logo={posSettings.appBootLogo} />;
  }

  // --- THE UPGRADED LOCK & PIN ENGINE ---
  if (isLocked) {
    // If no one is selected, show your standard user list (LockScreen)
    if (!selectedProfile) {
      return <LockScreen posSettings={posSettings} cashiers={cashiers} selectedProfile={selectedProfile} setSelectedProfile={setSelectedProfile} pinAttempt={pinAttempt} setPinAttempt={setPinAttempt} handlePinKeyDown={handlePinKeyDown} phoneError={phoneError} handleUnlockSubmit={handleUnlockSubmit} />;
    }

    // If a cashier IS selected, show the new standardized PIN Pad
    return (
      <div style={{ display: 'flex', height: '100dvh', width: '100vw', backgroundColor: 'var(--bg-main)', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui', color: 'var(--text-main)' }}>
        <div className={`fade-in ${phoneError ? 'shake' : ''}`} style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: '16px', width: '350px', boxShadow: '0 15px 35px rgba(0,0,0,0.2)', textAlign: 'center' }}>
          
          <div style={{ width: '64px', height: '64px', borderRadius: '32px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', margin: '0 auto 16px' }}>
            {selectedProfile.name.charAt(0)}
          </div>
          <h2 style={{ margin: '0 0 5px 0' }}>Hi, {selectedProfile.name}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Enter your 4-digit PIN</p>
          
          <div style={{ 
            fontSize: '2.5rem', letterSpacing: '16px', marginBottom: '24px', fontWeight: 'bold', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-main)', borderRadius: '12px', border: `1px solid var(--border)`, color: 'var(--text-main)' 
          }}>
            {pinAttempt.replace(/./g, '●') || <span style={{opacity: 0.2, letterSpacing: 'normal', fontSize: '1rem'}}>PIN REQUIRED</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => setPinAttempt(prev => prev.length < 4 ? prev + num : prev)} style={{ padding: '20px', fontSize: '1.5rem', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold' }}>{num}</button>
            ))}
            <button onClick={() => { setSelectedProfile(null); setPinAttempt(''); }} style={{ padding: '20px', fontSize: '1rem', background: 'rgba(231, 76, 60, 0.1)', border: 'none', borderRadius: '10px', cursor: 'pointer', color: '#e74c3c', fontWeight: 'bold' }}>BACK</button>
            <button onClick={() => setPinAttempt(prev => prev.length < 4 ? prev + 0 : prev)} style={{ padding: '20px', fontSize: '1.5rem', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold' }}>0</button>
            <button onClick={() => setPinAttempt(prev => prev.slice(0, -1))} style={{ padding: '20px', fontSize: '1.5rem', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold' }}>⌫</button>
          </div>

          <button 
            onClick={handleUnlockSubmit}
            disabled={pinAttempt.length !== 4}
            style={{ width: '100%', padding: '18px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2rem', opacity: pinAttempt.length === 4 ? 1 : 0.5 }}
          >
            Login
          </button>
        </div>
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

  // --- MOUSE WHEEL HORIZONTAL SCROLL HELPERS ---
  const handleWheelScroll = (e) => {
    // If the user scrolls the wheel vertically, move the container horizontally
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  // Bundle global state for the context wormhole
  const posState = {
    cartTotal, activeTicket, menuData, posSettings, activeCashier, 
    isCurrentlyOffline, totalOfflineRecords, shiftOrders, shiftExpenses, tickets, 
    showAlert, showConfirm, requirePin, handleItemClick, setIsLocked, navigate,
    activeTicketId, setActiveTicketId, visibleTickets, cartSubtotal, 
    autoDiscountAmount, activeAutoRuleName, manualDiscountAmount,
    handleNewTicket, handleWheelScroll, handleRemoveItem, 
    handleOpenCheckout, handleCancelTicket, printRawReceipt,
    
    // --- NEW: ModifierModal Data & Functions ---
    pendingItem, 
    handleToggleModifier, 
    handleTextModifierChange, 
    addToTicket
  };

  return (
    <PosContext.Provider value={posState}>
    <div className="pos-container">
      <MenuArea 
        activeCategory={activeCategory} 
        setActiveCategory={setActiveCategory} 
        isMobileMenuOpen={isMobileMenuOpen} 
        setIsMobileMenuOpen={setIsMobileMenuOpen} 
        setIsSyncModalOpen={setIsSyncModalOpen} 
        setIsExpenseModalOpen={setIsExpenseModalOpen} 
        setIsCorteModalOpen={setIsCorteModalOpen} 
      />

      <TicketArea 
        isActionSheetOpen={isActionSheetOpen} 
        setIsActionSheetOpen={setIsActionSheetOpen} 
        setIsDiscountModalOpen={setIsDiscountModalOpen} 
        setLoyaltyModal={setLoyaltyModal} 
      />

      <ModifierModal 
        isModalOpen={isModalOpen} 
        setIsModalOpen={setIsModalOpen} 
      />

      <CheckoutModal isCheckoutModalOpen={isCheckoutModalOpen} splitPayments={splitPayments} splitMode={splitMode} setSplitMode={setSplitMode} nWays={nWays} setNWays={setNWays} customVal={customVal} setCustomVal={setCustomVal} paidProductIds={paidProductIds} handlePartialPayment={handlePartialPayment} handleSavePartialPayments={handleSavePartialPayments} handleVoidPartialPayments={handleVoidPartialPayments} handleCancelCheckout={handleCancelCheckout} />

      <Dialog uiDialog={uiDialog} closeDialog={closeDialog} />

      <LoyaltyModal loyaltyModal={loyaltyModal} setLoyaltyModal={setLoyaltyModal} menuData={menuData} handleCheckLoyalty={handleCheckLoyalty} handleGuestReceipt={handleGuestReceipt} phoneError={phoneError} sendFinalMessage={sendFinalMessage} />

      <FlyingReceipt successTicket={successTicket} />

      <ExpenseModal isExpenseModalOpen={isExpenseModalOpen} setIsExpenseModalOpen={setIsExpenseModalOpen} expenseForm={expenseForm} setExpenseForm={setExpenseForm} handleSaveExpense={handleSaveExpense} />

      <CorteModal isCorteModalOpen={isCorteModalOpen} setIsCorteModalOpen={setIsCorteModalOpen} shiftCashSales={shiftCashSales} shiftCardSales={shiftCardSales} shiftTransferSales={shiftTransferSales} shiftTotalExpenses={shiftTotalExpenses} expectedCash={expectedCash} countedCash={countedCash} setCountedCash={setCountedCash} handleProcessCorte={handleProcessCorte} />

      <PinChallengeModal pinChallenge={pinChallenge} setPinChallenge={setPinChallenge} challengePinAttempt={challengePinAttempt} setChallengePinAttempt={setChallengePinAttempt} handleChallengeKeyDown={handleChallengeKeyDown} challengeError={challengeError} handleChallengeSubmit={handleChallengeSubmit} />

      <SyncStatusModal isSyncModalOpen={isSyncModalOpen} setIsSyncModalOpen={setIsSyncModalOpen} isCurrentlyOffline={isCurrentlyOffline} syncQueue={syncQueue} expenseQueue={expenseQueue} waQueue={waQueue} />

      <DiscountModal isDiscountModalOpen={isDiscountModalOpen} setIsDiscountModalOpen={setIsDiscountModalOpen} discountForm={discountForm} setDiscountForm={setDiscountForm} handleApplyDiscount={handleApplyDiscount} handleRemoveDiscount={handleRemoveDiscount} activeTicket={activeTicket} />

      </div>
    </PosContext.Provider>
  );
}

export default Register;