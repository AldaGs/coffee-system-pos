import { usePos } from '../../utils/PosContext';
import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay } from '../../utils/moneyUtils';
import { Icon } from '@iconify/react';

function MenuArea({ 
  activeCategory, setActiveCategory, 
  isMobileMenuOpen, setIsMobileMenuOpen, 
  setIsSyncModalOpen, setIsExpenseModalOpen, setIsCorteModalOpen 
}) {
  const { t } = useTranslation();

  const { 
    menuData, posSettings, activeCashier, 
    isCurrentlyOffline, totalOfflineRecords, 
    shiftOrders, shiftExpenses, tickets, 
    showAlert, showConfirm, requirePin, 
    handleItemClick, setIsLocked, navigate 
  } = usePos();
  
  return (
    <main className="menu-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative' }}>
        <h2 style={{ margin: 0 }}>{activeCategory}</h2>
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
              <button onClick={() => { requirePin(t('menuArea.authGasto'), () => setIsExpenseModalOpen(true)); setIsMobileMenuOpen(false); }} style={{ padding: '8px 16px', background: 'var(--action-danger)', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            <button onClick={() => { navigate('/admin'); setIsMobileMenuOpen(false); }} className="admin-btn">
              {t('menuArea.admin')}
            </button>
          </div>
        </div>
      </div>

      <div className="category-tabs">
        {Object.keys(menuData?.categories || {}).map(category => (
          <button 
            key={category} 
            onClick={() => setActiveCategory(category)} 
            className={`tab-btn ${activeCategory === category ? 'active' : ''}`}
          >
            {category}
          </button>
        ))}
      </div>
      
      <div className="menu-grid">
        {(() => {
          // 1. Safe access with fallbacks
          const safeCategories = menuData?.categories || {};
          const currentProducts = safeCategories[activeCategory] || [];

          // 2. Check if there are actually any categories at all
          if (Object.keys(safeCategories).length === 0) {
            return (
              <div style={{ padding: '40px', textAlign: 'center', color: '#888', gridColumn: '1 / -1' }}>
                <h3>No menu items found.</h3>
                <p>Head over to the Admin dashboard to create your first category!</p>
              </div>
            );
          }

          // 3. If it's safe, map your exact product buttons!
          return currentProducts.map(item => (
            <button key={item.id} onClick={() => handleItemClick(item)} className="item-btn">
              <span className="item-name">{item.emoji || ''} {item.name}</span>
              <span className="item-price">{formatForDisplay(item.basePrice)}</span>
            </button>
          ));
        })()}
      </div>
    </main>
  );
}

export default MenuArea;