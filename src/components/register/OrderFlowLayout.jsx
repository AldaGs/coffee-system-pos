import { Icon } from '@iconify/react';
import { usePos } from '../../utils/PosContext';
import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay } from '../../utils/moneyUtils';
import { getOrderedVisibleCategories } from '../../utils/categoryUtils';
import RegisterActionBar from './RegisterActionBar';

// OrderFlowLayout — the "Mesas/Pedidos" (Full Service) layout.
//
// A drill-down flow that mirrors how a waiter actually works:
//
//   tickets  ──tap a ticket──▶  ticket content   ──"Add product"──▶  categories  ──tap──▶  items (+modifiers)
//
// The "ticket content" screen is NOT re-implemented here — it reuses the real
// TicketArea (the shared cart). On mobile that surfaces as the slide-up cart
// drawer (minimized to a pill by default); on tablet/desktop it's the
// persistent cart sidebar. Selecting a ticket opens that drawer; its
// "Add product" button (added in TicketArea, orders-mode only) hands control
// back here by advancing `step` to 'categories'.
//
// Navigation `step` is owned by the Register parent so this layout and the
// sibling TicketArea can drive the same flow. Like CafeLayout, this component
// owns NO cart/checkout state — it only pushes tapped items into the ONE shared
// cart via PosContext (handleItemClick).
//
//   • Tablet/Desktop (>=768px): three persistent regions — tickets rail (30%),
//     menu pane (70%), and the TicketArea cart sidebar. `step` only swaps the
//     menu pane between its category grid and item grid.
//   • Mobile (<=767px): one pane at a time, governed by `step`.
function OrderFlowLayout({
  step,
  setStep,
  activeCategory,
  setActiveCategory,
  setIsMobileCartOpen,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  setIsSyncModalOpen,
  setIsExpenseModalOpen,
  setIsCorteModalOpen,
  // Tables layout only: when set, the tickets rail is scoped to one table and
  // shows a "back to floor" control + a table-bound new-ticket flow. Unset in
  // the plain "orders" layout, where everything below behaves as before.
  tableScope = null,
  onBackToFloor,
  onNewTableTicket,
}) {
  const { t } = useTranslation();
  const {
    menuData,
    visibleTickets: allVisibleTickets,
    activeTicket,
    activeTicketId,
    setActiveTicketId,
    handleNewTicket,
    handleItemClick,
  } = usePos();

  // Scope the rail to the selected table when in tables mode.
  const visibleTickets = tableScope
    ? allVisibleTickets.filter(tk => tk.table_id === tableScope.id)
    : allVisibleTickets;

  // Tap a ticket → make it active and open its content (the cart). On mobile
  // that's the slide-up drawer; on desktop the sidebar already shows it, so the
  // drawer flag is a harmless no-op there.
  const selectTicket = (ticketId) => {
    setActiveTicketId(ticketId);
    setIsMobileCartOpen(true);
  };

  // Create a ticket and jump straight to the menu so the first product can be
  // added without an extra tap. handleNewTicket owns id assignment.
  const startNewTicket = async () => {
    if (tableScope) {
      // Prompt seats, create the table-bound ticket, then jump to the menu.
      onNewTableTicket?.(tableScope, () => setStep('categories'));
      return;
    }
    await handleNewTicket();
    setStep('categories');
  };

  // Pick a category → show its items.
  const openCategory = (category) => {
    setActiveCategory(category);
    setStep('items');
  };

  const orderedCategories = getOrderedVisibleCategories(menuData);
  const safeCategories = menuData?.categories || {};
  const currentProducts = safeCategories[activeCategory] || [];
  const hasCategories = Object.keys(safeCategories).length > 0;

  const ticketItemCount = (ticket) =>
    (ticket.items || []).reduce((n, i) => n + (i.qty || 1), 0);

  // Mobile single-pane visibility. The tickets rail owns the 'tickets' step;
  // the menu pane owns 'categories' + 'items'. Desktop CSS overrides --hidden so
  // both stay visible. (The ticket-content screen is the TicketArea drawer,
  // which overlays whichever pane is showing — no pane of its own.)
  const ticketsHidden = step !== 'tickets' ? 'order-flow-pane--hidden' : '';
  const menuHidden = step === 'tickets' ? 'order-flow-pane--hidden' : '';

  const actionBar = (
    <RegisterActionBar
      isMobileMenuOpen={isMobileMenuOpen}
      setIsMobileMenuOpen={setIsMobileMenuOpen}
      setIsSyncModalOpen={setIsSyncModalOpen}
      setIsExpenseModalOpen={setIsExpenseModalOpen}
      setIsCorteModalOpen={setIsCorteModalOpen}
    />
  );

  return (
    <main className="order-flow-layout">
      {/* --- LEFT: ACTIVE TICKETS (30%) --- */}
      <section className={`order-flow-pane order-flow-tickets ${ticketsHidden}`}>
        <div className="order-flow-tickets-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {tableScope && (
              <button type="button" onClick={onBackToFloor}
                aria-label={t('reg.backToFloor')} title={t('reg.backToFloor')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 9999,
                  border: 'none', background: 'var(--brand-color, #3498db)', color: '#fff', fontWeight: 700,
                  fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}>
                <Icon icon="lucide:arrow-left" /> {t('reg.backToFloor')}
              </button>
            )}
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tableScope
                ? `${t('admin.tables')} ${tableScope.number}${tableScope.name ? ` · ${tableScope.name}` : ''}`
                : t('register.activeTicketsTitle')}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" className="order-flow-new-btn" onClick={startNewTicket}>
              <Icon icon="lucide:plus" />
              {t('register.newTicketShort')}
            </button>
            {/* System toolbar lives here on MOBILE — the tickets list is the
                home screen, so Lock/Admin/Corte/Gasto/sync stay reachable even
                before a ticket is opened. Hidden on desktop, where the wide
                menu-pane copy below is used instead. */}
            <div className="desktop-hidden">{actionBar}</div>
          </div>
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

      {/* --- RIGHT: MENU PANE (70%) — swaps between categories and items --- */}
      <section className={`order-flow-pane order-flow-menu ${menuHidden}`}>

        {step === 'items' ? (
          <>
            <div className="order-flow-menu-header">
              {/* Back to the category grid (shown on mobile; on desktop both the
                  grid and items live in this pane so it doubles as a label). */}
              <button
                type="button"
                className="order-flow-back-btn"
                onClick={() => setStep('categories')}
                aria-label={t('register.backToCategories')}
              >
                <Icon icon="lucide:chevron-left" />
              </button>
              <h2 className="order-flow-pane-title">{activeCategory}</h2>
              {actionBar}
            </div>

            {!activeTicket && (
              <div className="order-flow-menu-hint">
                <Icon icon="lucide:hand-pointer" style={{ fontSize: '1.1rem', flexShrink: 0 }} />
                <span>{t('register.selectTicketHint')}</span>
              </div>
            )}

            <div className="menu-grid">
              {currentProducts.map((item) => (
                item.imageUrl ? (
                  <button key={item.id} onClick={() => handleItemClick(item)} className="item-btn item-btn--photo">
                    <span className="item-photo">
                      <img src={item.imageUrl} alt="" loading="lazy" />
                    </span>
                    <span className="item-photo-info">
                      <span className="item-name">{item.name}</span>
                      <span className="item-price">{formatForDisplay(item.basePrice)}</span>
                    </span>
                  </button>
                ) : (
                  <button key={item.id} onClick={() => handleItemClick(item)} className="item-btn">
                    <span className="item-name">{item.emoji || ''} {item.name}</span>
                    <span className="item-price">{formatForDisplay(item.basePrice)}</span>
                  </button>
                )
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="order-flow-menu-header">
              {/* Back to the tickets list (mobile only). */}
              <button
                type="button"
                className="order-flow-back-btn"
                onClick={() => setStep('tickets')}
                aria-label={t('register.backToTickets')}
              >
                <Icon icon="lucide:chevron-left" />
              </button>
              <h2 className="order-flow-pane-title">{t('register.chooseCategory')}</h2>
              {actionBar}
            </div>

            {!activeTicket && (
              <div className="order-flow-menu-hint">
                <Icon icon="lucide:hand-pointer" style={{ fontSize: '1.1rem', flexShrink: 0 }} />
                <span>{t('register.selectTicketHint')}</span>
              </div>
            )}

            {hasCategories ? (
              <div className="menu-grid order-flow-category-grid">
                {orderedCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => openCategory(category)}
                    className="item-btn order-flow-category-btn"
                  >
                    <span className="item-name">{category}</span>
                    <Icon icon="lucide:chevron-right" style={{ fontSize: '1.2rem', opacity: 0.5 }} />
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                <h3>No menu items found.</h3>
                <p>Head over to the Admin dashboard to create your first category!</p>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default OrderFlowLayout;
