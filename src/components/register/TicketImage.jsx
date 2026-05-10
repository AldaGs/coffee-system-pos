import { useTranslation } from '../../hooks/useTranslation';
import { calculateTaxBreakdown } from '../../utils/taxUtils';

const TicketImage = ({ ticket, receiptSettings, total }) => {
  const { t } = useTranslation();

  // Helper to scale legacy prices
  const scale = (val) => (val > 0 && val < 2000) ? val * 100 : val;

  let rawSubtotal = 0;
  ticket.items.forEach(item => {
    const qty = item.qty || 1;
    let itemTotal = scale(item.basePrice || 0);
    (item.selectedModifiers || []).forEach(mod => {
      itemTotal += scale(mod.price || 0);
    });
    rawSubtotal += itemTotal * qty;
  });

  const taxInfo = receiptSettings?.enableTaxBreakdown 
    ? calculateTaxBreakdown(total, receiptSettings.taxRate || 16)
    : null;

  return (
    <div id="ticket-image-container" style={{ width: '300px', background: 'white', padding: '20px', color: 'black', fontFamily: 'monospace', fontSize: '14px', lineHeight: '1.2' }}>
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <h2 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>{receiptSettings?.storeName || 'Coffee POS'}</h2>
        <p style={{ margin: '0', fontSize: '12px' }}>{receiptSettings?.address || ''}</p>
        <p style={{ margin: '0', fontSize: '12px' }}>{receiptSettings?.phone || ''}</p>
      </div>

      <div style={{ margin: '10px 0', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Ticket: #{ticket.id}</span>
          <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
        </div>
        <div>{new Date(ticket.created_at).toLocaleTimeString()}</div>
      </div>

      <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

      <div>
        {ticket.items.map((item, idx) => {
          const qty = item.qty || 1;
          const itemBase = scale(item.basePrice || 0);
          
          return (
            <div key={idx} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{qty > 1 ? `${item.name} x${qty}` : item.name}</span>
                <span>${((itemBase * qty) / 100).toFixed(2)}</span>
              </div>
              {(item.selectedModifiers || []).map((mod, midx) => {
                const modP = scale(mod.price || 0);
                return (
                  <div key={midx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingLeft: '10px' }}>
                    <span>+ {mod.name}{mod.textValue ? `: "${mod.textValue}"` : ''}</span>
                    <span>{modP > 0 ? `+$${(modP / 100).toFixed(2)}` : ''}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

      {rawSubtotal > total && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('analytics.grossRevenue')}</span>
            <span>${(rawSubtotal / 100).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('disc.title')}</span>
            <span>-${((rawSubtotal - total) / 100).toFixed(2)}</span>
          </div>
          <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>
        </>
      )}

      {taxInfo && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal</span>
            <span>${(taxInfo.subtotal / 100).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{receiptSettings.taxLabel || 'IVA'} ({receiptSettings.taxRate}%)</span>
            <span>${(taxInfo.tax / 100).toFixed(2)}</span>
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', marginTop: '5px' }}>
        <span>TOTAL</span>
        <span>${(total / 100).toFixed(2)}</span>
      </div>

      <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px' }}>
        <p>{receiptSettings?.footer || '¡Gracias por su compra!'}</p>
      </div>
    </div>
  );
};

export default TicketImage;
