import { Icon } from '@iconify/react';
import { useState, useEffect, useRef, useMemo } from 'react';
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
import { attemptBackgroundSync } from './services/syncService';
import { logActivity } from './services/activityService';
import { useTranslation } from './hooks/useTranslation';
import { calculateExpectedCash } from './utils/posMath';
import { toCents, formatForDisplay, normalizeMenuPrice } from './utils/moneyUtils';
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
import ToastNotifications from './components/register/ToastNotifications';
import { usePresence } from './hooks/usePresence';
import { useCheckout } from './hooks/useCheckout';
import { useShiftCorte } from './hooks/useShiftCorte';
import { useLoyalty } from './hooks/useLoyalty';

import CorteModal from './components/register/CorteModal';
import PinChallengeModal from './components/register/PinChallengeModal';
import SyncStatusModal from './components/register/SyncStatusModal';
import DiscountModal from './components/register/DiscountModal';
import TicketImage from './components/register/TicketImage';
import { printRawReceipt as printRawReceiptUtil, sendFinalMessage as sendFinalMessageUtil, saveTicketAsPNG as saveTicketAsPNGUtil } from './utils/sharingUtils';
import { fetchAndMergeSales } from './services/salesSync';
import { fetchActiveTickets } from './services/ticketSync';
import { fromCents } from './utils/moneyUtils';


const getOrCreateDeviceId = () => {
  let id = localStorage.getItem('tinypos_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('tinypos_device_id', id);
  }
  return id;
};

// Mirror an active_ticket mutation to the cloud. If offline or the write fails,
// stash the patch on db.updateQueue so attemptBackgroundSync can replay it.
const pushActiveTicketUpdate = (ticketId, patch) => {
  const enqueue = () => db.updateQueue.add({
    type: 'active_ticket_update',
    ticket_id: ticketId,
    data: patch,
    local_id: crypto.randomUUID()
  }).catch(err => console.error('Failed to queue active_ticket_update:', err));

  if (!navigator.onLine) { enqueue(); return; }

  supabase.from('active_tickets').update(patch).eq('id', ticketId)
    .then(({ error }) => { if (error) { console.warn('Cloud active_ticket update failed, queuing:', error); enqueue(); } })
    .catch(err => { console.warn('Cloud active_ticket update threw, queuing:', err); enqueue(); });
};


