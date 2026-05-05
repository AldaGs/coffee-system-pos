import { Icon } from '@iconify/react';
import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './App.css';
import { PosContext } from './utils/PosContext';
import { useDialog } from './hooks/useDialog';
import { useTheme } from './hooks/useTheme';
import { useAuthStore } from './store/useAuthStore';
import { useMenuStore } from './store/useMenuStore';
import { useCartStore } from './store/useCartStore';
import { processCheckout } from './services/checkoutService';
import { attemptBackgroundSync } from './services/syncService';
import { logActivity } from './services/activityService';
import { numeroALetras } from './utils/numeroALetras';
import { useTranslation } from './hooks/useTranslation';
import { calculateExpectedCash, calculateTaxBreakdown } from './utils/posMath';
import SharedPinPad from './components/shared/SharedPinPad';

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
import TicketImage from './components/register/TicketImage';
import { printRawReceipt as printRawReceiptUtil, sendFinalMessage as sendFinalMessageUtil, saveTicketAsPNG as saveTicketAsPNGUtil } from './utils/sharingUtils';


const getOrCreateDeviceId = () => {
  let id = sessionStorage.getItem('tinypos_device_id') || localStorage.getItem('tinypos_device_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('tinypos_device_id', id);
  }
  sessionStorage.setItem('tinypos_device_id', id);
  return id;
};

