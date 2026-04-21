import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';

function ReceiptSettingsTab({ receiptForm, setReceiptForm, handleLogoUpload, handleSaveReceipt }) {
  const { t } = useTranslation();

  return (
    <div className="admin-section fade-in">
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('receipt.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('receipt.subtitle')}</p>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'flex-start' }}>
        
        <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
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
        <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', height: 'fit-content' }}>
          <h3 style={{ marginTop: 0, alignSelf: 'flex-start', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '16px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800', marginBottom: '24px' }}>
            <Icon icon="lucide:eye" style={{ color: 'var(--brand-color)' }} />
            {t('receipt.previewTitle')}
          </h3>
          <div style={{ width: '100%', maxWidth: '300px', padding: '32px 24px', background: '#fdfdfd', border: '1px solid #ddd', fontFamily: "'Courier New', Courier, monospace", textAlign: 'center', whiteSpace: 'pre-wrap', color: 'black', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderRadius: '4px' }}>
            {receiptForm.logo && <img src={receiptForm.logo} alt={t('receipt.logoAlt')} style={{ maxWidth: '100%', maxHeight: '80px', objectFit: 'contain', filter: 'grayscale(100%) contrast(200%)', marginBottom: '16px' }} />}
            <div style={{ fontWeight: 'bold', fontSize: '1.4rem', textTransform: 'uppercase', marginBottom: '4px' }}>{receiptForm.header}</div>
            <div style={{ fontSize: '0.9rem' }}>{receiptForm.subheader}</div>
            <div style={{ margin: '16px 0', fontSize: '0.8rem', opacity: 0.5 }}>---------------------------------</div>
            <div style={{ textAlign: 'left', fontSize: '0.9rem' }}>1x AMERICANO          $45.00</div>
            <div style={{ textAlign: 'left', fontSize: '0.9rem' }}>1x FLAT WHITE         $55.00</div>
            <div style={{ textAlign: 'left', fontSize: '0.9rem' }}>1x CROISSANT          $35.00</div>
            <div style={{ margin: '16px 0', fontSize: '0.8rem', opacity: 0.5 }}>---------------------------------</div>
            {receiptForm.enableTaxBreakdown && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>SUBTOTAL</span>
                  <span>${(135 / (1 + ((receiptForm.taxRate || 16) / 100))).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>IVA ({receiptForm.taxRate || 16}%)</span>
                  <span>${(135 - (135 / (1 + ((receiptForm.taxRate || 16) / 100)))).toFixed(2)}</span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '16px' }}>
              <span>TOTAL</span>
              <span>$135.00</span>
            </div>
            <div style={{ fontSize: '0.85rem', fontStyle: 'italic', borderTop: '1px dashed #ddd', paddingTop: '12px' }}>{receiptForm.footer}</div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default ReceiptSettingsTab;