import { useState } from 'react';
import { usePos } from '../../utils/PosContext';
import { useTranslation } from '../../hooks/useTranslation';
import QuantityEditModal from './QuantityEditModal';

function TicketArea({
  isActionSheetOpen, setIsActionSheetOpen,
  setIsDiscountModalOpen, setLoyaltyModal,
  isMobileCartOpen, setIsMobileCartOpen
}) {
  const { t } = useTranslation();
  const [qtyEditItem, setQtyEditItem] = useState(null);

  const {
    activeTicketId, setActiveTicketId, visibleTickets, handleNewTicket,
    handleWheelScroll, activeTicket, cartSubtotal, cartTotal,
    autoDiscountAmount, activeAutoRuleName, manualDiscountAmount,
    handleRemoveItem, handleOpenCheckout, handleCancelTicket,
    requirePin, printRawReceipt, handleUpdateItemQty, handleRenameTicket
  } = usePos();
  
  return (
    <>
      {/* 1. Mobile Dark Overlay */}
      <div 
        className={`ticket-overlay desktop-hidden ${isMobileCartOpen ? 'open' : ''}`} 
        onClick={() => setIsMobileCartOpen(false)}
      ></div>

      {/* 2. Apply dynamic 'open' class to the aside */}
      <aside className={`ticket-area ${isMobileCartOpen ? 'open' : ''}`}>

        {/* 3. Mobile Close Button / Header */}
        <div className="mobile-ticket-header desktop-hidden" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Current Order</h2>
          <button 
            onClick={() => setIsMobileCartOpen(false)} 
            style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        <div className="ticket-tabs-container" onWheel={handleWheelScroll}>
          {visibleTickets.map(ticket => (
            <button key={ticket.id} onClick={() => setActiveTicketId(ticket.id)} className={`ticket-tab ${activeTicketId === ticket.id ? 'active' : ''}`}>
              {ticket.name}
            </button>
          ))}
          <button className="new-ticket-btn" onClick={handleNewTicket}>+</button>
        </div>

        {!activeTicket ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '10px' }}>{t('ticket.noOrders')}</h3>
            <p style={{ marginBottom: '20px' }}>{t('ticket.noOrdersDesc')}</p>
            <button onClick={handleNewTicket} style={{ padding: '12px 24px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              {t('ticket.btnStart')}
            </button>
          </div>
        ) : (
          <>
            <ul className="ticket-items">
              {activeTicket.items.length === 0 ? (
                <li className="empty-cart">{t('ticket.empty')}</li>
              ) : (
                activeTicket.items.map(item => (
                  <li key={item.uniqueId} className="ticket-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div className="item-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <button
                          onClick={() => setQtyEditItem(item)}
                          title="Editar cantidad"
                          style={{ background: 'var(--bg-surface)', border: '2px solid var(--brand-color)', borderRadius: '6px', padding: '2px 8px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', cursor: 'pointer', minWidth: '36px', textAlign: 'center', flexShrink: 0 }}
                        >
                          {item.qty || 1} x
                        </button>
                        <div>
                          <span>{item.emoji || '•'} {item.name}</span>
                          <span style={{ marginLeft: '10px' }}>${(item.basePrice * (item.qty || 1)).toFixed(2)}</span>
                        </div>
                      </div>
                      <button className="delete-item-btn" onClick={() => handleRemoveItem(item.uniqueId)}>✕</button>
                    </div>
                    {item.selectedModifiers.map(mod => (
                      <div key={mod.id} style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', width: '100%', paddingLeft: '10px', paddingRight: '30px' }}>
                        <span>+ {mod.name}{mod.textValue && (<strong style={{ color: 'var(--text-main)', marginLeft: '4px' }}>: "{mod.textValue}"</strong>)}</span>
                        <span>{mod.price > 0 ? `$${mod.price.toFixed(2)}` : ''}</span>
                      </div>
                    ))}
                  </li>
                ))
              )}
            </ul>

            <div className="ticket-footer">
              <div className="total-row" style={{ marginBottom: activeTicket.discount ? '4px' : '16px', fontSize: activeTicket.discount ? '1.1rem' : '1.5rem', color: activeTicket.discount ? 'var(--text-muted)' : 'var(--text-main)' }}>
                <span>{t('ticket.subtotal')}</span>
                <span>${cartSubtotal.toFixed(2)}</span>
              </div>
              {autoDiscountAmount > 0 && (
                <div className="total-row" style={{ marginBottom: '4px', fontSize: '1.1rem', color: '#27ae60' }}>
                  <span>{t('ticket.auto')} {activeAutoRuleName}</span>
                  <span>-${autoDiscountAmount.toFixed(2)}</span>
                </div>
              )}
              {activeTicket.discount && (
                <div className="total-row" style={{ marginBottom: '4px', fontSize: '1.1rem', color: '#e74c3c' }}>
                  <span>{t('ticket.discount')} ({activeTicket.discount.type === 'percentage' ? `${activeTicket.discount.value}%` : `$${activeTicket.discount.value}`})</span>
                  <span>-${manualDiscountAmount.toFixed(2)}</span>
                </div>
              )}
              {(activeTicket.discount || autoDiscountAmount > 0) && (
                <div className="total-row" style={{ marginBottom: '16px', fontSize: '1.5rem', color: 'var(--text-main)' }}>
                  <span>{t('ticket.total')}</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="checkout-actions">
                <button className="options-btn" onClick={() => setIsActionSheetOpen(true)} disabled={activeTicket.items.length === 0} style={{ flex: '0 0 auto', width: '60px', padding: '16px 0', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2rem', opacity: activeTicket.items.length === 0 ? 0.5 : 1, cursor: activeTicket.items.length === 0 ? 'not-allowed' : 'pointer' }}>⚙️</button>
                <button className="charge-btn" onClick={handleOpenCheckout} disabled={activeTicket.items.length === 0} style={{ flex: 1 }}>
                  {t('ticket.btnPay')}
                </button>
              </div>
            </div>

            <div className={`bottom-sheet-overlay ${isActionSheetOpen ? 'open' : ''}`} onClick={() => setIsActionSheetOpen(false)}></div>
            <div className={`bottom-sheet ${isActionSheetOpen ? 'open' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{t('ticket.options')}</h3>
                <button onClick={() => setIsActionSheetOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="cancel-btn" onClick={() => { setIsActionSheetOpen(false); handleCancelTicket(); }} style={{ flex: 1, padding: '16px', fontSize: '1.1rem' }}>
                    {t('ticket.btnVoid')}
                  </button>
                  <button onClick={() => { setIsActionSheetOpen(false); handleRenameTicket(); }} style={{ flex: 1, padding: '16px', background: 'var(--bg-main)', color: '#2980b9', border: '1px solid #2980b9', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    {t('ticket.btnRename')}
                  </button>
                </div>
                <button onClick={() => { setIsActionSheetOpen(false); requirePin(t('ticket.authDiscount'), () => setIsDiscountModalOpen(true)); }} style={{ flex: 1, padding: '16px', background: 'var(--bg-main)', color: '#8e44ad', border: '1px solid #8e44ad', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  {t('ticket.btnDiscount')}
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button style={{ flex: 1, padding: '16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }} onClick={() => { setIsActionSheetOpen(false); printRawReceipt(activeTicket, cartTotal); }}>
                    {t('ticket.btnPrint')}
                  </button>
                  <button style={{ flex: 1, padding: '16px', background: '#25D366', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }} onClick={() => { setIsActionSheetOpen(false); setLoyaltyModal({ isOpen: true, step: 'phone', phone: '', data: null }); }}>
                    {t('ticket.btnWA')}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>

      <QuantityEditModal
        key={qtyEditItem?.uniqueId}
        isOpen={!!qtyEditItem}
        item={qtyEditItem}
        onConfirm={handleUpdateItemQty}
        onClose={() => setQtyEditItem(null)}
      />
    </>
  );
}

export default TicketArea;