function Register() {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();

  // --- ZUSTAND GLOBAL STORES ---
  const { isLocked, setIsLocked, activeCashier, setActiveCashier, sessionTime, setSessionTime } = useAuthStore();
  const { menuData, setMenuData, recipes, setRecipes, activeCategory, setActiveCategory, setIsLoading, getPosSettings, lastSyncedAt } = useMenuStore();
  const { activeTicketId, setActiveTicketId, isCheckoutModalOpen, splitMode, setSplitMode, splitPayments, nWays, setNWays, customVal, setCustomVal, paidProductIds, tipAmount, setTipAmount, tipPercentage, setTipPercentage } = useCartStore();



  const [myDeviceId] = useState(getOrCreateDeviceId);

  const posSettings = getPosSettings(); // Dynamically grabs our fallback-safe settings!

  const { showAlert, showConfirm, showPrompt } = useDialog();
  const { updateTheme } = useTheme();
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [hasValidSession, setHasValidSession] = useState(true);

  // Refs to prevent Realtime re-subscription storms
  const activeTicketIdRef = useRef(null);
  const activeCashierRef = useRef(null);
  const sessionTimeRef = useRef(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);
  const [successTicket, setSuccessTicket] = useState(null);
  const [toasts, setToasts] = useState([]);
  const showToast = (message, type = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };
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
        if (Object.keys(safeCategories).length > 0) {
          setActiveCategory(Object.keys(safeCategories)[0]);
        }

        // 3. Pull down active tickets from other devices into local Dexie
        await fetchActiveTickets();

        // 4. Pull down historical sales into local Dexie (for OrdersTab refunds)
        await fetchAndMergeSales();

        setIsLoading(false);
      } catch (err) {
        console.warn("Failed to fetch fresh menu or sync, using cache.", err);
        setIsLoading(false);
      }
    };
    fetchMenuAndRecipes();
  }, [setMenuData, setRecipes, setActiveCategory, setIsLoading]);

  // --- EXPENSES (LOCAL STORAGE BACKED) ---
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

    const expenseAmount = toCents(expenseForm.amount);

    // 1. Build the local record
    const newExpense = {
      id: crypto.randomUUID(),
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
      cashier_name: activeCashier?.name || t('expense.unknownCashierFallback')
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
    logActivity('Gasto (Expense)', `Registró un gasto de ${formatForDisplay(expenseAmount)}: ${expenseForm.reason}`, { category: expenseForm.category, amount: expenseAmount });

    setIsExpenseModalOpen(false);
    setExpenseForm({ amount: '', reason: '', category: 'General' });
    showAlert(t('expense.success'), `${t('expense.successDesc')} ${formatForDisplay(expenseAmount)}:\n${expenseForm.reason}`);
  };

  // --- DISCOUNT STATE & LOGIC ---
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [discountForm, setDiscountForm] = useState({ type: 'percentage', value: '' });

  const handleApplyDiscount = async () => {
    const val = discountForm.type === 'percentage'
      ? parseFloat(discountForm.value)
      : toCents(discountForm.value);

    if (isNaN(val) || val <= 0) return showAlert(t('discount.invalidTitle'), t('discount.invalidDesc'));

    if (activeTicket) {
      await db.active_tickets.update(activeTicket.id, { discount: { type: discountForm.type, value: val } });

      // LOG ACTIVITY
      logActivity('Discount Applied', `A ${discountForm.type === 'percentage' ? discountForm.value + '%' : formatForDisplay(val)} discount was applied to ticket: ${activeTicket.name}`);
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
    const runSync = async () => {
      const authError = await attemptBackgroundSync(expenseQueue, () => setExpenseQueue([]));
      if (authError) {
        console.warn("Auth error detected during sync background task.");
        setHasValidSession(false);
      } else {
        // If it succeeded or failed for other reasons (network), we assume session is still okay
        // unless we know for sure it's invalid.
      }
    };

    // Listen for the internet coming back online
    window.addEventListener('online', runSync);

    // And try automatically every 60 seconds
    const syncInterval = setInterval(runSync, 60000);

    // Run once immediately on mount
    runSync();

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

  const handleChallengeSubmit = async () => {
    const { verifyPin, verifyAdminPin } = useMenuStore.getState();

    try {
      // 1. Is it the currently logged-in cashier's PIN?
      const isCashierMatch = await verifyPin(activeCashier?.id, challengePinAttempt);

      // 2. NEW: Does this PIN belong to ANY profile where isAdmin is true or Master PIN?
      const isStaffAdmin = await verifyAdminPin(challengePinAttempt);

      if (isCashierMatch || isStaffAdmin) {
        // Success: Clear the challenge and run the intercepted action
        pinAttempts.current = 0;
        setChallengePinAttempt('');
        setPinChallenge({ isOpen: false, title: "", onAuthorized: null });
        if (pinChallenge.onAuthorized) pinChallenge.onAuthorized();
      } else {
        pinAttempts.current += 1;
        setChallengeError(true);
        setTimeout(() => setChallengeError(false), 500);
        setChallengePinAttempt('');
      }
    } catch (err) {
      showAlert(t('security.pinErrorTitle'), err.message);
      setChallengePinAttempt('');
    }
  };


  // --- LOYALTY & WHATSAPP STATES ---
  const [loyaltyModal, setLoyaltyModal] = useState({ isOpen: false, step: 'phone', phone: '', data: null });
  const [phoneError, setPhoneError] = useState(false); // shake on invalid phone in loyalty modal
  const [pinShake, setPinShake] = useState(false);     // shake on wrong PIN (lock + challenge)
  const pinAttempts = useRef(0);                       // monotonic wrong-PIN counter (telemetry hook)

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
  const handleUnlockSubmit = async () => {
    if (!selectedProfile) return;
    const { verifyPin, verifyAdminPin } = useMenuStore.getState();

    try {
      // 1. Does it match the selected profile's own PIN?
      const isProfileMatch = await verifyPin(selectedProfile.id, pinAttempt);

      // 2. Does it match ANY profile marked as isAdmin or Master PIN?
      const isStaffAdmin = await verifyAdminPin(pinAttempt);

      if (isProfileMatch || isStaffAdmin) {
        pinAttempts.current = 0;
        setIsLocked(false);
        setActiveCashier(selectedProfile);
        localStorage.setItem('tinypos_activeCashier', JSON.stringify(selectedProfile));

        const newSessionTime = Date.now();
        setSessionTime(newSessionTime);
        localStorage.setItem('tinypos_session_time', newSessionTime.toString());

        setPinAttempt('');
        setSelectedProfile(null);
      } else {
        pinAttempts.current += 1;
        setPinShake(true);
        setTimeout(() => setPinShake(false), 500);
        setPinAttempt('');
      }
    } catch (err) {
      showAlert(t('lock.loginErrorTitle'), err.message);
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
    let lastReset = 0;
    const THROTTLE_MS = 1000;

    const lockScreen = () => setIsLocked(true);

    const doReset = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(lockScreen, posSettings.autoLockMinutes * 60000);
    };

    // Throttled — a busy POS fires mousemove hundreds of times/min; we don't
    // need to re-arm the timeout on every pixel.
    const resetTimer = () => {
      const now = Date.now();
      if (now - lastReset < THROTTLE_MS) return;
      lastReset = now;
      doReset();
    };

    const passive = { passive: true };
    window.addEventListener('mousemove', resetTimer, passive);
    window.addEventListener('touchstart', resetTimer, passive);
    window.addEventListener('keydown', resetTimer, passive);

    doReset();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer, passive);
      window.removeEventListener('touchstart', resetTimer, passive);
      window.removeEventListener('keydown', resetTimer, passive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuData, isLocked, posSettings.autoLockMinutes]);

  // --- EXTRACTED HOOKS (Issue 3.6) ---
  usePresence(myDeviceId, showAlert);

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
        const splitAmount = o.splits.filter(s => s.method === method).reduce((acc, s) => acc + s.amount, 0);
        return sum + splitAmount;
      }
      return sum;
    }, 0);
  };

  const shiftCashSales = calcTotalByMethod('Cash');
  const shiftCardSales = calcTotalByMethod('Card');
  const shiftTransferSales = calcTotalByMethod('Transfer');

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

  const totalOfflineRecords = syncQueue.length + expenseQueue.length + waQueue.length;

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setHasValidSession(!!session);
    };
    checkSession();

    // Listen for auth changes locally too, to update the badge immediately
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasValidSession(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const isCurrentlyOffline = !navigator.onLine || !hasValidSession;

  const visibleTickets = posSettings.ticketVisibility === 'isolated'
    ? tickets.filter(t => t.cashier_id === activeCashier?.id)
    : tickets;

  const activeTicket = visibleTickets.find(t => t.id === activeTicketId) || null;

  const cartSubtotal = activeTicket ? activeTicket.items.reduce((total, item) => {
    let itemCost = normalizeMenuPrice(item.basePrice);
    item.selectedModifiers.forEach(mod => { itemCost += normalizeMenuPrice(mod.price); });
    const itemTotal = itemCost * (item.qty || 1);
    return total + itemTotal;
  }, 0) : 0;

  let autoDiscountAmount = 0;
  let autoDiscountCart = 0;
  const autoDiscountByItemUid = {};
  let activeAutoRuleName = "";

  if (posSettings?.isAdvancedMode) {
    const activeRules = menuData?.discountRules?.filter(r => r.isActive) || [];
    if (activeRules.length > 0 && cartSubtotal > 0) {
      activeRules.forEach(rule => {
        // FOR CART LEVEL RULES
        if (rule.targetType === 'cart') {
          const ruleValue = rule.type === 'percentage'
            ? cartSubtotal * (rule.value / 100)
            : normalizeMenuPrice(rule.value); // <-- Add normalizeMenuPrice here

          autoDiscountAmount += ruleValue;
          autoDiscountCart += ruleValue;
          activeAutoRuleName = rule.name;
        }
        // FOR ITEM LEVEL RULES
        else if (rule.targetType === 'item') {
          activeTicket.items.forEach(item => {
            if (item.name === rule.targetValue) {
              const qty = item.qty || 1;
              let itemCost = item.basePrice; // Already in cents
              item.selectedModifiers.forEach(mod => { itemCost += mod.price; }); // Already in cents

              const ruleValue = rule.type === 'percentage'
                ? itemCost * qty * (rule.value / 100)
                : normalizeMenuPrice(rule.value) * qty; // <-- Add normalizeMenuPrice here

              autoDiscountAmount += ruleValue;
              autoDiscountByItemUid[item.uniqueId] = (autoDiscountByItemUid[item.uniqueId] || 0) + ruleValue;
              activeAutoRuleName = rule.name;
            }
          });
        }
      });
    }
  }

  const autoUnclamped = autoDiscountAmount;
  autoDiscountAmount = Math.max(0, Math.min(autoDiscountAmount, cartSubtotal));
  // If global clamp reduced the total, scale the breakdown proportionally so the parts still sum.
  if (autoUnclamped > autoDiscountAmount && autoUnclamped > 0) {
    const scale = autoDiscountAmount / autoUnclamped;
    autoDiscountCart = Math.round(autoDiscountCart * scale);
    Object.keys(autoDiscountByItemUid).forEach(uid => {
      autoDiscountByItemUid[uid] = Math.round(autoDiscountByItemUid[uid] * scale);
    });
  }

  let manualDiscountAmount = 0;
  if (activeTicket?.discount) {
    const subtotalAfterAuto = Math.max(0, cartSubtotal - autoDiscountAmount);
    if (activeTicket.discount.type === 'percentage') {
      const discountPct = activeTicket.discount.value;
      const safePct = Math.max(0, Math.min(discountPct, 100));
      manualDiscountAmount = Math.round(subtotalAfterAuto * (safePct / 100));
    } else if (activeTicket.discount.type === 'flat') {
      const discountCents = activeTicket.discount.value; // It's already in cents! No normalizeMenuPrice needed here.
      manualDiscountAmount = Math.max(0, Math.min(discountCents, subtotalAfterAuto));
    }
  }

  const totalDiscounts = autoDiscountAmount + manualDiscountAmount;
  const cartTotal = Math.max(0, cartSubtotal - totalDiscounts);

  // --- TICKET LIFECYCLE (Must be above hooks that reference them) ---
  const clearCurrentTicket = async () => {
    if (!activeTicket) return;
    const ticketIdToDelete = activeTicket.id;
    await db.active_tickets.delete(ticketIdToDelete);
    if (navigator.onLine) {
      try {
        await supabase.from('active_tickets').delete().eq('id', ticketIdToDelete);
      } catch (err) {
        console.error("Cloud delete failed:", err);
      }
    }
    const remainingTickets = tickets.filter(t => t.id !== ticketIdToDelete);
    if (remainingTickets.length > 0) {
      const nextVisible = remainingTickets.find(t => posSettings.ticketVisibility === 'open' || t.cashier_id === activeCashier?.id);
      setActiveTicketId(nextVisible ? nextVisible.id : null);
    } else {
      setActiveTicketId(null);
    }
  };

  const handleCancelTicket = () => {
    if (activeTicket.items.length === 0) {
      clearCurrentTicket();
      return;
    }
    showConfirm(t('reg.voidTitle'), t('reg.voidDesc'), () => clearCurrentTicket());
  };

  const enrichedActiveTicket = activeTicket ? {
    ...activeTicket,
    autoDiscountRuleName: activeAutoRuleName || null,
    autoDiscountAmount: autoDiscountAmount || 0,
    manualDiscountAmount: manualDiscountAmount || 0
  } : null;

  // --- HOOK DEPENDENCIES (all computed values now available) ---
  const hookDeps = {
    expectedCash, countedCash, shiftCashSales, shiftCardSales, shiftTransferSales,
    shiftTotalExpenses, activeCashier, myDeviceId, setIsCorteModalOpen,
    setCountedCash, setLastCorteTimestamp, t, showAlert, showConfirm,
    loyaltyModal, setLoyaltyModal, activeTicket: enrichedActiveTicket, menuData, setPhoneError,
    loyaltySettings: menuData?.loyaltySettings || null,
    cartTotal, tipAmount, setSuccessTicket, clearCurrentTicket
  };

  const { handleProcessCorte } = useShiftCorte(hookDeps);
  const { handleOpenCheckout, handleCancelCheckout, handlePartialPayment, handleSavePartialPayments, handleVoidPartialPayments } = useCheckout(hookDeps);
  const { handleCheckLoyalty, handleRedeemReward, handleDetachLoyalty } = useLoyalty(hookDeps);

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
    if (item.priceType === 'variable') {
      showPrompt(
        `${t('menu.promptVariablePrice') || 'Enter Price for'} ${item.name}`,
        '',
        (inputValue) => {
          const customPrice = toCents(inputValue);
          if (isNaN(customPrice) || customPrice < 0) {
            return showAlert(t('common.error'), t('check.alertInvalid'));
          }

          if (item.allowedModifiers.length > 0) {
            setPendingItem({ ...item, basePrice: customPrice, selectedModifiers: [] });
            setIsModalOpen(true);
          } else {
            addToTicket(item, [], customPrice);
          }
        },
        item.basePrice > 0 ? String(fromCents(item.basePrice)) : '',
        t('common.save'),
        t('common.cancel'),
        'decimal'
      );
      return;
    }

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

  const addToTicket = async (item, modifiers, customPrice) => {
    if (!activeTicket) {
      showAlert(t('cart.noActiveOrderTitle'), t('cart.noActiveOrderDesc'));
      setIsModalOpen(false);
      setPendingItem(null);
      return;
    }

    // --- LOW STOCK CHECK ---
    // Non-blocking toast when an ingredient drops at/under the configured
    // threshold. Only fall back to a modal when an ingredient would go negative,
    // which is the only case worth interrupting the cashier for.
    if (recipes) {
      const recipe = recipes.find(r => r.linked_menu_item === item.id);
      if (recipe && recipe.ingredients) {
        const inventory = await db.inventory.toArray();
        const threshold = posSettings?.lowStockThreshold || 0;
        for (const ing of recipe.ingredients) {
          const invItem = inventory.find(i => i.name === ing.name);
          if (!invItem) continue;
          const projected = invItem.current_stock - ing.qty;
          if (projected < 0) {
            showAlert(t('register.lowStock'), t('register.lowStockDesc').replace('{{ingredient}}', invItem.name).replace('{{qty}}', threshold));
            break;
          }
          if (projected <= threshold) {
            showToast(t('register.lowStockDesc').replace('{{ingredient}}', invItem.name).replace('{{qty}}', threshold), 'warning');
            break;
          }
        }
      }
    }

    const newItem = {
      ...item,
      basePrice: customPrice !== undefined ? customPrice : item.basePrice,
      uniqueId: crypto.randomUUID(),
      selectedModifiers: modifiers
    };
    const updatedItems = [...activeTicket.items, newItem];

    await db.active_tickets.update(activeTicket.id, { items: updatedItems });
    pushActiveTicketUpdate(activeTicket.id, { items: updatedItems, last_modified_by: myDeviceId });

    setIsModalOpen(false);
    setPendingItem(null);
  };

  const handleUpdateItemQty = async (itemUniqueId, newQty) => {
    if (!activeTicket) return;

    const updatedItems = newQty === 0
      ? activeTicket.items.filter(i => i.uniqueId !== itemUniqueId)
      : activeTicket.items.map(i => i.uniqueId === itemUniqueId ? { ...i, qty: newQty } : i);

    await db.active_tickets.update(activeTicket.id, { items: updatedItems });
    pushActiveTicketUpdate(activeTicket.id, { items: updatedItems, last_modified_by: myDeviceId });
  };

  const handleRemoveItem = async (itemUniqueId) => {
    if (!activeTicket) return;

    const updatedItems = activeTicket.items.filter(i => i.uniqueId !== itemUniqueId);

    await db.active_tickets.update(activeTicket.id, { items: updatedItems });
    pushActiveTicketUpdate(activeTicket.id, { items: updatedItems, last_modified_by: myDeviceId });
  };

  // clearCurrentTicket and handleCancelTicket hoisted above hooks (see line ~641)



  // Utilities moved to src/utils/sharingUtils.js

  const printRawReceipt = async (ticket, total) => {
    const receiptSettings = menuData?.receiptSettings || {
      header: posSettings?.name || "",
      subheader: "",
      footer: "",
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
        showAlert(t('receipt.unsupportedTitle'), t('receipt.unsupportedMsg'));
      }
    }
  };

  // --- WHATSAPP RECEIPT LOGIC ---
  const sendFinalMessage = (phone, loyaltyData) => {
    const receiptSettings = menuData?.receiptSettings || {
      header: posSettings.name || 'TinyPOS',
      subheader: '',
      footer: '',
      enableTaxBreakdown: false,
      taxRate: 16
    };
    sendFinalMessageUtil(phone, enrichedActiveTicket, cartTotal, { t, lang, receiptSettings, loyaltyData });
    setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null });
  };

  const handleSaveAsPNG = async (ticket) => {
    try {
      // Capture the hidden TicketImage element
      await saveTicketAsPNGUtil('ticket-to-capture', `ticket-${ticket.name || 'pos'}.png`);
    } catch (err) {
      showAlert(t('common.error'), t('receipt.savePngErrorPrefix') + err.message);
    }
  };

  // --- 2. THE GUEST CHECKOUT (NO TRACKING) ---
  const handleGuestReceipt = () => {
    const cleanPhone = loyaltyModal.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) return setPhoneError(true);
    sendFinalMessage(cleanPhone, null);
  };

  const handleWheelScroll = (e) => {
    if (e.deltaY !== 0) {
      const canScrollLeft = e.currentTarget.scrollLeft > 0;
      const canScrollRight = e.currentTarget.scrollLeft < (e.currentTarget.scrollWidth - e.currentTarget.clientWidth);
      if ((e.deltaY < 0 && canScrollLeft) || (e.deltaY > 0 && canScrollRight)) {
        e.preventDefault();
        e.currentTarget.scrollLeft += e.deltaY;
      }
    }
  };

  // Bundle global state for the context wormhole. Memoized so that unrelated
  // re-renders (e.g. a PIN keystroke) don't cascade through every context consumer.
  const posState = useMemo(() => ({
    cartTotal, activeTicket: enrichedActiveTicket, menuData, posSettings, activeCashier,
    isCurrentlyOffline, totalOfflineRecords, shiftOrders, shiftExpenses, tickets,
    showAlert, showConfirm, requirePin, handleItemClick, setIsLocked, navigate,
    activeTicketId, setActiveTicketId, visibleTickets, cartSubtotal,
    autoDiscountAmount, autoDiscountCart, autoDiscountByItemUid, activeAutoRuleName, manualDiscountAmount,
    handleNewTicket, handleRenameTicket, handleWheelScroll, handleRemoveItem, handleUpdateItemQty,
    handleOpenCheckout, handleCancelTicket, printRawReceipt, handleSaveAsPNG,
    handleRedeemReward, handleDetachLoyalty, setLoyaltyModal, loyaltyModal,
    pendingItem, handleToggleModifier, handleTextModifierChange, addToTicket
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    cartTotal, enrichedActiveTicket, menuData, posSettings, activeCashier,
    isCurrentlyOffline, totalOfflineRecords, shiftOrders, shiftExpenses, tickets,
    activeTicketId, visibleTickets, cartSubtotal,
    autoDiscountAmount, autoDiscountCart, autoDiscountByItemUid, activeAutoRuleName, manualDiscountAmount,
    loyaltyModal, pendingItem
  ]);

  // --- 1. LOCK SCREEN GUARD ---
  if (isLocked) {
    if (!selectedProfile) {
      return (
        <>
          <LockScreen posSettings={posSettings} cashiers={cashiers} selectedProfile={selectedProfile} setSelectedProfile={setSelectedProfile} pinAttempt={pinAttempt} setPinAttempt={setPinAttempt} handlePinKeyDown={handlePinKeyDown} phoneError={pinShake} handleUnlockSubmit={handleUnlockSubmit} requirePin={requirePin} />
          <PinChallengeModal
            pinChallenge={pinChallenge}
            setPinChallenge={setPinChallenge}
            challengePinAttempt={challengePinAttempt}
            setChallengePinAttempt={setChallengePinAttempt}
            challengeError={challengeError}
            setChallengeError={setChallengeError}
            handleChallengeSubmit={handleChallengeSubmit}
          />
        </>
      );
    }

    // If a cashier IS selected, show the new standardized PIN Pad
    return (
      <>
        <SharedPinPad
          variant="fullscreen"
          avatarText={selectedProfile?.name?.charAt(0)}
          title={`${t('reg.loginHi')} ${selectedProfile?.name}`}
          subtitle={t('reg.loginEnterPin')}
          pin={pinAttempt}
          setPin={setPinAttempt}
          error={pinShake}
          setError={setPinShake}
          onSubmit={handleUnlockSubmit}
          onCancel={() => {
            setSelectedProfile(null);
            setPinAttempt('');
          }}
          submitText={t('reg.btnLogin')}
          submitIcon="lucide:log-in"
        />
        <PinChallengeModal
          pinChallenge={pinChallenge}
          setPinChallenge={setPinChallenge}
          challengePinAttempt={challengePinAttempt}
          setChallengePinAttempt={setChallengePinAttempt}
          challengeError={challengeError}
          setChallengeError={setChallengeError}
          handleChallengeSubmit={handleChallengeSubmit}
        />
      </>
    );
  }

  if (!menuData) return <div>{t('reg.errMissingMenu')}</div>;

  return (
    <PosContext.Provider value={posState}>
      <div className="pos-container">
        {/* Issue 8: Out of date banner */}
        {lastSyncedAt && (new Date() - new Date(lastSyncedAt) > 24 * 60 * 60 * 1000) && (
          <div style={{ background: '#f39c12', color: 'white', padding: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem', width: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1000 }}>
            ⚠️ {t('sync.outOfDate') || 'Menu potentially out of date. Syncing...'}
          </div>
        )}
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
          <span className="cart-badge">{activeTicket?.items?.reduce((n, i) => n + (i.qty || 1), 0) || 0}</span>
          <span>{formatForDisplay(cartTotal)}</span>
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

        <LoyaltyModal loyaltyModal={loyaltyModal} setLoyaltyModal={setLoyaltyModal} menuData={menuData} handleCheckLoyalty={handleCheckLoyalty} handleRedeemReward={handleRedeemReward} handleGuestReceipt={handleGuestReceipt} phoneError={phoneError} sendFinalMessage={sendFinalMessage} isAdvancedMode={posSettings?.isAdvancedMode === true} />

        <FlyingReceipt successTicket={successTicket} />

        <ToastNotifications toastNotifications={toasts} />

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
          {enrichedActiveTicket && (
            <TicketImage
              id="ticket-to-capture"
              ticket={enrichedActiveTicket}
              total={cartTotal}
              receiptSettings={menuData?.receiptSettings || {}}
            />
          )}
        </div>

      </div>
    </PosContext.Provider>
  );
}

export default Register;