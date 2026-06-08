import { useState } from 'react';
import { Icon } from '@iconify/react';
import { usePos } from '../../utils/PosContext';
import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay } from '../../utils/moneyUtils';
import { getOrderedVisibleCategories } from '../../utils/categoryUtils';

// OrderFlowLayout — the "Mesas/Pedidos" (Full Service) layout.
//
// SCAFFOLD: a responsive split-pane built with CSS Grid.
//   • Tablet/Desktop (>=768px): two columns — a persistent, scrollable list of
//     active open tickets on the left (30%), the menu on the right (70%).
//   • Mobile (<=767px): a single-pane state machine — show the ticket list,
//     tap a ticket, then show the menu. A back button returns to the list.
//
// Like CafeLayout, this component owns NO cart/checkout state. It reads the
// shared ticket list and pushes tapped items into the SAME shared cart via
// PosContext (handleItemClick). The TicketArea (cart/total/pay/3-dot menu)
// continues to live in the Register parent — both layouts are just different
// "buttons" feeding one cart.
function OrderFlowLayout({ activeCategory, setActiveCategory }) {
  const { t } = useTranslation();
  const {
    menuData,
    visibleTickets,
    activeTicketId,
    setActiveTicketId,
    handleNewTicket,
    handleItemClick,
  } = usePos();

  // Mobile-only view state machine. Desktop ignores this and renders both panes
  // (CSS forces them visible at >=768px), so it only governs the phone flow:
  // 'tickets' -> pick a ticket -> 'menu'.
  const [step, setStep] = useState('tickets');

  const selectTicket = (ticketId) => {
    setActiveTicketId(ticketId);
    setStep('menu');
  };

  const startNewTicket = async () => {
    // handleNewTicket owns ticket creation + activeTicketId assignment; we just
    // advance the mobile flow to the menu once it kicks off.
    await handleNewTicket();
    setStep('menu');
  };

  const orderedCategories = getOrderedVisibleCategories(menuData);
  const safeCategories = menuData?.categories || {};
  const currentProducts = safeCategories[activeCategory] || [];

  const ticketItemCount = (ticket) =>
    (ticket.items || []).reduce((n, i) => n + (i.qty || 1), 0);

  // On mobile, hide whichever pane isn't the active step. The `order-flow-pane`
  // CSS keeps both visible on >=768px regardless of these classes.
  const ticketsHidden = step !== 'tickets' ? 'order-flow-pane--hidden' : '';
  const menuHidden = step !== 'menu' ? 'order-flow-pane--hidden' : '';

  return (
    <main className="order-flow-layout">
      {/* --- LEFT: ACTIVE TICKETS (30%) --- */}
      <section className={`order-flow-pane order-flow-tickets ${ticketsHidden}`}>
        <div className="order-flow-tickets-header">
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>
            {t('register.activeTicketsTitle')}
          </h2>
          <button type="button" className="order-flow-new-btn" onClick={startNewTicket}>
            <Icon icon="lucide:plus" />
            {t('register.newTicketShort')}
          </button>
        </div>

        <div className="order-flow-ticket-list">
          {visibleTickets.length === 0 ? (
            <div className="order-flow-empty">
              <Icon icon="lucide:receipt" style={{ fontSize: '2rem', opacity: 0.3 }} />
              <p>{t('register.noActiveTickets')}</p>
            </div>
          ) : (
            visibleTickets.map((ticket) => {
              const isActive = ticket.id === activeTicketId;
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => selectTicket(ticket.id)}
                  className={`order-flow-ticket-card ${isActive ? 'active' : ''}`}
                >
                  <div className="order-flow-ticket-name">
                    <Icon icon="lucide:user" style={{ fontSize: '0.95rem', opacity: 0.7 }} />
                    {ticket.name}
                  </div>
                  <span className="order-flow-ticket-count">{ticketItemCount(ticket)}</span>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* --- RIGHT: MENU (70%) --- */}
      <section className={`order-flow-pane order-flow-menu ${menuHidden}`}>
        <div className="order-flow-menu-header">
          <button
            type="button"
            className="order-flow-back-btn"
            onClick={() => setStep('tickets')}
            aria-label={t('reg.btnBack')}
          >
            <Icon icon="lucide:chevron-left" />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>{activeCategory}</h2>
        </div>

        <div className="category-tabs">
          {orderedCategories.map((category) => (
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
          {Object.keys(safeCategories).length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888', gridColumn: '1 / -1' }}>
              <h3>No menu items found.</h3>
              <p>Head over to the Admin dashboard to create your first category!</p>
            </div>
          ) : (
            currentProducts.map((item) => (
              <button key={item.id} onClick={() => handleItemClick(item)} className="item-btn">
                <span className="item-name">{item.emoji || ''} {item.name}</span>
                <span className="item-price">{formatForDisplay(item.basePrice)}</span>
              </button>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

export default OrderFlowLayout;
