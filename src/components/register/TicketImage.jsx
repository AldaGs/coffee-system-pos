import { useTranslation } from '../../hooks/useTranslation';
import { calculateTaxBreakdown } from '../../utils/posMath';
import { formatForDisplay } from '../../utils/moneyUtils';

const TicketImage = ({ id, ticket, receiptSettings, total }) => {
  const { t } = useTranslation();

  if (!ticket) return null;

  let rawSubtotal = 0;
  ticket.items.forEach(item => {
    const qty = item.qty || 1;
    let itemTotal = item.basePrice || 0;
    (item.selectedModifiers || []).forEach(mod => {
      itemTotal += mod.price || 0;
    });
    rawSubtotal += itemTotal * qty;
  });

  const taxInfo = receiptSettings?.enableTaxBreakdown
    ? calculateTaxBreakdown(total, receiptSettings.taxRate || 16)
    : null;

  return (
    <div id={id || "ticket-image-container"} style={{ width: '300px', background: 'white', padding: '20px', color: 'black', fontFamily: 'Courier New, Courier, monospace', fontSize: '14px', lineHeight: '1.2' }}>
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        {receiptSettings?.logo && (
          <img
            src={receiptSettings.logo}
            alt="Store Logo"
            style={{ maxWidth: '150px', maxHeight: '80px', marginBottom: '10px' }}
          />
        )}
        <h2 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>{receiptSettings?.header || ''}</h2>
        {receiptSettings?.subheader && (
          <p style={{ margin: '0', fontSize: '12px', whiteSpace: 'pre-line' }}>{receiptSettings.subheader}</p>
        )}
      </div>

      <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

      <div style={{ margin: '10px 0', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Ticket: {ticket.name || ticket.order_name || `#${ticket.id}`}</span>
          <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
        </div>
        <div>{new Date(ticket.created_at).toLocaleTimeString()}</div>
      </div>

      <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

      <div>
        {ticket.items.map((item, idx) => {
          const qty = item.qty || 1;
          const itemNameWithEmoji = `${item.emoji || '•'} ${item.name}`;

          return (
            <div key={idx} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{qty > 1 ? `${itemNameWithEmoji} x${qty}` : itemNameWithEmoji}</span>
                <span>{formatForDisplay(item.basePrice * qty)}</span>
              </div>
              {(item.selectedModifiers || []).map((mod, midx) => {
                return (
                  <div key={midx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingLeft: '10px' }}>
                    <span>+ {mod.name}{mod.textValue ? `: "${mod.textValue}"` : ''}</span>
                    <span>{mod.price > 0 ? `+${formatForDisplay(mod.price)}` : ''}</span>
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
            <span>{formatForDisplay(rawSubtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('disc.title')}</span>
            <span>-{formatForDisplay(rawSubtotal - total)}</span>
          </div>
          <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>
        </>
      )}

      {taxInfo && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal</span>
            <span>{formatForDisplay(taxInfo.subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{receiptSettings.taxLabel || 'IVA'} ({receiptSettings.taxRate}%)</span>
            <span>{formatForDisplay(taxInfo.tax)}</span>
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', fontSize: '22px', fontWeight: 'bold', marginTop: '15px', borderTop: '2px solid black', paddingTop: '10px' }}>
        <span>TOTAL</span>
        <span>{formatForDisplay(total)}</span>
      </div>

      <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

      <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', fontStyle: 'italic' }}>
        <p>{receiptSettings?.footer || '¡Gracias por su compra!'}</p>
      </div>
    </div>
  );
};

export default TicketImage;
