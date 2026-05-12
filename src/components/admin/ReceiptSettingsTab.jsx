import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay } from '../../utils/moneyUtils';
import { calculateTaxBreakdown } from '../../utils/posMath';
import { numeroALetras } from '../../utils/numeroALetras';

function ReceiptSettingsTab({ receiptForm, setReceiptForm, handleLogoUpload, handleSaveReceipt }) {
  const { t } = useTranslation();

  const previewItems = [
    { emoji: '☕', name: 'Americano', qty: 1, basePrice: 4500, selectedModifiers: [] },
    { emoji: '🥛', name: 'Flat White', qty: 1, basePrice: 5500, selectedModifiers: [{ name: 'Oat milk', price: 500 }] },
    { emoji: '🥐', name: 'Croissant', qty: 1, basePrice: 3500, selectedModifiers: [] },
  ];
  const previewTotal = previewItems.reduce((sum, it) => {
    const modSum = (it.selectedModifiers || []).reduce((s, m) => s + (m.price || 0), 0);
    return sum + (it.basePrice + modSum) * (it.qty || 1);
  }, 0);
  const previewTaxInfo = receiptForm.enableTaxBreakdown
    ? calculateTaxBreakdown(previewTotal, receiptForm.taxRate || 16)
    : null;
  const previewNow = new Date();

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('receipt.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('receipt.subtitle')}</p>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'flex-start' }}>

        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:image" style={{ color: 'var(--brand-color)' }} />
              {t('receipt.logoLabel')}
            </label>
            <div style={{ padding: '20px', border: '2px dashed var(--border)', borderRadius: '16px', textAlign: 'center', background: 'var(--bg-main)' }}>
              <input type="file" accept="image/png" id="receipt-logo" onChange={handleLogoUpload} style={{ display: 'none' }} />
              <label htmlFor="receipt-logo" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:upload-cloud" style={{ fontSize: '2rem', color: 'var(--brand-color)', opacity: 0.5 }} />
                <span style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('receipt.logoHelp') || 'Upload transparent PNG'}</span>
              </label>
            </div>
            {receiptForm.logo && (
              <button onClick={() => setReceiptForm({ ...receiptForm, logo: null })} style={{ alignSelf: 'flex-start', background: 'rgba(231, 76, 60, 0.05)', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icon icon="lucide:trash-2" />
                {t('receipt.removeLogo')}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:type" style={{ color: 'var(--brand-color)' }} />
              {t('receipt.headerLabel')}
            </label>
            <input type="text" value={receiptForm.header} onChange={(e) => setReceiptForm({ ...receiptForm, header: e.target.value })} style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:map-pin" style={{ color: 'var(--brand-color)' }} />
              {t('receipt.subheaderLabel')}
            </label>
            <input type="text" value={receiptForm.subheader} onChange={(e) => setReceiptForm({ ...receiptForm, subheader: e.target.value })} style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:message-square-text" style={{ color: 'var(--brand-color)' }} />
              {t('receipt.footerLabel')}
            </label>
            <textarea rows="3" value={receiptForm.footer} onChange={(e) => setReceiptForm({ ...receiptForm, footer: e.target.value })} style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontFamily: 'inherit', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', resize: 'vertical' }} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px', marginTop: '8px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
              <Icon icon="lucide:percent" style={{ color: 'var(--brand-color)' }} />
              {t('receipt.taxSection')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t('receipt.enableTaxLabel')}</label>
                <select value={receiptForm.enableTaxBreakdown || false} onChange={(e) => setReceiptForm({ ...receiptForm, enableTaxBreakdown: e.target.value === 'true' })} style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                  <option value={false}>{t('receipt.taxNo')}</option>
                  <option value={true}>{t('receipt.taxYes')}</option>
                </select>
                <small style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('receipt.taxHelp')}</small>
              </div>

              {receiptForm.enableTaxBreakdown && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} className="fade-in">
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t('receipt.taxRateLabel')}</label>
                  <div style={{ position: 'relative' }}>
                    <input type="number" value={receiptForm.taxRate || 16} onChange={(e) => setReceiptForm({ ...receiptForm, taxRate: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }} />
                    <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: 'var(--text-muted)' }}>%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button onClick={handleSaveReceipt} style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: '900', fontSize: '1.1rem', marginTop: '10px', boxShadow: '0 8px 20px rgba(39, 174, 96, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <Icon icon="lucide:save" />
            {t('receipt.btnSave')}
          </button>
        </div>

        {/* LIVE PREVIEW SECTION */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', height: 'fit-content' }}>
          <h3 style={{ marginTop: 0, alignSelf: 'flex-start', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '16px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800', marginBottom: '24px' }}>
            <Icon icon="lucide:eye" style={{ color: 'var(--brand-color)' }} />
            {t('receipt.previewTitle')}
          </h3>
          <div style={{ width: '300px', background: 'white', padding: '20px', color: 'black', fontFamily: 'Courier New, Courier, monospace', fontSize: '14px', lineHeight: '1.2', border: '1px solid #ddd', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderRadius: '4px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              {receiptForm.logo && (
                <img src={receiptForm.logo} alt={t('receipt.logoAlt')} style={{ maxWidth: '150px', maxHeight: '80px', marginBottom: '10px' }} />
              )}
              <h2 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>{receiptForm.header || ''}</h2>
              {receiptForm.subheader && (
                <p style={{ margin: '0', fontSize: '12px', whiteSpace: 'pre-line' }}>{receiptForm.subheader}</p>
              )}
            </div>

            <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

            <div style={{ margin: '10px 0', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Ticket: #PREVIEW</span>
                <span>{previewNow.toLocaleDateString()}</span>
              </div>
              <div>{previewNow.toLocaleTimeString()}</div>
            </div>

            <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

            <div>
              {previewItems.map((item, idx) => {
                const qty = item.qty || 1;
                const itemNameWithEmoji = `${item.emoji || '•'} ${item.name}`;
                return (
                  <div key={idx} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{qty > 1 ? `${itemNameWithEmoji} x${qty}` : itemNameWithEmoji}</span>
                      <span>{formatForDisplay(item.basePrice * qty)}</span>
                    </div>
                    {(item.selectedModifiers || []).map((mod, midx) => (
                      <div key={midx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingLeft: '10px' }}>
                        <span>+ {mod.name}</span>
                        <span>{mod.price > 0 ? `+${formatForDisplay(mod.price)}` : ''}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

            {previewTaxInfo && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span>{formatForDisplay(previewTaxInfo.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{receiptForm.taxLabel || 'IVA'} ({receiptForm.taxRate || 16}%)</span>
                  <span>{formatForDisplay(previewTaxInfo.tax)}</span>
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', fontSize: '22px', fontWeight: 'bold', marginTop: '15px', borderTop: '2px solid black', paddingTop: '10px' }}>
              <span>TOTAL</span>
              <span>{formatForDisplay(previewTotal)}</span>
            </div>

            <div style={{ textAlign: 'center', fontSize: '10px', fontWeight: 'bold', marginTop: '5px', textTransform: 'uppercase' }}>
              {numeroALetras(previewTotal)}
            </div>

            <div style={{ borderTop: '1px dashed black', margin: '10px 0' }}></div>

            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', fontStyle: 'italic' }}>
              <p>{receiptForm.footer || '¡Gracias por su compra!'}</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default ReceiptSettingsTab;