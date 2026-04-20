import { useTranslation } from '../../hooks/useTranslation';

function ReceiptSettingsTab({ receiptForm, setReceiptForm, handleLogoUpload, handleSaveReceipt }) {
  const { t } = useTranslation();

  return (
    <div>
      <h1 style={{ color: 'var(--text-main)' }}>{t('receipt.title')}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>{t('receipt.subtitle')}</p>
      
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t('receipt.logoLabel')}</label>
            <input type="file" accept="image/png" onChange={handleLogoUpload} style={{ padding: '8px', color: 'var(--text-main)' }} />
            {receiptForm.logo && (
              <button onClick={() => setReceiptForm({ ...receiptForm, logo: null })} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '0.9rem' }}>
                {t('receipt.removeLogo')}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t('receipt.headerLabel')}</label>
            <input type="text" value={receiptForm.header} onChange={(e) => setReceiptForm({ ...receiptForm, header: e.target.value })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t('receipt.subheaderLabel')}</label>
            <input type="text" value={receiptForm.subheader} onChange={(e) => setReceiptForm({ ...receiptForm, subheader: e.target.value })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t('receipt.footerLabel')}</label>
            <textarea rows="3" value={receiptForm.footer} onChange={(e) => setReceiptForm({ ...receiptForm, footer: e.target.value })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'inherit', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          </div>

          <h3 style={{ marginTop: '24px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>{t('receipt.taxSection')}</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t('receipt.enableTaxLabel')}</label>
            <select value={receiptForm.enableTaxBreakdown || false} onChange={(e) => setReceiptForm({ ...receiptForm, enableTaxBreakdown: e.target.value === 'true' })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
              <option value={false}>{t('receipt.taxNo')}</option>
              <option value={true}>{t('receipt.taxYes')}</option>
            </select>
            <small style={{ color: 'var(--text-muted)' }}>{t('receipt.taxHelp')}</small>
          </div>

          {receiptForm.enableTaxBreakdown && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t('receipt.taxRateLabel')}</label>
              <input type="number" value={receiptForm.taxRate || 16} onChange={(e) => setReceiptForm({ ...receiptForm, taxRate: parseFloat(e.target.value) || 0 })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
          )}

          <button onClick={handleSaveReceipt} style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>
            {t('receipt.btnSave')}
          </button>
        </div>

        {/* LIVE PREVIEW SECTION */}
        <div style={{ flex: 1, minWidth: '300px', maxWidth: '400px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ marginTop: 0, alignSelf: 'flex-start', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>{t('receipt.previewTitle')}</h3>
          <div style={{ width: '100%', padding: '20px', background: '#fdfdfd', border: '1px solid #ddd', fontFamily: 'monospace', textAlign: 'center', whiteSpace: 'pre-wrap', color: 'black' }}>
            {receiptForm.logo && <img src={receiptForm.logo} alt={t('receipt.logoAlt')} style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain', filter: 'grayscale(100%) contrast(200%)', marginBottom: '10px' }} />}
            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{receiptForm.header}</div>
            <div>{receiptForm.subheader}</div>
            <div style={{ margin: '15px 0' }}>---------------------------------</div>
            <div style={{ textAlign: 'left' }}>               1x Americano       $45.00</div>
            <div style={{ textAlign: 'left' }}>               1x Flat White        $55.00</div>
            <div style={{ textAlign: 'left' }}>               1x Croissant         $35.00</div>
            <div style={{ margin: '15px 0' }}>---------------------------------</div>
            {receiptForm.enableTaxBreakdown && (
              <>
                <div style={{ textAlign: 'left', fontSize: '0.9rem', color: '#555' }}>
                  Subtotal             ${(135 / (1 + ((receiptForm.taxRate || 16) / 100))).toFixed(2)}
                </div>
                <div style={{ textAlign: 'left', fontSize: '0.9rem', color: '#555', marginBottom: '8px' }}>
                  IVA ({receiptForm.taxRate || 16}%)           ${(135 - (135 / (1 + ((receiptForm.taxRate || 16) / 100)))).toFixed(2)}
                </div>
              </>
            )}
            <div style={{ margin: '15px 0', fontSize: '0.9rem' }}>{receiptForm.footer}</div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default ReceiptSettingsTab;