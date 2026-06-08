import { usePos } from '../../utils/PosContext';
import { useTranslation } from '../../hooks/useTranslation';
import { Icon } from '@iconify/react';
import { getRole } from '../../utils/cashierRoles';
import { gateRegisterAction, showOverrideLock } from '../../utils/actionGate';

// RegisterActionBar — the shared system toolbar that sits in the top-right of
// the menu header: offline/sync badge, cashier chip, and the Gasto / Corte /
// Lock / Admin buttons.
//
// Extracted out of MenuArea so BOTH register layouts can render it. Without
// this, a station running OrderFlowLayout (Mesas/Pedidos) would have no way to
// lock the screen, run a Corte, record a Gasto, see sync status, or even get
// back into Admin to switch layouts — those controls only ever lived in the
// Cafe layout's MenuArea. Keeping it in one place guarantees both layouts stay
// in parity.
//
// State that belongs to the Register parent (modal openers, mobile-menu
// toggle) is passed in as props; everything else is read from PosContext.
function RegisterActionBar({
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  setIsSyncModalOpen,
  setIsExpenseModalOpen,
  setIsCorteModalOpen,
}) {
  const { t } = useTranslation();

  const {
    posSettings, activeCashier,
    isCurrentlyOffline, totalOfflineRecords,
    shiftOrders, shiftExpenses, tickets,
    showAlert, showConfirm, requirePin,
    setIsLocked, navigate,
  } = usePos();

  // strictAdminAccess: only admins see the Admin button. In permissive mode
  // (the default) everyone sees it; the /admin route's own auth still gates.
  const canEnterAdmin = !posSettings?.strictAdminAccess || getRole(activeCashier) === 'admin';
  const expenseLocked = showOverrideLock(posSettings, activeCashier);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

      {(isCurrentlyOffline || totalOfflineRecords > 0) && (
        <button onClick={() => setIsSyncModalOpen(true)} className={`pop-in ${isCurrentlyOffline ? 'status-badge-offline' : 'status-badge-syncing'}`} style={{ padding: '8px 12px', background: isCurrentlyOffline ? '#e74c3c' : '#f39c12', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon={isCurrentlyOffline ? "lucide:wifi-off" : "lucide:upload-cloud"} style={{ fontSize: '1.2rem' }} />
          {totalOfflineRecords > 0 && (<span style={{ background: 'white', color: 'black', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' }}>{totalOfflineRecords}</span>)}
        </button>
      )}

      <button className="mobile-hamburger desktop-hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>☰</button>

      {isMobileMenuOpen && (
        <div
          className="mobile-menu-overlay desktop-hidden"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
            background: 'transparent'
          }}
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div className={`action-buttons-container ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <span style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '9999px', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--brand-color)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icon icon="lucide:user" style={{ fontSize: '1.1rem' }} /> {activeCashier?.name}
        </span>

        {posSettings?.isAdvancedMode && (
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              gateRegisterAction({
                posSettings, activeCashier, requirePin,
                title: t('menuArea.authGasto'),
                run: () => setIsExpenseModalOpen(true),
              });
            }}
            aria-label={expenseLocked ? t('settings.lockBadgeAria') : undefined}
            style={{ padding: '8px 16px', background: 'var(--action-danger)', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {expenseLocked && <Icon icon="lucide:lock" style={{ fontSize: '0.95rem' }} />}
            {t('menuArea.gasto')}
          </button>
        )}

        {posSettings?.isAdvancedMode && posSettings.enableCorte !== false && (
          <button onClick={() => {
            setIsMobileMenuOpen(false);
            if (shiftOrders.length === 0 && shiftExpenses.length === 0) {
              return showAlert(t('menuArea.noActivity'), t('menuArea.noActivityDesc'));
            }
            const hasPendingCash = tickets.some(t => t.savedSplitPayments && t.savedSplitPayments.some(p => p.method === 'Cash'));
            if (hasPendingCash) {
              return showConfirm(t('menuArea.pendingCashWarn'), t('menuArea.pendingCashDesc'), () => {
                requirePin(t('menuArea.authCorte'), () => setIsCorteModalOpen(true));
              });
            }
            requirePin(t('menuArea.authCorte'), () => setIsCorteModalOpen(true));
          }} style={{ padding: '8px 16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {t('menuArea.corte')}
          </button>
        )}

        <button onClick={() => { setIsLocked(true); setIsMobileMenuOpen(false); }} className="lock-btn">
          {t('menuArea.lock')}
        </button>
        {canEnterAdmin && (
          <button onClick={() => { navigate('/admin'); setIsMobileMenuOpen(false); }} className="admin-btn">
            {t('menuArea.admin')}
          </button>
        )}
      </div>
    </div>
  );
}

export default RegisterActionBar;
