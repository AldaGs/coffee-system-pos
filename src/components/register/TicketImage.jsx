import { numeroALetras } from '../../utils/numeroALetras';
import { calculateTaxBreakdown } from '../../utils/posMath';

function TicketImage({ ticket, total, receiptSettings, lang, t, id }) {
  if (!ticket) return null;

  const date = ticket.created_at ? new Date(ticket.created_at) : new Date();
  let rawSubtotal = 0;
  ticket.items.forEach(item => {
    let lineTotal = item.basePrice;
    (item.selectedModifiers || []).forEach(mod => lineTotal += mod.price);
    rawSubtotal += lineTotal * (item.qty || 1);
  });

  const taxInfo = receiptSettings.enableTaxBreakdown 
    ? calculateTaxBreakdown(total, receiptSettings.taxRate || 16) 
    : null;

  return (
    <div 
      id={id} 
      style={{ 
        width: '380px', 
        padding: '30px', 
        background: 'white', 
        color: 'black', 
        fontFamily: 'Courier, monospace', 
        fontSize: '14px',
        lineHeight: '1.4'
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        {receiptSettings.logo && (
          <img 
            src={receiptSettings.logo} 
            alt="Logo" 
            crossOrigin="anonymous"
            style={{ maxWidth: '200px', marginBottom: '10px' }} 
          />
        )}
        <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{receiptSettings.header}</div>
        <div>{receiptSettings.subheader}</div>
      </div>

      <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>
      
      <div style={{ marginBottom: '10px' }}>
        <div>{t('receipt.ticket')} {ticket.name}</div>
        <div>{t('receipt.date')} {date.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')}</div>
      </div>

      <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

      <div>
        {ticket.items.map((item, idx) => {
          const qty = item.qty || 1;
          let lineTotal = item.basePrice;
          (item.selectedModifiers || []).forEach(mod => lineTotal += mod.price);
          lineTotal *= qty;

          return (
            <div key={idx} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{qty > 1 ? `${item.name} x${qty}` : item.name}</span>
                <span>${((item.basePrice * qty) / 100).toFixed(2)}</span>
              </div>
              {(item.selectedModifiers || []).map((mod, midx) => (
                <div key={midx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingLeft: '10px' }}>
                  <span>+ {mod.name}{mod.textValue ? `: "${mod.textValue}"` : ''}</span>
                  <span>{mod.price > 0 ? `+$${(mod.price / 100).toFixed(2)}` : ''}</span>
                </div>
              ))}
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
            <span>IVA ({receiptSettings.taxRate}%)</span>
            <span>${(taxInfo.tax / 100).toFixed(2)}</span>
          </div>
          <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>
        </>
      )}

      <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold', margin: '15px 0' }}>
        TOTAL: ${(total / 100).toFixed(2)}
      </div>
      
      <div style={{ textAlign: 'center', fontSize: '12px', fontStyle: 'italic', marginBottom: '15px' }}>
        {numeroALetras(total / 100)}
      </div>

      <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

      <div style={{ textAlign: 'center', marginTop: '10px' }}>
        {receiptSettings.footer}
      </div>
    </div>
  );
}

export default TicketImage;
