import { Icon } from '@iconify/react';
import { formatForDisplay } from '../../../utils/moneyUtils';
import { canReopenSale } from '../../../services/reopenService';

// Pieces of an order row, shared by the sortable table's cells.
export function OrderBadges({ order, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.9rem' }}>
      {order.order_name ? (
        <>
          <span style={{ fontWeight: 'bold', fontSize: '1.3rem', color: 'var(--text-main)' }}>
            {order.order_name}
          </span>
          {order.ticket_id && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', background: 'var(--bg-main)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              {order.ticket_id.slice(-6)}
            </span>
          )}
        </>
      ) : order.ticket_id ? (
        <span style={{ fontWeight: 'bold', fontSize: '1.3rem', color: 'var(--text-main)' }}>
          {order.ticket_id.slice(-6)}
        </span>
      ) : (
        <span style={{ fontWeight: 'bold', fontSize: '1.3rem', color: 'var(--text-main)' }}>
          #{order.id}
        </span>
      )}

      {order.status === 'refunded' && (
        <span style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(231, 76, 60, 0.2)' }}>
          <Icon icon="lucide:x-circle" />
          {t('orders.voided')}
        </span>
      )}
      {order.status === 'partial_refund' && (
        <span style={{ background: 'rgba(243, 156, 18, 0.1)', color: '#f39c12', padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(243, 156, 18, 0.2)' }}>
          <Icon icon="lucide:alert-triangle" />
          {t('orders.partial')}
        </span>
      )}
      {order.status === 'completed' && (
        <span style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#27ae60', padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(46, 204, 113, 0.2)' }}>
          <Icon icon="lucide:check-circle-2" />
          {t('orders.completed')}
        </span>
      )}
      {order.cfdi_status === 'requested' && (
        <span style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#2980b9', padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(52, 152, 219, 0.2)' }}>
          <Icon icon="lucide:file-text" />
          CFDI Solicitado
        </span>
      )}
      {order.cfdi_status === 'issued' && (
        <span style={{ background: 'rgba(155, 89, 182, 0.1)', color: '#8e44ad', padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(155, 89, 182, 0.2)' }}>
          <Icon icon="lucide:file-check" />
          CFDI Emitido
        </span>
      )}
    </div>
  );
}

export function OrderTotals({ order, t }) {
  return (
    <div style={{ textAlign: 'inherit' }}>
      {(() => {
        const autoAmt = order.discount?.autoDiscountAmount || 0;
        const manualAmt = order.discount?.manualDiscountAmount || 0;
        const totalDisc = autoAmt + manualAmt;
        if (totalDisc <= 0) return null;
        const manualLabel = order.discount?.type === 'percentage'
          ? `${t('ticket.discount')} (${order.discount.value}%)`
          : t('ticket.discount');
        return (
          <>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'inherit' }}>
              {t('ticket.subtotal')}: {formatForDisplay((order.total_amount || 0) + totalDisc)}
            </div>
            <div style={{ color: '#27ae60', fontWeight: '700', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'inherit', gap: '4px' }}>
              <Icon icon="lucide:tag" style={{ fontSize: '0.85rem' }} />
              {manualAmt > 0 ? manualLabel : t('ticket.discount')} -{formatForDisplay(totalDisc)}
            </div>
          </>
        );
      })()}
      <div style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--text-main)', textDecoration: order.status === 'refunded' ? 'line-through' : 'none', letterSpacing: '-1px' }}>
        {formatForDisplay(order.total_amount || 0)}
      </div>
      {order.refund_amount > 0 && (
        <div style={{ color: '#e74c3c', fontWeight: '800', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'inherit', gap: '4px' }}>
          <Icon icon="lucide:undo-2" />
          -{formatForDisplay(order.refund_amount)} {t('orders.refundedLabel')}
        </div>
      )}
    </div>
  );
}

export function OrderActions({ order, actions, onRefund, refundLocked, t }) {
  const { handlePrint, handleSharePNG, handleShareWA, handleShareCFDI, setCfdiModal, handleReopen } = actions;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handlePrint(order)}
            title={t('ticket.btnPrint')}
            style={{ padding: '10px', background: 'rgba(52, 152, 219, 0.1)', color: '#3498db', border: 'none', borderRadius: '12px', cursor: 'pointer' }}
          >
            <Icon icon="lucide:printer" />
          </button>
          <button
            onClick={() => handleSharePNG(order)}
            title={t('ticket.btnShare')}
            style={{ padding: '10px', background: 'rgba(230, 126, 34, 0.1)', color: '#e67e22', border: 'none', borderRadius: '12px', cursor: 'pointer' }}
          >
            <Icon icon="lucide:share-2" />
          </button>
          <button
            onClick={() => handleShareWA(order)}
            title={t('ticket.btnWA')}
            style={{ padding: '10px', background: 'rgba(37, 211, 102, 0.1)', color: '#25D366', border: 'none', borderRadius: '12px', cursor: 'pointer' }}
          >
            <Icon icon="lucide:message-circle" />
          </button>
          <button
            onClick={() => handleShareCFDI(order)}
            title="Factura / CFDI"
            style={{ padding: '10px', background: 'var(--bg-main)', color: '#34495e', border: '1px solid var(--border)', borderRadius: '12px', cursor: 'pointer' }}
          >
            <Icon icon="lucide:file-text" />
          </button>
        </div>

        {order.cfdi_status === 'requested' && (
          <button
            onClick={() => setCfdiModal({ isOpen: true, order })}
            style={{
              padding: '12px 20px',
              background: 'rgba(52, 152, 219, 0.05)',
              color: '#2980b9',
              border: '2px solid rgba(52, 152, 219, 0.2)',
              borderRadius: '16px',
              cursor: 'pointer',
              fontWeight: '900',
              transition: '0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Icon icon="lucide:file-check" /> Emitir CFDI
          </button>
        )}

        {canReopenSale(order) && (
          <button
            onClick={() => handleReopen(order)}
            style={{
              padding: '12px 20px',
              background: 'rgba(41, 128, 185, 0.05)',
              color: '#2980b9',
              border: '2px solid rgba(41, 128, 185, 0.2)',
              borderRadius: '16px',
              cursor: 'pointer',
              fontWeight: '900',
              transition: '0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              textTransform: 'uppercase',
              fontSize: '0.85rem'
            }}
          >
            {refundLocked ? <Icon icon="lucide:lock" /> : <Icon icon="lucide:undo-2" />}
            {t('orders.btnReopen')}
          </button>
        )}

        <button
        onClick={() => onRefund(order)}
          aria-label={refundLocked ? t('settings.lockBadgeAria') : undefined}
          disabled={order.status === 'refunded'}
          style={{
            padding: '12px 20px',
            background: order.status === 'refunded' ? 'var(--bg-main)' : 'rgba(231, 76, 60, 0.05)',
            color: order.status === 'refunded' ? 'var(--text-muted)' : '#e74c3c',
            border: `2px solid ${order.status === 'refunded' ? 'transparent' : 'rgba(231, 76, 60, 0.2)'}`,
            borderRadius: '16px',
            cursor: order.status === 'refunded' ? 'not-allowed' : 'pointer',
            fontWeight: '900',
            transition: '0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            textTransform: 'uppercase',
            fontSize: '0.85rem'
          }}
        >
          {refundLocked ? <Icon icon="lucide:lock" /> : <Icon icon="lucide:rotate-ccw" />}
          {t('orders.btnRefund')}
        </button>
    </div>
  );
}
