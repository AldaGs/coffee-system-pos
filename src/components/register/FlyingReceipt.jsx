import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay } from '../../utils/moneyUtils';

function FlyingReceipt({ successTicket }) {
  const { t } = useTranslation();

  if (!successTicket) return null;

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