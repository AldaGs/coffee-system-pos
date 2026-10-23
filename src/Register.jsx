import { Icon } from '@iconify/react';
import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from './db';
import { supabase } from './supabaseClient';
import { isLocalMode } from './utils/appMode';
import './App.css';
import { PosContext } from './utils/PosContext';
import { useDialog } from './hooks/useDialog';
import { useTheme } from './hooks/useTheme';
import { useTranslation } from './hooks/useTranslation';
import { useAuthStore } from './store/useAuthStore';
import { useMenuStore } from './store/useMenuStore';
import { useCartStore } from './store/useCartStore';
import { formatForDisplay } from './utils/moneyUtils';
import { cartTotals, shiftTotals } from './utils/registerTotals';
import { getBusinessProfile, getCachedBusinessType } from './utils/businessProfile';
import { useToastStack } from './components/ui/arc';
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
import { useRegisterSync } from './hooks/useRegisterSync';
import { useRegisterLock } from './hooks/useRegisterLock';
import { useOrderNumbers } from './hooks/useOrderNumbers';
import { useItemPicker, createItemClick } from './hooks/useItemPicker';
import { useTicketDiscounts } from './hooks/useTicketDiscounts';
import { useTablesLayout } from './hooks/useTablesLayout';
import { useReceiptSharing } from './hooks/useReceiptSharing';
import { useKdsSend } from './hooks/useKdsSend';
import SharedPinPad from './components/shared/SharedPinPad';
import HelpModal from './components/shared/HelpModal';
import OnlineOrdersInbox from './components/register/OnlineOrdersInbox';
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
import CorteModal from './components/register/CorteModal';
import PinChallengeModal from './components/register/PinChallengeModal';
import SyncStatusModal from './components/register/SyncStatusModal';
import DiscountModal from './components/register/DiscountModal';
import TicketImage from './components/register/TicketImage';

const getOrCreateDeviceId = () => {
  let id = localStorage.getItem('tinypos_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('tinypos_device_id', id);
  }
  return id;
};

// The layout is chosen per device (Admin → Device settings, localStorage only)
// and defaults from the store's business type. It applies on the next load.
const getLayoutMode = () => {
  try {
    return localStorage.getItem('tinypos_layout_mode') || getBusinessProfile(getCachedBusinessType()).defaultLayout;
  } catch {
    return 'cafe';
  }
};

