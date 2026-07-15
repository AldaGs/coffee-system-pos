import { Icon } from '@iconify/react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { loadMenu } from './api/menu';
import { loadFloors } from './api/floors';
import { tablesOf } from './utils/floorDocument';
import { isLocalMode } from './utils/appMode';
import './App.css';
import { PosContext } from './utils/PosContext';
import { useDialog } from './hooks/useDialog';
import { useTheme } from './hooks/useTheme';
import { useAuthStore } from './store/useAuthStore';
import { useMenuStore } from './store/useMenuStore';
import { useCartStore } from './store/useCartStore';
import { logActivity } from './services/activityService';
import { consumePendingAuthorizer } from './utils/overrideAuthorizer';
import { useTranslation } from './hooks/useTranslation';
import { calculateExpectedCash } from './utils/posMath';
import { getOrderedVisibleCategories } from './utils/categoryUtils';
import { toCents, formatForDisplay, normalizeMenuPrice } from './utils/moneyUtils';
import SharedPinPad from './components/shared/SharedPinPad';

// Modular Child Components
import BootScreen from './components/register/BootScreen';
import LockScreen from './components/register/LockScreen';
import CafeLayout from './components/register/CafeLayout';
import OrderFlowLayout from './components/register/OrderFlowLayout';
import FloorLayout from './components/register/FloorLayout';
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
import { useSyncQueue } from './hooks/useSyncQueue';
import { useExpenses } from './hooks/useExpenses';
import { useShiftStateValue } from './hooks/useShiftState';
import { useTickets } from './hooks/useTickets';
import { usePinChallenge } from './hooks/usePinChallenge';
import { usePreventAccidentalExit } from './hooks/usePreventAccidentalExit';

import CorteModal from './components/register/CorteModal';
import PinChallengeModal from './components/register/PinChallengeModal';
import SyncStatusModal from './components/register/SyncStatusModal';
import DiscountModal from './components/register/DiscountModal';
import TicketImage from './components/register/TicketImage';
import { printRawReceipt as printRawReceiptUtil, sendFinalMessage as sendFinalMessageUtil, saveTicketAsPNG as saveTicketAsPNGUtil } from './utils/sharingUtils';
import { fetchAndMergeSales } from './services/salesSync';
import { fetchAndMergeExpenses } from './services/expenseSync';
import { fetchActiveTickets } from './services/ticketSync';
import { createRealtimeChannel } from './utils/realtime';
import { fromCents } from './utils/moneyUtils';
import { getBusinessProfile, getCachedBusinessType } from './utils/businessProfile';


const getOrCreateDeviceId = () => {
  let id = localStorage.getItem('tinypos_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('tinypos_device_id', id);
  }
  return id;
};

// Per-device register layout. CRITICAL: the CHOICE is read EXCLUSIVELY from
// localStorage (set in Admin → Device Settings) and is never synced to
// Supabase, so each physical station can run a different layout against the
// same store. When a station has never chosen one, the default is seeded from
// the store-wide business type (restaurant → tables, e-commerce → orders,
// etc.) rather than a hardcoded 'cafe' — an operator can still override it.
const getLayoutMode = () => {
  try {
    const stored = localStorage.getItem('tinypos_layout_mode');
    if (stored) return stored;
    return getBusinessProfile(getCachedBusinessType()).defaultLayout;
  } catch {
    return 'cafe';
  }
};


