import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import TicketImage from '../register/TicketImage';
import PinChallengeModal from '../register/PinChallengeModal';
import { usePinChallenge } from '../../hooks/usePinChallenge';
import { useDialog } from '../../hooks/useDialog';
import { gateRegisterAction, showOverrideLock } from '../../utils/actionGate';
import { useMenuStore } from '../../store/useMenuStore';
import { SortableDataTable } from '../ui/arc';
import InfoTip from '../shared/InfoTip';
import { useRefund } from './orders/useRefund';
import { useOrderActions, getOrderTicket } from './orders/useOrderActions';
import { OrderBadges, OrderTotals, OrderActions } from './orders/OrderCells';
import { RefundModal, CfdiFolioModal } from './orders/OrderModals';
import OrdersFilters from './orders/OrdersFilters';

function OrdersTab({ dexieSales, generalSettings, menuData, timeFilter, setTimeFilter, dateRange, setDateRange }) {
  const { t, lang } = useTranslation();
  const { recipes } = useMenuStore();
  const { showAlert, showPrompt, showConfirm } = useDialog();
  const [search, setSearch] = useState('');

  const { challenge: pinChallenge, setChallenge: setPinChallenge, requirePin } = usePinChallenge();

  // For strictRegisterOverrides + lock-icon hints. activeCashier in admin
  // contexts comes from localStorage (Register sets it on unlock).
  const posSettings = menuData?.posSettings;
  let activeCashier = null;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('tinypos_activeCashier') : null;
    if (raw) activeCashier = JSON.parse(raw);
  } catch { /* noop */ }
  const refundLocked = showOverrideLock(posSettings, activeCashier);

  const refund = useRefund({ recipes, showAlert, t });
  const actions = useOrderActions({ menuData, generalSettings, posSettings, activeCashier, requirePin, recipes, showAlert, showPrompt, showConfirm, t, lang });
  const { sharingOrder, cfdiModal } = actions;
  const onRefund = (order) => gateRegisterAction({
    posSettings, activeCashier, requirePin,
    title: t('orders.promptPin'),
    run: () => refund.openRefund(order),
  });

  // Match ticket name ("5E2 - Pururu (#82)"), ticket id, or row id. Scoped to the time filter above.
  const q = search.trim().toLowerCase();
  const visibleSales = q
    ? dexieSales.filter(o => [o.order_name, o.ticket_id, o.local_id, o.id].some(v => v != null && String(v).toLowerCase().includes(q)))
    : dexieSales;
  const orderRows = visibleSales.map(order => ({
    id: String(order.id),
    order,
    name: order.order_name || (order.ticket_id ? order.ticket_id.slice(-6) : `#${order.id}`),
    created: new Date(order.created_at).getTime() || 0,
    cashier: order.cashier_name || '',
    total: Number(order.total_amount) || 0,
    actions: '',
  }));
  const orderColumns = [
    { key: 'name', label: t('orders.colOrder'), render: (_, row) => <OrderBadges order={row.order} t={t} /> },
    { key: 'created', label: t('orders.colDate'), numeric: false, render: (value) => new Date(value).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US') },
    { key: 'cashier', label: t('orders.colCashier') },
    { key: 'total', label: t('orders.colTotal'), numeric: true, render: (_, row) => <OrderTotals order={row.order} t={t} /> },
    { key: 'actions', label: t('orders.colActions'), sortable: false, render: (_, row) => <OrderActions order={row.order} actions={actions} onRefund={onRefund} refundLocked={refundLocked} t={t} /> },
  ];

  return (
    <div className="admin-section fade-in">
      {/* Hidden capture target for PNG generation */}
      {sharingOrder && (
        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
          <TicketImage
            id={`order-capture-${sharingOrder.id}`}
            ticket={getOrderTicket(sharingOrder)}
            total={sharingOrder.total_amount}
            receiptSettings={menuData?.receiptSettings || {}}
            lang={lang}
            t={t}
          />
        </div>
      )}

      <div className="admin-section-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('orders.title')}{' '}<InfoTip text={t('pageInfo.orders')} section="orders" /></h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('orders.subtitle')}</p>
        </div>
        <OrdersFilters search={search} setSearch={setSearch} timeFilter={timeFilter} setTimeFilter={setTimeFilter} dateRange={dateRange} setDateRange={setDateRange} t={t} lang={lang} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {dexieSales.length > 0 && visibleSales.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', fontWeight: 'bold' }}>
            {lang === 'es' ? `Sin resultados para "${search}"` : `No results for "${search}"`}
          </p>
        )}
        {visibleSales.length > 0 && (
          <div className="arc">
            <SortableDataTable
              rows={orderRows}
              columns={orderColumns}
              rowKey="id"
              caption={t('orders.tableCaption')}
              defaultSort={{ key: 'created', direction: 'desc' }}
              itemName={{ one: t('orders.itemOne'), other: t('orders.itemOther') }}
            />
          </div>
        )}
        {dexieSales.length === 0 && (
          <div style={{ padding: '80px 20px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '24px', border: '2px dashed var(--border)' }}>
            <Icon icon="lucide:receipt" style={{ fontSize: '4rem', color: 'var(--text-muted)', opacity: 0.2, marginBottom: '20px' }} />
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>
              {t('orders.noHistory')}
            </p>
          </div>
        )}
      </div>

      {/* PIN CHALLENGE MODAL */}
      <PinChallengeModal challenge={pinChallenge} setChallenge={setPinChallenge} activeCashier={null} showAlert={showAlert} />

      {refund.refundModal.isOpen && <RefundModal refund={refund} t={t} />}
      {cfdiModal.isOpen && <CfdiFolioModal actions={actions} t={t} />}
    </div>
  );
}

export default OrdersTab;