function Register() {
  usePreventAccidentalExit();
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const { isLocked, setIsLocked, activeCashier } = useAuthStore();
  const { menuData, recipes, activeCategory, setActiveCategory, getPosSettings, lastSyncedAt, pinLockoutUntil } = useMenuStore();
  const { activeTicketId, setActiveTicketId, isCheckoutModalOpen, splitMode, setSplitMode, splitPayments, nWays, setNWays, customVal, setCustomVal, paidProductIds, tipAmount, setTipAmount, tipPercentage, setTipPercentage } = useCartStore();
  const posSettings = getPosSettings();
  const { showAlert, showConfirm, showPrompt } = useDialog();
  const { updateTheme } = useTheme();
  const { toast } = useToastStack();
  const showToast = (message, type = 'success') => toast({ type, title: message });

  const [myDeviceId] = useState(getOrCreateDeviceId);
  const [layoutMode] = useState(getLayoutMode);
  // 'tables' is the orders flow with a floor map in front of it.
  const orderFlowMode = layoutMode === 'orders' || layoutMode === 'tables';
  // Orders layout drill-down: 'tickets' → 'categories' → 'items'. Lives here so
  // TicketArea's "Add product" can advance it.
  const [orderFlowStep, setOrderFlowStep] = useState('tickets');
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [successTicket, setSuccessTicket] = useState(null);
  const [clipDeadlines, setClipDeadlines] = useState({}); // ticketId -> auto-cancel time for unpaid Clip orders
  const [hasValidSession, setHasValidSession] = useState(true);
  const [loyaltyModal, setLoyaltyModal] = useState({ isOpen: false, step: 'phone', phone: '', data: null });
  const [phoneError, setPhoneError] = useState(false);

  const tickets = useLiveQuery(() => db.active_tickets.toArray(), []) || [];
  const dexieSales = useLiveQuery(() => db.sales.toArray(), []) || [];
  const syncQueue = useLiveQuery(() => db.syncQueue.toArray(), []) || [];

  useRegisterSync();
  usePresence(myDeviceId, showAlert);
  const { challenge: pinChallenge, setChallenge: setPinChallenge, requirePin } = usePinChallenge();
  const lock = useRegisterLock({ tickets, autoLockMinutes: posSettings.autoLockMinutes, menuData, showAlert, t });
  const cashiers = menuData?.cashiers || [];

  const { expenses, expenseQueue, setExpenseQueue, isExpenseModalOpen, setIsExpenseModalOpen, expenseForm, setExpenseForm, handleSaveExpense, isSavingExpense } =
    useExpenses({ activeCashier, t, showAlert });

  // WhatsApp receipts that couldn't be sent yet; shown in the sync modal.
  const [waQueue] = useState(() => JSON.parse(localStorage.getItem('tinypos_wa_queue') || '[]'));
  useEffect(() => { localStorage.setItem('tinypos_wa_queue', JSON.stringify(waQueue)); }, [waQueue]);

  useSyncQueue({ expenseQueue, clearExpenseQueue: () => setExpenseQueue([]), onAuthError: () => setHasValidSession(false) });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setHasValidSession(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setHasValidSession(!!session));
    return () => subscription.unsubscribe();
  }, []);
  const isCurrentlyOffline = !navigator.onLine || !hasValidSession;
  const totalOfflineRecords = syncQueue.length + expenseQueue.length + waQueue.length;

  // A share/print intent can interrupt the state update that closes the ticket
  // sheet on mobile, so close it whenever the page becomes visible again.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setIsActionSheetOpen(false); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => { if (posSettings) updateTheme(posSettings); }, [posSettings, updateTheme]);

  // --- Shift (corte) ---
  const [lastCorteTimestamp, setLastCorteTimestamp] = useShiftStateValue('lastCorteTimestamp', new Date(0).toISOString());
  const [isCorteModalOpen, setIsCorteModalOpen] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [nextOrderNum, setNextOrderNum] = useOrderNumbers(menuData?.posSettings?.orderResetPolicy || 'daily');
  const {
    shiftOrders, shiftExpenses, shiftCashSales, shiftCardSales, shiftTransferSales, shiftClipSales, shiftTotalExpenses, expectedCash,
  } = shiftTotals(dexieSales, expenses, lastCorteTimestamp);

  // --- Tickets and cart ---
  const visibleTickets = posSettings.ticketVisibility === 'isolated' ? tickets.filter((tk) => tk.cashier_id === activeCashier?.id) : tickets;
  const activeTicket = visibleTickets.find((tk) => tk.id === activeTicketId) || null;
  const picker = useItemPicker({ menuData });
  const { isModalOpen, setIsModalOpen, pendingItem, setPendingItem, handleToggleModifier, handleTextModifierChange } = picker;
  const {
    handleNewTicket, handleNewTableTicket, handleRenameTicket, clearCurrentTicket, handleCancelTicket,
    addToTicket, handleUpdateItemQty, handleRemoveItem,
  } = useTickets({
    myDeviceId, activeCashier, posSettings, recipes,
    activeTicket, setActiveTicketId, tickets,
    nextOrderNum, setNextOrderNum,
    showAlert, showConfirm, showPrompt, showToast, t,
    setPendingItem, setIsModalOpen,
  });
  const handleItemClick = createItemClick({ menuData, addToTicket, setPendingItem, setIsModalOpen, showPrompt, showAlert, t });

  const {
    cartSubtotal, cartTotal, autoDiscountAmount, autoDiscountCart, autoDiscountByItemUid, activeAutoRuleName, manualDiscountAmount,
    enrichedTicket: enrichedActiveTicket,
  } = cartTotals(activeTicket, { rules: menuData?.discountRules || [], advanced: !!posSettings?.isAdvancedMode });

  const discounts = useTicketDiscounts({ activeTicket, posSettings, activeCashier, requirePin, showAlert, t });

  const { floors, selectedTable, handleSelectTable, handleBackToFloor } =
    useTablesLayout({ layoutMode, setActiveTicketId, setIsMobileCartOpen, setOrderFlowStep });
  // New ticket inside a table: asks for seats (default: the table's), then opens the menu.
  const handleNewTableTicketBridge = (table, onCreated) => handleNewTableTicket(table.id, table.seats || 4, onCreated);

  // In the orders layout, a finished sale goes back to the tickets list instead
  // of landing on whichever ticket clearCurrentTicket picked next.
  const onAfterCheckout = () => {
    if (!orderFlowMode) return;
    setActiveTicketId(null);
    setIsMobileCartOpen(false);
    setOrderFlowStep('tickets');
  };

  const hookDeps = {
    expectedCash, countedCash, shiftCashSales, shiftCardSales, shiftTransferSales, shiftClipSales,
    shiftTotalExpenses, activeCashier, myDeviceId, setIsCorteModalOpen,
    setCountedCash, setLastCorteTimestamp, t, showAlert, showConfirm,
    loyaltyModal, setLoyaltyModal, activeTicket: enrichedActiveTicket, menuData, setPhoneError,
    loyaltySettings: menuData?.loyaltySettings || null,
    cartTotal, tipAmount, setSuccessTicket, clearCurrentTicket, onAfterCheckout,
  };
  const { handleProcessCorte } = useShiftCorte(hookDeps);
  const { handleOpenCheckout, handleCancelCheckout, handlePartialPayment, handleSavePartialPayments, handleVoidPartialPayments } = useCheckout(hookDeps);
  const { handleCheckLoyalty, handleRedeemReward, handleDetachLoyalty, handleAttachCustomer } = useLoyalty(hookDeps);
  const { printRawReceipt, sendFinalMessage, handleSaveAsPNG, handleGuestReceipt } = useReceiptSharing({
    menuData, posSettings, enrichedTicket: enrichedActiveTicket, cartTotal, loyaltyModal, setLoyaltyModal, setPhoneError, showAlert, t, lang,
  });
  const handleSendToKds = useKdsSend({ tickets, posSettings, showToast, showAlert, t });

  // Vertical wheel scrolls horizontal strips (category tabs, ticket rail).
  const handleWheelScroll = (e) => {
    if (e.deltaY === 0) return;
    const el = e.currentTarget;
    const canLeft = el.scrollLeft > 0;
    const canRight = el.scrollLeft < el.scrollWidth - el.clientWidth;
    if ((e.deltaY < 0 && canLeft) || (e.deltaY > 0 && canRight)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  };

  // Memoized so unrelated re-renders (a PIN keystroke) don't re-render every consumer.
  const posState = useMemo(() => ({
    cartTotal, activeTicket: enrichedActiveTicket, menuData, posSettings, activeCashier,
    isCurrentlyOffline, totalOfflineRecords, shiftOrders, shiftExpenses, tickets,
    showAlert, showConfirm, requirePin, handleItemClick, setIsLocked, navigate,
    activeTicketId, setActiveTicketId, visibleTickets, cartSubtotal,
    autoDiscountAmount, autoDiscountCart, autoDiscountByItemUid, activeAutoRuleName, manualDiscountAmount,
    handleNewTicket, handleRenameTicket, handleWheelScroll, handleRemoveItem, handleUpdateItemQty,
    handleOpenCheckout, handlePartialPayment, handleCancelTicket, printRawReceipt, handleSaveAsPNG,
    handleRedeemReward, handleDetachLoyalty, handleAttachCustomer, setLoyaltyModal, loyaltyModal,
    pendingItem, handleToggleModifier, handleTextModifierChange, addToTicket,
    handleSendToKds, setIsHelpModalOpen, clipDeadlines,
  // Handlers are new functions each render; these values are what consumers react to.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    cartTotal, enrichedActiveTicket, menuData, posSettings, activeCashier,
    isCurrentlyOffline, totalOfflineRecords, shiftOrders, shiftExpenses, tickets,
    activeTicketId, visibleTickets, cartSubtotal,
    autoDiscountAmount, autoDiscountCart, autoDiscountByItemUid, activeAutoRuleName, manualDiscountAmount,
    loyaltyModal, pendingItem, clipDeadlines,
  ]);

  const { selectedProfile, setSelectedProfile, pinAttempt, setPinAttempt, pinShake, setPinShake, handleUnlockSubmit, handlePinKeyDown } = lock;
  const { isDiscountModalOpen, setIsDiscountModalOpen, discountForm, setDiscountForm, handleApplyDiscount, handleRemoveDiscount, handleToggleManualRule } = discounts;

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
          lockoutUntil={pinLockoutUntil}
          lockoutText={t('pin.tooManyAttempts')}
        />
        <PinChallengeModal challenge={pinChallenge} setChallenge={setPinChallenge} activeCashier={activeCashier} showAlert={showAlert} />
      </>
    );
  }

  if (!menuData) return <div>{t('reg.errMissingMenu')}</div>;

  return (
    <PosContext.Provider value={posState}>
      <div className="pos-container">
        {/* Connectivity indicator now lives inside RegisterActionBar's toolbar
            row (docked as a flex sibling of the hamburger) so it can't overlap
            it — see ConnectionStatusPill usage there. */}
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
          setPendingItem={setPendingItem}
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

        <LoyaltyModal loyaltyModal={loyaltyModal} setLoyaltyModal={setLoyaltyModal} menuData={menuData} handleCheckLoyalty={handleCheckLoyalty} handleAttachCustomer={handleAttachCustomer} handleRedeemReward={handleRedeemReward} handleGuestReceipt={handleGuestReceipt} phoneError={phoneError} sendFinalMessage={sendFinalMessage} isAdvancedMode={posSettings?.isAdvancedMode === true} />

        <FlyingReceipt successTicket={successTicket} />

        <ExpenseModal isExpenseModalOpen={isExpenseModalOpen} setIsExpenseModalOpen={setIsExpenseModalOpen} expenseForm={expenseForm} setExpenseForm={setExpenseForm} handleSaveExpense={handleSaveExpense} isSavingExpense={isSavingExpense} />

        <CorteModal isCorteModalOpen={isCorteModalOpen} setIsCorteModalOpen={setIsCorteModalOpen} shiftCashSales={shiftCashSales} shiftCardSales={shiftCardSales} shiftTransferSales={shiftTransferSales} shiftClipSales={shiftClipSales} shiftTotalExpenses={shiftTotalExpenses} expectedCash={expectedCash} countedCash={countedCash} setCountedCash={setCountedCash} handleProcessCorte={handleProcessCorte} />

        <PinChallengeModal challenge={pinChallenge} setChallenge={setPinChallenge} activeCashier={activeCashier} showAlert={showAlert} />

        <SyncStatusModal isSyncModalOpen={isSyncModalOpen} setIsSyncModalOpen={setIsSyncModalOpen} isCurrentlyOffline={isCurrentlyOffline} syncQueue={syncQueue} expenseQueue={expenseQueue} waQueue={waQueue} />

        {posSettings?.onlineOrders?.enabled && !isLocalMode() && (
          <OnlineOrdersInbox
            tickets={tickets} activeCashier={activeCashier} myDeviceId={myDeviceId} menuData={menuData} activeTicketId={activeTicketId} nextOrderNum={nextOrderNum} setNextOrderNum={setNextOrderNum}
            kdsEnabled={!!posSettings?.kdsEnabled} handleSendToKds={handleSendToKds} clipPayMinutes={posSettings?.onlineOrders?.payments?.clipMinutes} setClipDeadlines={setClipDeadlines}
            setActiveTicketId={setActiveTicketId} showAlert={showAlert} showPrompt={showPrompt} showToast={showToast}
          />
        )}

        <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />

        <DiscountModal isDiscountModalOpen={isDiscountModalOpen} setIsDiscountModalOpen={setIsDiscountModalOpen} discountForm={discountForm} setDiscountForm={setDiscountForm} handleApplyDiscount={handleApplyDiscount} handleRemoveDiscount={handleRemoveDiscount} activeTicket={activeTicket} menuData={menuData} handleToggleManualRule={handleToggleManualRule} isAdvancedMode={posSettings?.isAdvancedMode} />

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