function Register() {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();

  // --- ZUSTAND GLOBAL STORES ---
  const { isLocked, setIsLocked, activeCashier, setActiveCashier, sessionTime, setSessionTime, logout } = useAuthStore();
  const { menuData, setMenuData, recipes, setRecipes, activeCategory, setActiveCategory, isLoading, setIsLoading, getPosSettings } = useMenuStore();
  const {
    activeTicketId, setActiveTicketId, isCheckoutModalOpen, setIsCheckoutModalOpen,
    splitMode, setSplitMode, splitPayments, setSplitPayments, nWays, setNWays,
    customVal, setCustomVal, paidProductIds, setPaidProductIds, resetCheckoutState,
    tipAmount, setTipAmount, tipPercentage, setTipPercentage
  } = useCartStore();

  const [myDeviceId] = useState(getOrCreateDeviceId);

  const posSettings = getPosSettings(); // Dynamically grabs our fallback-safe settings!

  const { showAlert, showConfirm, showPrompt } = useDialog();
  const { updateTheme } = useTheme();
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Refs to prevent Realtime re-subscription storms
  const activeTicketIdRef = useRef(null);
  const activeCashierRef = useRef(null);
  const sessionTimeRef = useRef(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);
  const [successTicket, setSuccessTicket] = useState(null);
  const tickets = useLiveQuery(() => db.active_tickets.toArray(), []) || [];

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

        // SAFE ACTIVE CATEGORY ASSIGNMENT
        const safeCategories = menuResp.menu_data?.categories || {};
        const categoryNames = Object.keys(safeCategories);
        setActiveCategory(categoryNames.length > 0 ? categoryNames[0] : null);

        localStorage.setItem('tinypos_cached_menu', JSON.stringify(menuResp.menu_data));
        localStorage.setItem('tinypos_cached_recipes', JSON.stringify(recipeResp));

      } catch {
        console.warn("Cloud fetch failed. Searching for local backup...");
        const cachedMenu = localStorage.getItem('tinypos_cached_menu');
        const cachedRecipes = localStorage.getItem('tinypos_cached_recipes');

        if (cachedMenu) {
          const parsedMenu = JSON.parse(cachedMenu);
          setMenuData(parsedMenu);

          // SAFE ACTIVE CATEGORY ASSIGNMENT FOR CACHE
          const safeCachedCategories = parsedMenu?.categories || {};
          const cachedCategoryNames = Object.keys(safeCachedCategories);
          setActiveCategory(cachedCategoryNames.length > 0 ? cachedCategoryNames[0] : null);
        }
        if (cachedRecipes) {
          setRecipes(JSON.parse(cachedRecipes));
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchMenuAndRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            if (payload.new.last_modified_by === myDeviceId) {
              return;
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      return showAlert(t('expense.errMissing'), t('expense.errDesc'));
    }

    const expenseAmount = parseFloat(expenseForm.amount);

    // 1. Build the local record
    const newExpense = {
      // eslint-disable-next-line react-hooks/purity
      id: Date.now(),
      amount: expenseAmount,
      reason: expenseForm.reason,
      timestamp: new Date().toISOString(),
      cashierId: activeCashier?.id || 'unknown',
      cashierName: activeCashier?.name || t('expense.unknownCashier')
    };

    // 2. Build the cloud record (For when you create the 'expenses' table in Supabase)
    const cloudExpense = {
      amount: expenseAmount,
      reason: expenseForm.reason,
      category: expenseForm.category || 'General',
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
    
    // LOG ACTIVITY
    logActivity('Gasto (Expense)', `Registró un gasto de $${expenseAmount.toFixed(2)}: ${expenseForm.reason}`, { category: expenseForm.category, amount: expenseAmount });

    setIsExpenseModalOpen(false);
    setExpenseForm({ amount: '', reason: '', category: 'General' });
    showAlert(t('expense.success'), `${t('expense.successDesc')} $${expenseAmount.toFixed(2)}:\n${expenseForm.reason}`);
  };

  // --- DISCOUNT STATE & LOGIC ---
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [discountForm, setDiscountForm] = useState({ type: 'percentage', value: '' });

  const handleApplyDiscount = async () => {
    const val = parseFloat(discountForm.value);
    if (isNaN(val) || val <= 0) return showAlert("Invalid Discount", "Please enter a valid amount.");

    if (activeTicket) {
      await db.active_tickets.update(activeTicket.id, { discount: { type: discountForm.type, value: val } });
      
      // LOG ACTIVITY
      logActivity('Discount Applied', `A ${val}${discountForm.type === 'percentage' ? '%' : '$'} discount was applied to ticket: ${activeTicket.name}`);
    }
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
    // Wrap our service in a function so we can pass the React State modifiers
    const runSync = () => attemptBackgroundSync(expenseQueue, () => setExpenseQueue([]));

    // Listen for the internet coming back online
    window.addEventListener('online', runSync);

    // And try automatically every 60 seconds
    const syncInterval = setInterval(runSync, 60000);

    return () => {
      window.removeEventListener('online', runSync);
      clearInterval(syncInterval);
    };
  }, [expenseQueue]);

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
      return showAlert(t('inv.alertMissing'), t('inv.alertMissingDesc1')); // Reusing inventory strings or add new ones
    }

    // Determine the status string
    let statusMsg = t('corte.balanced');
    if (difference > 0) statusMsg = `${t('corte.over')} $${difference.toFixed(2)} ⬆️`;
    if (difference < 0) statusMsg = `${t('corte.short')} $${Math.abs(difference).toFixed(2)} ⬇️`;

    const confirmMessage = `
      ${t('corte.summary')}:
      ${t('analytics.sales')}: ${shiftOrders.length}
      ${t('corte.gross')}: $${shiftTotalRevenue.toFixed(2)}
      ${t('corte.expenses')}: $${shiftTotalExpenses.toFixed(2)}

      ${t('corte.cashRecon')}:
      ${t('corte.expected')}: $${expectedCash.toFixed(2)}
      ${t('corte.counted')}: $${actualCash.toFixed(2)}
      ${t('corte.result')}: ${statusMsg}

      ${t('corte.closeConfirm')}`;

    showConfirm(t('corte.confirmTitle'), confirmMessage, () => {
      // 1. Mark the current exact time as the new baseline
      const newTimestamp = new Date().toISOString();
      setLastCorteTimestamp(newTimestamp);
      localStorage.setItem('tinypos_last_corte', newTimestamp);

      // 2. Reset the modal
      setIsCorteModalOpen(false);
      setCountedCash("");

      // LOG ACTIVITY
      logActivity('Corte de Caja', `Turno cerrado con ${statusMsg}. Efectivo esperado: $${expectedCash.toFixed(2)}, contado: $${actualCash.toFixed(2)}`, { expectedCash, actualCash, difference });

      showAlert(t('corte.successTitle'), t('corte.successDesc'));
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNextOrderNum(1);
      setLastResetDate(today.toDateString());
      localStorage.setItem('tinypos_nextOrderNum', 1);
      localStorage.setItem('tinypos_lastResetDate', today.toDateString());
    }
    // FIX: Update the dependency array here too
  }, [menuData?.posSettings?.orderResetPolicy, lastResetDate]);

  // --- BOTTOM SHEET STATE ---
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  // --- DEVICE IDENTITY & SESSION ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- SECURITY PIN CHALLENGE STATE ---
  const [pinChallenge, setPinChallenge] = useState({ isOpen: false, title: "", onAuthorized: null });
  const [challengePinAttempt, setChallengePinAttempt] = useState('');
  const [challengeError, setChallengeError] = useState(false);

  // Helper function to intercept high-privilege actions
  const requirePin = (title, onAuthorizedAction) => {
    setPinChallenge({ isOpen: true, title, onAuthorized: onAuthorizedAction });
  };

  const handleChallengeSubmit = () => {
    // 1. Is it the currently logged-in cashier's PIN?
    const isCashierMatch = challengePinAttempt === activeCashier?.pin;

    // 2. NEW: Does this PIN belong to ANY profile where isAdmin is true?
    // This completely ignores the trapped posSettings.pinCode!
    const isStaffAdmin = (menuData?.cashiers || []).some(
      cashier => cashier.isAdmin === true && cashier.pin === challengePinAttempt
    );

    if (isCashierMatch || isStaffAdmin) {
      // Success: Clear the challenge and run the intercepted action
      setChallengePinAttempt('');
      setPinChallenge({ isOpen: false, title: "", onAuthorized: null });
      if (pinChallenge.onAuthorized) pinChallenge.onAuthorized();
    } else {
      // Fail: Trigger the shake animation
      setChallengeError(true);
      setTimeout(() => setChallengeError(false), 500);
      setChallengePinAttempt('');
    }
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

  // Keep refs in sync (moved here to ensure state is initialized)
  useEffect(() => { activeTicketIdRef.current = activeTicketId; }, [activeTicketId]);
  useEffect(() => { activeCashierRef.current = activeCashier; }, [activeCashier]);
  useEffect(() => { sessionTimeRef.current = sessionTime; }, [sessionTime]);


  // Lock Screen temporary states
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [pinAttempt, setPinAttempt] = useState('');

  // --- UNLOCK LOGIC & ENTER KEY ---
  const handleUnlockSubmit = () => {
    if (!selectedProfile) return;

    // 1. Does it match the selected profile's own PIN?
    const isProfileMatch = pinAttempt === selectedProfile.pin;

    // 2. Does it match ANY profile marked as isAdmin?
    const isStaffAdmin = (menuData?.cashiers || []).some(
      c => c.isAdmin === true && c.pin === pinAttempt
    );

    // 3. Does it match the Master PIN in General Settings?
    const isMasterPin = pinAttempt === posSettings.pinCode;

    if (isProfileMatch || isStaffAdmin || isMasterPin) {
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
      const myTickets = tickets.filter(t => t.cashier_id === activeCashier.id);

      if (myTickets.length > 0) {
        // Sort them to find the newest one (highest ID)
        const newestTicket = myTickets.sort((a, b) => b.id - a.id)[0];

        // Snap the UI to that ticket immediately
        setActiveTicketId(newestTicket.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, activeCashier]); // This runs exactly once when you unlock the screen



  // --- ORDER HISTORY (ANALYTICS LEDGER) ---
  const dexieSales = useLiveQuery(() => db.sales.toArray(), []) || [];

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      logout(); // <-- This handles isLocked, activeCashier, sessionTime, AND localStorage all at once!
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCashier?.id, isLocked, myDeviceId]);

  // --- SHIFT CALCULATIONS ---
  // 1. Filter data to ONLY include things that happened after the last Corte
  const shiftOrders = dexieSales.filter(o => new Date(o.created_at) > new Date(lastCorteTimestamp));
  const shiftExpenses = expenses.filter(e => new Date(e.timestamp) > new Date(lastCorteTimestamp));

  // 2. Break down the revenue by payment method
  const calcTotalByMethod = (method) => {
    return shiftOrders.reduce((sum, o) => {
      let netSale = o.total_amount || 0;
      if (o.status === 'refunded') return sum;
      if (o.status === 'partial_refund') netSale -= (o.refund_amount || 0);

      if (o.payment_method === method) return sum + netSale;
      if (o.payment_method === 'Split' && o.splits) {
        // Find the amount for this specific split method
        const splitAmount = o.splits.filter(s => s.method === method).reduce((acc, s) => acc + s.amount, 0);
        // If there's a partial refund on a split payment, the netSale is less. 
        // We'll just subtract the refund proportionally or simply from the total if it's not a full split breakdown.
        // For simplicity, we just use the original split amounts unless it's fully refunded. 
        // (A more advanced system would track WHICH split was refunded).
        return sum + splitAmount;
      }
      return sum;
    }, 0);
  };

  const shiftCashSales = calcTotalByMethod('Cash');
  const shiftCardSales = calcTotalByMethod('Card');
  const shiftTransferSales = calcTotalByMethod('Transfer');
  
  const shiftTotalRevenue = shiftOrders.reduce((sum, o) => {
    if (o.status === 'refunded') return sum;
    let netSale = o.total_amount || 0;
    if (o.status === 'partial_refund') netSale -= (o.refund_amount || 0);
    return sum + netSale;
  }, 0);

  // 3. Sum up the expenses
  const shiftTotalExpenses = shiftExpenses.reduce((sum, e) => sum + e.amount, 0);

  // 4. Calculate Expected Cash in Drawer (Cash In - Cash Out)
  const shiftCashRefunds = shiftOrders.reduce((sum, o) => {
    if (o.status === 'refunded' || o.status === 'partial_refund') {
      if (o.payment_method === 'Cash' || (o.payment_method === 'Split' && o.splits?.some(s => s.method === 'Cash'))) {
        return sum + (o.refund_amount || 0);
      }
    }
    return sum;
  }, 0);
  const expectedCash = calculateExpectedCash(shiftCashSales, shiftCashRefunds, shiftTotalExpenses);

  // --- THEME INJECTION LOGIC ---
  useEffect(() => {
    if (posSettings) {
      updateTheme(posSettings);
    }
  }, [posSettings, updateTheme]);




  const handleNewTicket = () => {
    showPrompt(
      t('reg.promptTicketName'),
      t('reg.promptTicketNameDesc'),
      async (inputValue) => {
        const newId = Date.now();
        const currentNum = nextOrderNum; // Grab the global counter
        
        // Grab the first 3 letters of this specific device's ID
        const prefix = myDeviceId.substring(0, 3).toUpperCase();
        
        // If they provided a name, use it + the number. Otherwise use default.
        const customName = inputValue ? inputValue.trim() : '';
        const ticketName = customName ? `${prefix} - ${customName} (#${currentNum})` : `${prefix} - #${currentNum}`;

        const newTicket = {
          id: newId,
          name: ticketName,
          items: [],
          cashier_id: activeCashier?.id,
          last_modified_by: myDeviceId
        };

        // 1. Save locally
        await db.active_tickets.add(newTicket);

        // 2. Push new ticket to the cloud
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
      },
      '',
      t('reg.btnCreateTicket'),
      t('reg.btnCancel')
    );
  };

  const handleRenameTicket = () => {
    if (!activeTicket) return;
    showPrompt(
      t('reg.promptTicketName'),
      t('reg.promptTicketNameDesc'),
      async (inputValue) => {
        if (!inputValue || !inputValue.trim()) return;
        const customName = inputValue.trim();
        
        // Try to extract the original index (#X) if it exists. 
        const match = activeTicket.name.match(/\(#(\d+)\)$/);
        const match2 = activeTicket.name.match(/- #(\d+)$/);
        const currentNum = match ? match[1] : (match2 ? match2[1] : '?');

        const prefix = myDeviceId.substring(0, 3).toUpperCase();
        const newName = `${prefix} - ${customName} (#${currentNum})`;

        const updatedTicket = { ...activeTicket, name: newName };
        
        // Save locally
        await db.active_tickets.update(activeTicket.id, updatedTicket);
        
        // Push cloud
        if (navigator.onLine) {
          try {
            await supabase.from('active_tickets').update({ name: newName }).eq('id', activeTicket.id);
          } catch (err) {
            console.error("Cloud rename failed:", err);
          }
        }
      },
      '',
      t('ticket.btnRename'),
      t('reg.btnCancel')
    );
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

    // --- LOW STOCK CHECK ---
    if (recipes) {
      const recipe = recipes.find(r => r.linked_menu_item === item.id);
      if (recipe && recipe.ingredients) {
        const inventory = await db.inventory.toArray();
        const threshold = posSettings?.lowStockThreshold || 0;
        for (const ing of recipe.ingredients) {
          const invItem = inventory.find(i => i.name === ing.name);
          if (invItem && (invItem.current_stock - ing.qty) <= threshold) {
            showAlert(t('register.lowStock'), t('register.lowStockDesc').replace('{{ingredient}}', invItem.name).replace('{{qty}}', threshold));
            break; // Show only one alert per item added to avoid spamming the cashier
          }
        }
      }
    }

    const newItem = {
      ...item,
      // eslint-disable-next-line react-hooks/purity
      uniqueId: Date.now() + Math.random(),
      selectedModifiers: modifiers
    };
    const updatedItems = [...activeTicket.items, newItem];

    // 1. Update locally
    await db.active_tickets.update(activeTicket.id, { items: updatedItems });

    // 2. NEW: Update cloud instantly
    if (navigator.onLine) {
      supabase.from('active_tickets').update({
        items: updatedItems,
        last_modified_by: myDeviceId
      })
        .eq('id', activeTicket.id)
        .then();
    }

    setIsModalOpen(false);
    setPendingItem(null);
  };

  const handleUpdateItemQty = async (itemUniqueId, newQty) => {
    if (!activeTicket) return;

    const updatedItems = newQty === 0
      ? activeTicket.items.filter(i => i.uniqueId !== itemUniqueId)
      : activeTicket.items.map(i => i.uniqueId === itemUniqueId ? { ...i, qty: newQty } : i);

    await db.active_tickets.update(activeTicket.id, { items: updatedItems });

    if (navigator.onLine) {
      supabase.from('active_tickets')
        .update({ items: updatedItems, last_modified_by: myDeviceId })
        .eq('id', activeTicket.id)
        .then();
    }
  };

  const handleRemoveItem = async (itemUniqueId) => {
    if (!activeTicket) return;

    const updatedItems = activeTicket.items.filter(i => i.uniqueId !== itemUniqueId);

    // 1. Update locally
    await db.active_tickets.update(activeTicket.id, { items: updatedItems });

    // 2. NEW: Update cloud instantly
    if (navigator.onLine) {
      supabase.from('active_tickets')
        .update({
          items: updatedItems,
          last_modified_by: myDeviceId // Mark this update as yours
        })
        .eq('id', activeTicket.id)
        .then();
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
      const nextVisible = remainingTickets.find(t => posSettings.ticketVisibility === 'open' || t.cashier_id === activeCashier?.id);
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

    showConfirm(t('reg.voidTitle'), t('reg.voidDesc'), () => clearCurrentTicket());
  };



  // Utilities moved to src/utils/sharingUtils.js

  const printRawReceipt = async (ticket, total) => {
    const receiptSettings = menuData?.receiptSettings || {
      header: "TINY COFFEE BAR",
      subheader: "Puebla, Mexico",
      footer: "Thank you for your visit!",
      enableTaxBreakdown: false,
      taxRate: 16,
      logo: null
    };
    try {
      await printRawReceiptUtil(ticket, total, { t, lang, receiptSettings });
    } catch (err) {
      if (err.message !== "unsupported") {
        showAlert(t('receipt.printerErr'), t('receipt.printerErrDesc'));
      } else {
        showAlert("Unsupported Device", "Direct printing is only supported on Windows/Mac via Chrome, or Android via the RawBT app.");
      }
    }
  };

  // --- WHATSAPP RECEIPT LOGIC ---
  const sendFinalMessage = (phone, loyaltyData) => {
    const receiptSettings = menuData?.receiptSettings || {
      header: posSettings.name || 'TinyPOS',
      subheader: '',
      footer: 'Thank you for your visit! ✨',
      enableTaxBreakdown: false,
      taxRate: 16
    };
    sendFinalMessageUtil(phone, activeTicket, cartTotal, { t, lang, receiptSettings, loyaltyData });
    setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null });
  };

  const handleSaveAsPNG = async (ticket, total) => {
    const receiptSettings = menuData?.receiptSettings || {
      header: posSettings.name || 'TinyPOS',
      subheader: '',
      footer: 'Thank you for your visit! ✨',
      enableTaxBreakdown: false,
      taxRate: 16
    };
    try {
      // Capture the hidden TicketImage element
      await saveTicketAsPNGUtil('ticket-to-capture', `ticket-${ticket.name || 'pos'}.png`);
    } catch (err) {
      showAlert("Error", "Could not save PNG: " + err.message);
    }
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

  // --- 3. THE LOYALTY CHECKOUT (UPGRADED ITEM TRACKER) ---
  const handleCheckLoyalty = async () => {
    // 1. SAFE FALLBACK: Merge cloud settings with our defaults!
    const loyaltySettings = {
      isActive: true,
      visitsRequired: 10,
      rewardDescription: "tu próxima bebida GRATIS",
      targetItem: "any",
      countMode: 'per_item',
      ...(menuData?.loyaltySettings || {}) // Overwrites with cloud data if it exists
    };

    // 2. Now check our safe, merged object
    const isLoyaltyActive = loyaltySettings.isActive === true || loyaltySettings.isActive === "true";

    if (!isLoyaltyActive) {
      setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null });
      return showAlert(t('loyalty.paused'), t('loyalty.noPromos'));
    }

    const cleanPhone = loyaltyModal.phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setPhoneError(true);
      setTimeout(() => setPhoneError(false), 500);
      return;
    }

    let starsToEarn = 0;
    const targetItem = loyaltySettings.targetItem;
    const countMode = loyaltySettings.countMode;

    if (targetItem === 'any') {
      starsToEarn = 1;
    } else {
      activeTicket.items.forEach(item => {
        if (item.name === targetItem) starsToEarn += (item.qty || 1);
      });

      if (countMode === 'per_ticket' && starsToEarn > 0) {
        starsToEarn = 1;
      }
    }

    if (starsToEarn === 0) {
      setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null });
      return showAlert(t('loyalty.noQualify'), t('loyalty.noQualifyDesc'));
    }

    let currentVisits = starsToEarn;

    try {
      const { data: customer } = await supabase.from('customers').select('visits').eq('phone', cleanPhone).maybeSingle();

      if (customer) {
        currentVisits = customer.visits + starsToEarn;
        const { error: updateErr } = await supabase.from('customers').update({ visits: currentVisits }).eq('phone', cleanPhone);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from('customers').insert([{ phone: cleanPhone, visits: starsToEarn }]);
        if (insertErr) throw insertErr;
      }
    } catch (err) {
      console.error("Loyalty error:", err);
      // Let's actually show an alert if the database rejects the save!
      return showAlert("Database Error", "Could not save stars. Please check your internet or Supabase permissions.");
    }

    setLoyaltyModal(prev => ({
      ...prev,
      step: 'result',
      data: {
        visits: currentVisits,
        target: loyaltySettings.visitsRequired,
        reward: loyaltySettings.rewardDescription,
        earnedToday: starsToEarn,
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
    showConfirm(t('checkout.voidPartialTitle'), t('checkout.voidPartialDesc'), async () => {
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
    const totalDue = cartTotal + (Number(tipAmount) || 0);
    const totalPaidSoFar = newPayments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(totalDue - totalPaidSoFar) < 0.01 || totalPaidSoFar >= totalDue) {
      handleConfirmPayment(newPayments);
    }
  };

  const handleCancelCheckout = () => {
    resetCheckoutState();
  };

  // Action 2: The actual finalization of the sale
  const handleConfirmPayment = async (paymentsArray) => {

    // 1. Call our decoupled backend service
    const { masterMethodString } = await processCheckout({
      activeTicket,
      cartTotal,
      paymentsArray,
      activeCashier,
      recipes,
      tipAmount
    });

    // 2. Handle the UI Side Effects (React state, animations, resets)

    setSuccessTicket({
      name: activeTicket.name,
      items: activeTicket.items,
      total: cartTotal,
      method: masterMethodString
    });
    setTimeout(() => setSuccessTicket(null), 2500);

    handleCancelCheckout();
    clearCurrentTicket();
  };

  // --- THE NAVIGATION TRAP (Prevents Swipe-Back & Refreshing) ---
  useEffect(() => {
    // 1. Push a "dummy" state into the history stack immediately
    window.history.pushState(null, null, window.location.href);

    // 2. Intercept the browser's "Back" button or edge-swipe
    const handlePopState = () => {
      // Instantly push them forward again so they stay trapped on the Register
      window.history.pushState(null, null, window.location.href);

      // Fire your custom alert so they know what happened
      showAlert(t('reg.navWarningTitle'), t('reg.navWarningDesc'));
    };

    // 3. Intercept accidental Page Refreshes or Tab Closures
    const handleBeforeUnload = (e) => {
      // This triggers the browser's native "Are you sure you want to leave?" popup
      e.preventDefault();
      e.returnValue = '';
    };

    // Attach the listeners
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [showAlert, t]);

  // --- THE NEW BRANDED BOOT SCREEN ---
  if (isLoading) {
    return <BootScreen posSettings={posSettings} logo={posSettings.appBootLogo} loadingText={t('boot.loading')} />;
  }

  // --- THE UPGRADED LOCK & PIN ENGINE ---
  if (isLocked) {
    // If no one is selected, show your standard user list (LockScreen)
    if (!selectedProfile) {
      return <LockScreen posSettings={posSettings} cashiers={cashiers} selectedProfile={selectedProfile} setSelectedProfile={setSelectedProfile} pinAttempt={pinAttempt} setPinAttempt={setPinAttempt} handlePinKeyDown={handlePinKeyDown} phoneError={phoneError} handleUnlockSubmit={handleUnlockSubmit} />;
    }

    // If a cashier IS selected, show the new standardized PIN Pad
    return (
      <SharedPinPad
        variant="fullscreen"
        avatarText={selectedProfile?.name?.charAt(0)}
        title={`${t('reg.loginHi')} ${selectedProfile?.name}`}
        subtitle={t('reg.loginEnterPin')}
        pin={pinAttempt}
        setPin={setPinAttempt}
        error={phoneError}
        setError={setPhoneError}
        onSubmit={handleUnlockSubmit}
        onCancel={() => {
          setSelectedProfile(null);
          setPinAttempt('');
        }}
        submitText={t('reg.btnLogin')}
        submitIcon="lucide:log-in"
      />
    );
  }

  if (!menuData) return <div>{t('reg.errMissingMenu')}</div>;

  // Calculate total offline burdens for the UI badge
  const totalOfflineRecords = syncQueue.length + expenseQueue.length + waQueue.length;
  const isCurrentlyOffline = !navigator.onLine;

  // --- TICKET FILTERING ENGINE ---
  // If isolated, only show tickets that belong to the logged-in cashier
  const visibleTickets = posSettings.ticketVisibility === 'isolated'
    ? tickets.filter(t => t.cashier_id === activeCashier?.id)
    : tickets;

  // Grab the active ticket from the VISIBLE list, not the master list
  const activeTicket = visibleTickets.find(t => t.id === activeTicketId) || visibleTickets[0];

  // --- THE NEW CART MATH (With Auto & Manual Discounts) ---

  // 1. Calculate the raw subtotal of all items and modifiers
  const cartSubtotal = activeTicket ? activeTicket.items.reduce((total, item) => {
    let itemCost = item.basePrice;
    item.selectedModifiers.forEach(mod => { itemCost += mod.price; });
    const itemTotal = Math.round(itemCost * (item.qty || 1) * 100) / 100;
    return Math.round((total + itemTotal) * 100) / 100;
  }, 0) : 0;

  // 2. Scan for AUTOMATED rules (only when Advanced Mode is on)
  let autoDiscountAmount = 0;
  let activeAutoRuleName = ""; // We track this to show it on the receipt!

  if (posSettings?.isAdvancedMode) {
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
              const qty = item.qty || 1;
              let itemCost = item.basePrice;
              item.selectedModifiers.forEach(mod => { itemCost += mod.price; });

              const ruleValue = rule.type === 'percentage' ? itemCost * qty * (rule.value / 100) : rule.value * qty;
              autoDiscountAmount += ruleValue;
              activeAutoRuleName = rule.name;
            }
          });
        }
      });
    }
  }

  autoDiscountAmount = Math.min(autoDiscountAmount, cartSubtotal);

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
  const totalDiscounts = Math.min(autoDiscountAmount + manualDiscountAmount, cartSubtotal);
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
    handleNewTicket, handleRenameTicket, handleWheelScroll, handleRemoveItem, handleUpdateItemQty,
    handleOpenCheckout, handleCancelTicket, printRawReceipt, handleSaveAsPNG,

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
          isMobileCartOpen={isMobileCartOpen}
          setIsMobileCartOpen={setIsMobileCartOpen}
        />

        {/* NEW: Floating Cart Button for Mobile */}
        <button 
          className="mobile-cart-fab desktop-hidden" 
          onClick={() => setIsMobileCartOpen(true)}
        >
          <Icon icon="lucide:shopping-cart" />
          <span className="cart-badge">{activeTicket?.items?.length || 0}</span>
          <span>${cartTotal.toFixed(2)}</span>
        </button>

        <ModifierModal
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
        />

        <CheckoutModal 
          isCheckoutModalOpen={isCheckoutModalOpen} 
          splitPayments={splitPayments} 
          splitMode={splitMode} 
          setSplitMode={setSplitMode} 
          nWays={nWays} 
          setNWays={setNWays} 
          customVal={customVal} 
          setCustomVal={setCustomVal} 
          paidProductIds={paidProductIds} 
          handlePartialPayment={handlePartialPayment} 
          handleSavePartialPayments={handleSavePartialPayments} 
          handleVoidPartialPayments={handleVoidPartialPayments} 
          handleCancelCheckout={handleCancelCheckout} 
          tipAmount={tipAmount}
          setTipAmount={setTipAmount}
          tipPercentage={tipPercentage}
          setTipPercentage={setTipPercentage}
        />

        <LoyaltyModal loyaltyModal={loyaltyModal} setLoyaltyModal={setLoyaltyModal} menuData={menuData} handleCheckLoyalty={handleCheckLoyalty} handleGuestReceipt={handleGuestReceipt} phoneError={phoneError} sendFinalMessage={sendFinalMessage} isAdvancedMode={posSettings?.isAdvancedMode === true} />

        <FlyingReceipt successTicket={successTicket} />

        <ExpenseModal isExpenseModalOpen={isExpenseModalOpen} setIsExpenseModalOpen={setIsExpenseModalOpen} expenseForm={expenseForm} setExpenseForm={setExpenseForm} handleSaveExpense={handleSaveExpense} />

        <CorteModal isCorteModalOpen={isCorteModalOpen} setIsCorteModalOpen={setIsCorteModalOpen} shiftCashSales={shiftCashSales} shiftCardSales={shiftCardSales} shiftTransferSales={shiftTransferSales} shiftTotalExpenses={shiftTotalExpenses} expectedCash={expectedCash} countedCash={countedCash} setCountedCash={setCountedCash} handleProcessCorte={handleProcessCorte} />

        <PinChallengeModal
          pinChallenge={pinChallenge}
          setPinChallenge={setPinChallenge}
          challengePinAttempt={challengePinAttempt}
          setChallengePinAttempt={setChallengePinAttempt}
          challengeError={challengeError}
          setChallengeError={setChallengeError} /* <--- ADD THIS LINE! */
          handleChallengeSubmit={handleChallengeSubmit}
        />

        <SyncStatusModal isSyncModalOpen={isSyncModalOpen} setIsSyncModalOpen={setIsSyncModalOpen} isCurrentlyOffline={isCurrentlyOffline} syncQueue={syncQueue} expenseQueue={expenseQueue} waQueue={waQueue} />

        <DiscountModal isDiscountModalOpen={isDiscountModalOpen} setIsDiscountModalOpen={setIsDiscountModalOpen} discountForm={discountForm} setDiscountForm={setDiscountForm} handleApplyDiscount={handleApplyDiscount} handleRemoveDiscount={handleRemoveDiscount} activeTicket={activeTicket} />

        {/* Hidden TicketImage for PNG Capture */}
        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
           <TicketImage 
             id="ticket-to-capture"
             ticket={activeTicket} 
             total={cartTotal} 
             receiptSettings={menuData?.receiptSettings || {}} 
             lang={lang} 
             t={t} 
           />
        </div>

      </div>
    </PosContext.Provider>
  );
}

export default Register;