import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay } from '../../utils/moneyUtils';

function FlyingReceipt({ successTicket }) {
  const { t } = useTranslation();

  if (!successTicket) return null;

  const autoAmt = successTicket.autoDiscountAmount || 0;
  const manualAmt = successTicket.manualDiscountAmount || 0;
  const hasDiscount = autoAmt > 0 || manualAmt > 0;
  const autoLabel = (successTicket.autoDiscountRuleNames || []).filter(Boolean).join(', ');
  const manualLabel = successTicket.discount?.type === 'percentage'
    ? `${t('ticket.discount')} (${successTicket.discount.value}%)`
    : t('ticket.discount');

  return (
    <div className="flying-receipt">
      <h2 style={{ textAlign: 'center', margin: '0 0 15px 0', fontSize: '2rem', color: '#27ae60' }}>{t('fly.paid')}</h2>
      <div style={{ textAlign: 'center', marginBottom: '15px', fontSize: '1.2rem', fontWeight: 'bold' }}>{successTicket.name}</div>
      <div style={{ marginBottom: '15px' }}>
        {successTicket.items.map(item => (
          <div key={item.uniqueId} className="flying-receipt-row">
            <span>{item.emoji || '•'} {item.name}</span>
            <span>{formatForDisplay(item.basePrice)}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px dashed black', margin: '15px 0' }}></div>
      {hasDiscount && (
        <>
          <div className="flying-receipt-row" style={{ color: '#666' }}>
            <span>{t('ticket.subtotal')}</span>
            <span>{formatForDisplay(successTicket.subtotal)}</span>
          </div>
          {autoAmt > 0 && (
            <div className="flying-receipt-row" style={{ color: '#27ae60' }}>
              <span>{t('ticket.auto')} {autoLabel}</span>
              <span>-{formatForDisplay(autoAmt)}</span>
            </div>
          )}
          {manualAmt > 0 && (
            <div className="flying-receipt-row" style={{ color: '#e74c3c' }}>
              <span>{manualLabel}</span>
              <span>-{formatForDisplay(manualAmt)}</span>
            </div>
          )}
        </>
      )}
      <div className="flying-receipt-row" style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
        <span>{t('fly.total')}</span>
        <span>{formatForDisplay(successTicket.total)}</span>
      </div>
      <div style={{ textAlign: 'center', marginTop: '20px', color: '#666', fontSize: '0.9rem' }}>
        {t('fly.method')} {successTicket.method}
      </div>
    </div>
  );
}

export default FlyingReceipt;