function Register() {
  usePreventAccidentalExit();
  const navigate = useNavigate();
  const { t, lang } = useTranslation();

  // --- ZUSTAND GLOBAL STORES ---
  const { isLocked, setIsLocked, activeCashier, setActiveCashier, sessionTime, setSessionTime } = useAuthStore();
  const { menuData, setMenuData, recipes, setRecipes, activeCategory, setActiveCategory, setIsLoading, getPosSettings, lastSyncedAt } = useMenuStore();
  const { activeTicketId, setActiveTicketId, isCheckoutModalOpen, splitMode, setSplitMode, splitPayments, nWays, setNWays, customVal, setCustomVal, paidProductIds, tipAmount, setTipAmount, tipPercentage, setTipPercentage } = useCartStore();



  const [myDeviceId] = useState(getOrCreateDeviceId);

  // Read the per-device layout once at mount. Changing it in Admin → Device
  // Settings writes localStorage; it takes effect on the next register load
  // (full reload), which is the desired "configure the station, then run it"
  // behavior for a physical terminal.
  const [layoutMode] = useState(getLayoutMode);

  // The 'tables' (floor-plan) layout is built on the same ticket flow as
  // 'orders' — it adds a floor map in front (Phase 4). Until that lands, and for
  // all the shared ticket/checkout plumbing, both modes are driven by this flag.
  const orderFlowMode = layoutMode === 'orders' || layoutMode === 'tables';

  // Tables layout: the saved floor plan(s) and which table's ticket flow is open
  // (null = show the floor map). Floors are config that rarely changes mid-shift,
  // so they're fetched once (loadFloors dispatches cloud vs. local) rather than
  // live-queried.
  const [floors, setFloors] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(null);
  useEffect(() => {
    if (layoutMode !== 'tables') return;
    let cancelled = false;
    loadFloors().then(f => { if (!cancelled) setFloors(f); }).catch(err => console.error('Floor load failed:', err));
    return () => { cancelled = true; };
  }, [layoutMode]);

  // Drill-down step for the orders ("Mesas/Pedidos") layout: 'tickets' ->
  // 'categories' -> 'items'. Lifted here (rather than inside OrderFlowLayout)
  // so the sibling TicketArea — which serves as the flow's "ticket content"
  // screen — can advance it via its Add-product button. Inert in cafe mode.
  const [orderFlowStep, setOrderFlowStep] = useState('tickets');

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

  // --- REALTIME ACTIVE TICKETS (multi-device live sync) ---------------------
  // Boot does a one-shot fetchActiveTickets(); this keeps the local Dexie cache
  // live afterwards so every station sees opens/edits/closes as they happen —
  // essential for the tables floor map (its per-table status is derived from
  // this query) and a correctness win for the orders layout too. Cloud mode
  // only; local ('guest') installs have no Supabase to subscribe to.
  useEffect(() => {
    if (isLocalMode()) return;
    const { cleanup } = createRealtimeChannel(
      'register-active-tickets',
      { event: '*', schema: 'public', table: 'active_tickets' },
      async (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'DELETE') {
          if (oldRow?.id != null) await db.active_tickets.delete(oldRow.id);
        } else if (newRow?.id != null) {
          // INSERT/UPDATE → mirror the cloud row (the source of truth for
          // active tickets, same philosophy as the boot overwrite).
          await db.active_tickets.put(newRow);
        }
      }
    );
    return cleanup;
  }, []);

  // --- MENU FETCH & OFFLINE CACHE ENGINE ---
  useEffect(() => {
    const fetchMenuAndRecipes = async () => {
      try {
        // 1. Fetch Menu (dedicated tables) + Settings (residual shop_settings.menu_data).
        //    Merged so the in-memory `menuData` shape stays identical for the
        //    Register UI and modifier rendering logic.
        //
        //    Local ('guest') mode has no cloud project: load the menu from Dexie
        //    (via the dispatcher) and merge with whatever settings are already
        //    cached locally by useMenuStore. The cloud-only fetches (shop_settings,
        //    recipes) are skipped entirely — supabase is null in this mode.
        let merged;
        if (isLocalMode()) {
          const menu = await loadMenu();
          const cachedSettings = useMenuStore.getState().menuData || {};
          merged = { ...cachedSettings, ...menu };
          setMenuData(merged);
        } else {
          const [menu, settingsRes, recipeResp] = await Promise.all([
            loadMenu(),
            supabase.from('shop_settings').select('menu_data').eq('id', 1).single(),
            supabase.from('recipes').select('*')
          ]);
          if (settingsRes.error) throw settingsRes.error;
          if (recipeResp.error) throw recipeResp.error;

          const settings = settingsRes.data?.menu_data || {};
          merged = { ...menu, ...settings };
          setMenuData(merged);
          setRecipes(recipeResp.data);
        }

        // SAFE ACTIVE CATEGORY ASSIGNMENT
        // Open on the first *visible, ordered* tab (matches MenuArea) instead
        // of whatever happens to be the first raw object key. Same helper the
        // tabs use, so the boot default can't drift apart from MenuArea.
        const allCats = Object.keys(merged.categories || {});
        if (allCats.length > 0) {
          const ordered = getOrderedVisibleCategories(merged);
          setActiveCategory(ordered[0] || allCats[0]);
        }

        // Steps 3-5 pull data down from other devices via Supabase. In local
        // ('guest') mode there is nothing to pull — Dexie is the only store —
        // so skip them; live queries already read the local tables directly.
        if (!isLocalMode()) {
          // 3. Pull down active tickets from other devices into local Dexie
          await fetchActiveTickets();

          // 4. Pull down historical sales into local Dexie (for OrdersTab refunds)
          await fetchAndMergeSales();

          // 5. Pull down expenses from every device so shift calc covers the
          // whole shop, not just this terminal's local writes.
          await fetchAndMergeExpenses();
        }

        setIsLoading(false);
      } catch (err) {
        console.warn("Failed to fetch fresh menu or sync, using cache.", err);
        setIsLoading(false);
      }
    };
    fetchMenuAndRecipes();
  }, [setMenuData, setRecipes, setActiveCategory, setIsLoading]);

  const {
    expenses, expenseQueue, setExpenseQueue,
    isExpenseModalOpen, setIsExpenseModalOpen,
    expenseForm, setExpenseForm,
    handleSaveExpense,
    isSavingExpense
} = useExpenses({ activeCashier, t, showAlert });

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

      // LOG ACTIVITY — fourth arg picks up the manager override (if any)
      // that gateRegisterAction stashed at the gate.
      logActivity(
        'Discount Applied',
        `A ${discountForm.type === 'percentage' ? discountForm.value + '%' : formatForDisplay(val)} discount was applied to ticket: ${activeTicket.name}`,
        null,
        consumePendingAuthorizer()
      );
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

  const [waQueue] = useState(() => {
    const saved = localStorage.getItem('tinypos_wa_queue');
    return saved ? JSON.parse(saved) : [];
  });
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('tinypos_wa_queue', JSON.stringify(waQueue));
  }, [waQueue]);

  useSyncQueue({
    expenseQueue,
    clearExpenseQueue: () => setExpenseQueue([]),
    onAuthError: () => setHasValidSession(false)
  });

  // --- CORTE / ORDER NUMBER — Dexie-backed (was localStorage) ---
  const [lastCorteTimestamp, setLastCorteTimestamp] = useShiftStateValue('lastCorteTimestamp', new Date(0).toISOString());
  const [isCorteModalOpen, setIsCorteModalOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("");

  const [nextOrderNum, setNextOrderNum] = useShiftStateValue('nextOrderNum', 1);
  const [lastResetDate, setLastResetDate] = useShiftStateValue('lastResetDate', new Date().toDateString());

  useEffect(() => {
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
    }
  }, [menuData?.posSettings?.orderResetPolicy, lastResetDate, setNextOrderNum, setLastResetDate]);

  // --- BOTTOM SHEET STATE ---
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  // Force-close the ticket bottom sheet whenever the page becomes visible
  // again. Mobile WebViews can interrupt React's state flush when the Web
  // Share / WhatsApp / print intent opens, leaving setIsActionSheetOpen(false)
  // uncommitted. The user then comes back to a half-open sheet missing its
  // close affordance. Closing on visibility-resume is cheap insurance — worst
  // case the user has to tap "options" again after briefly switching apps.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setIsActionSheetOpen(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // --- DEVICE IDENTITY & SESSION ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { challenge: pinChallenge, setChallenge: setPinChallenge, requirePin } = usePinChallenge();


  // --- LOYALTY & WHATSAPP STATES ---
  const [loyaltyModal, setLoyaltyModal] = useState({ isOpen: false, step: 'phone', phone: '', data: null });
  const [phoneError, setPhoneError] = useState(false); // shake on invalid phone in loyalty modal
  const [pinShake, setPinShake] = useState(false);     // shake on wrong PIN (lock + challenge)
  const pinAttempts = useRef(0);                       // monotonic wrong-PIN counter (telemetry hook)

  // --- CASHIER PROFILES (CLOUD SYNCED) ---
  // Read directly from menuData. Cashiers are seeded at onboarding — no
  // hardcoded Admin/1234 fallback.
  const cashiers = menuData?.cashiers || [];

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

  // 3. Sum up the CASH expenses that actually left the drawer. Inventory costs
  // paid from the bank or the owner's own pocket are still recorded as expenses
  // for the books (COGS/P&L), but no physical cash left the register for those,
  // so they must not move the drawer Corte — otherwise the count never
  // reconciles. The pocket lives in the expense's `payment_source` column
  // (see migration 028); only 'caja' (petty cash) counts against the drawer.
  // Rows with no payment_source (legacy / manual register expenses) default to
  // drawer cash, preserving prior behavior.
  const leftTheDrawer = (e) => e.payment_source !== 'banco' && e.payment_source !== 'dueno';
  const shiftTotalExpenses = shiftExpenses.reduce((sum, e) => sum + (leftTheDrawer(e) ? e.amount : 0), 0);

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

  const {
    handleNewTicket, handleNewTableTicket, handleRenameTicket, clearCurrentTicket, handleCancelTicket,
    addToTicket, handleUpdateItemQty, handleRemoveItem
  } = useTickets({
    myDeviceId, activeCashier, posSettings, recipes,
    activeTicket, setActiveTicketId, tickets,
    nextOrderNum, setNextOrderNum,
    showAlert, showConfirm, showPrompt, showToast, t,
    setPendingItem, setIsModalOpen
  });

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

  const enrichedActiveTicket = activeTicket ? {
    ...activeTicket,
    autoDiscountRuleName: activeAutoRuleName || null,
    autoDiscountAmount: autoDiscountAmount || 0,
    manualDiscountAmount: manualDiscountAmount || 0
  } : null;

  // After a sale completes in the orders ("Mesas/Pedidos") layout, drop back
  // to the tickets list instead of riding along on whatever ticket
  // clearCurrentTicket auto-selected next — landing on someone else's open
  // ticket right after closing a sale is confusing.
  const onAfterCheckout = () => {
    if (!orderFlowMode) return;
    setActiveTicketId(null);
    setIsMobileCartOpen(false);
    setOrderFlowStep('tickets');
  };

  // --- TABLES LAYOUT: floor <-> table-scoped ticket flow --------------------
  // The selected table node, resolved across every floor's canvas document.
  const selectedTable = useMemo(() => {
    if (!selectedTableId) return null;
    for (const f of floors) {
      const hit = tablesOf(f.document).find(tb => tb.id === selectedTableId);
      if (hit) return hit;
    }
    return null;
  }, [selectedTableId, floors]);

  // Tap a table on the floor map → open its scoped ticket rail.
  const handleSelectTable = (table) => {
    setSelectedTableId(table.id);
    setActiveTicketId(null);
    setOrderFlowStep('tickets');
  };
  // Back arrow in the scoped rail → return to the floor map.
  const handleBackToFloor = () => {
    setSelectedTableId(null);
    setActiveTicketId(null);
    setIsMobileCartOpen(false);
  };
  // "New ticket" inside a table → seats prompt then create+select (onCreated
  // advances to the menu). Seats default to the table's expected count.
  const handleNewTableTicketBridge = (table, onCreated) => {
    handleNewTableTicket(table.id, table.seats || 4, onCreated);
  };

  // --- HOOK DEPENDENCIES (all computed values now available) ---
  const hookDeps = {
    expectedCash, countedCash, shiftCashSales, shiftCardSales, shiftTransferSales,
    shiftTotalExpenses, activeCashier, myDeviceId, setIsCorteModalOpen,
    setCountedCash, setLastCorteTimestamp, t, showAlert, showConfirm,
    loyaltyModal, setLoyaltyModal, activeTicket: enrichedActiveTicket, menuData, setPhoneError,
    loyaltySettings: menuData?.loyaltySettings || null,
    cartTotal, tipAmount, setSuccessTicket, clearCurrentTicket, onAfterCheckout
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


  const handleItemClick = (item) => {
    // Hidden modifier groups don't prompt the cashier, so an item whose only
    // groups are hidden skips the modal and adds straight to the ticket.
    const hasVisibleModifiers = (item.allowedModifiers || []).some(
      k => menuData?.modifierGroups?.[k] && !menuData?.modifierGroupSettings?.[k]?.isHidden
    );
    if (item.priceType === 'variable') {
      showPrompt(
        `${t('menu.promptVariablePrice') || 'Enter Price for'} ${item.name}`,
        '',
        (inputValue) => {
          const customPrice = toCents(inputValue);
          if (isNaN(customPrice) || customPrice < 0) {
            return showAlert(t('common.error'), t('check.alertInvalid'));
          }

          if (hasVisibleModifiers) {
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

    if (hasVisibleModifiers) {
      setPendingItem({ ...item, selectedModifiers: [] });
      setIsModalOpen(true);
    } else {
      addToTicket(item, []);
    }
  };

  const handleToggleModifier = (modGroupKey, modifierObj) => {
    const allowMultiple = !!menuData?.modifierGroupSettings?.[modGroupKey]?.allowMultiple;
    let updatedModifiers = [...pendingItem.selectedModifiers];

    if (allowMultiple) {
      const sameOptionIdx = updatedModifiers.findIndex(m => m.id === modifierObj.id && m.groupId === modGroupKey);
      if (sameOptionIdx >= 0) {
        updatedModifiers.splice(sameOptionIdx, 1);
      } else {
        updatedModifiers.push({ ...modifierObj, groupId: modGroupKey });
      }
    } else {
      const existingIndex = updatedModifiers.findIndex(m => m.groupId === modGroupKey);
      if (existingIndex >= 0) {
        updatedModifiers[existingIndex] = { ...modifierObj, groupId: modGroupKey };
      } else {
        updatedModifiers.push({ ...modifierObj, groupId: modGroupKey });
      }
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

  // --- KDS SEND (shared by the manual button and immediate mode) ---
  // Guards against concurrent double-sends: the local kds_sent flag only flips
  // after the awaited db write, so a re-render in that window could otherwise
  // insert a second order_fulfillment row for the same ticket.
  const kdsSendingRef = useRef(new Set());
  const handleSendToKds = async (ticket, { silent = false } = {}) => {
    if (!ticket || ticket.kds_sent || kdsSendingRef.current.has(ticket.id)) return;
    kdsSendingRef.current.add(ticket.id);
    try {
      // 1. Locally mark as sent
      await db.active_tickets.update(ticket.id, { kds_sent: true });

      // 2. Update Supabase
      if (!isLocalMode()) {
        // Critical path: the durable KDS record. If this fails, the send failed.
        const { error: insertErr } = await supabase.from('order_fulfillment').insert({
          active_ticket_id: ticket.id,
          customer_name: ticket.name,
          items: ticket.items,
          payment_status: 'unpaid',
          status: 'received'
        });
        if (insertErr) throw insertErr;

        // Best-effort: flag the cloud ticket too. The KDS never reads this
        // column, and it may be absent on older installs — a failure here must
        // not abort the send or roll back the insert above.
        const { error: flagErr } = await supabase
          .from('active_tickets').update({ kds_sent: true }).eq('id', ticket.id);
        if (flagErr) console.warn('Cloud kds_sent flag update failed (non-fatal):', flagErr.message);
      }
      if (!silent) showToast("Pedido enviado a cocina");
    } catch (err) {
      console.error('Failed to send to KDS:', err);
      // Roll back the local flag so the ticket can be retried.
      await db.active_tickets.update(ticket.id, { kds_sent: false }).catch(() => {});
      if (!silent) showAlert(t('common.error'), "No se pudo enviar a la cocina");
    } finally {
      kdsSendingRef.current.delete(ticket.id);
    }
  };

  // --- KDS IMMEDIATE MODE ---
  // When enabled, any ticket that has items and hasn't been sent yet is pushed
  // to the kitchen automatically (no "Enviar a Cocina" button press needed).
  // Dedup is via kds_sent, so each ticket inserts exactly one order_fulfillment row.
  useEffect(() => {
    if (!posSettings?.kdsEnabled || posSettings?.kdsMode !== 'immediate') return;
    tickets
      .filter(tk => !tk.kds_sent && Array.isArray(tk.items) && tk.items.length > 0)
      .forEach(tk => handleSendToKds(tk, { silent: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, posSettings?.kdsEnabled, posSettings?.kdsMode]);

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
    pendingItem, handleToggleModifier, handleTextModifierChange, addToTicket,
    handleSendToKds
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
          <PinChallengeModal challenge={pinChallenge} setChallenge={setPinChallenge} activeCashier={activeCashier} showAlert={showAlert} />
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
        <PinChallengeModal challenge={pinChallenge} setChallenge={setPinChallenge} activeCashier={activeCashier} showAlert={showAlert} />
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
        {/* LAYOUT CONTROLLER — picks the per-device register layout. Both
            layouts are just different "buttons" feeding the ONE shared cart;
            the TicketArea below is rendered by this parent in either mode so
            the checkout math/state hooks are never duplicated. */}
        {layoutMode === 'tables' && !selectedTable ? (
          <FloorLayout
            floors={floors}
            tickets={tickets}
            onSelectTable={handleSelectTable}
            isMobileMenuOpen={isMobileMenuOpen}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            setIsSyncModalOpen={setIsSyncModalOpen}
            setIsExpenseModalOpen={setIsExpenseModalOpen}
            setIsCorteModalOpen={setIsCorteModalOpen}
          />
        ) : orderFlowMode ? (
          <OrderFlowLayout
            step={orderFlowStep}
            setStep={setOrderFlowStep}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            setIsMobileCartOpen={setIsMobileCartOpen}
            isMobileMenuOpen={isMobileMenuOpen}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            setIsSyncModalOpen={setIsSyncModalOpen}
            setIsExpenseModalOpen={setIsExpenseModalOpen}
            setIsCorteModalOpen={setIsCorteModalOpen}
            tableScope={layoutMode === 'tables' ? selectedTable : null}
            onBackToFloor={handleBackToFloor}
            onNewTableTicket={handleNewTableTicketBridge}
          />
        ) : (
          <CafeLayout
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            isMobileMenuOpen={isMobileMenuOpen}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            setIsSyncModalOpen={setIsSyncModalOpen}
            setIsExpenseModalOpen={setIsExpenseModalOpen}
            setIsCorteModalOpen={setIsCorteModalOpen}
          />
        )}

        <TicketArea
          isActionSheetOpen={isActionSheetOpen}
          setIsActionSheetOpen={setIsActionSheetOpen}
          setIsDiscountModalOpen={setIsDiscountModalOpen}
          setLoyaltyModal={setLoyaltyModal}
          isMobileCartOpen={isMobileCartOpen}
          setIsMobileCartOpen={setIsMobileCartOpen}
          orderFlowMode={orderFlowMode}
          onAddProduct={() => { setOrderFlowStep('categories'); setIsMobileCartOpen(false); }}
        />

        {/* Floating Cart Button for Mobile. In the orders flow the tickets-list
            screen IS the home view and tapping a ticket already opens its cart,
            so the pill there is redundant/confusing — hide it on that step and
            bring it back on the categories/items steps as the way back to the
            cart. */}
        {!(orderFlowMode && orderFlowStep === 'tickets') && (
          <button
            className="mobile-cart-fab desktop-hidden"
            onClick={() => setIsMobileCartOpen(true)}
          >
            <Icon icon="lucide:shopping-cart" />
            <span className="cart-badge">{activeTicket?.items?.reduce((n, i) => n + (i.qty || 1), 0) || 0}</span>
            <span>{formatForDisplay(cartTotal)}</span>
          </button>
        )}

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

        <ExpenseModal isExpenseModalOpen={isExpenseModalOpen} setIsExpenseModalOpen={setIsExpenseModalOpen} expenseForm={expenseForm} setExpenseForm={setExpenseForm} handleSaveExpense={handleSaveExpense} isSavingExpense={isSavingExpense} />

        <CorteModal isCorteModalOpen={isCorteModalOpen} setIsCorteModalOpen={setIsCorteModalOpen} shiftCashSales={shiftCashSales} shiftCardSales={shiftCardSales} shiftTransferSales={shiftTransferSales} shiftTotalExpenses={shiftTotalExpenses} expectedCash={expectedCash} countedCash={countedCash} setCountedCash={setCountedCash} handleProcessCorte={handleProcessCorte} />

        <PinChallengeModal challenge={pinChallenge} setChallenge={setPinChallenge} activeCashier={activeCashier} showAlert={showAlert} />

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