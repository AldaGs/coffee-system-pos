import { useTranslation } from '../../hooks/useTranslation';

function DiscountModal({ isDiscountModalOpen, setIsDiscountModalOpen, discountForm, setDiscountForm, handleApplyDiscount, handleRemoveDiscount, activeTicket }) {
  const { t } = useTranslation();

  if (!isDiscountModalOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}>
      <div className="modal-content fade-in" style={{ maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: '#8e44ad' }}>{t('discModal.title')}</h2>
          <button onClick={() => setIsDiscountModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            onClick={() => setDiscountForm({ ...discountForm, type: 'percentage' })} 
            style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 'bold', border: `2px solid ${discountForm.type === 'percentage' ? '#8e44ad' : 'var(--border)'}`, background: discountForm.type === 'percentage' ? '#f5eef8' : 'var(--bg-main)', color: discountForm.type === 'percentage' ? '#8e44ad' : 'var(--text-main)' }}
          >
            {t('discModal.perc')}
          </button>
          <button 
            onClick={() => setDiscountForm({ ...discountForm, type: 'flat' })} 
            style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 'bold', border: `2px solid ${discountForm.type === 'flat' ? '#8e44ad' : 'var(--border)'}`, background: discountForm.type === 'flat' ? '#f5eef8' : 'var(--bg-main)', color: discountForm.type === 'flat' ? '#8e44ad' : 'var(--text-main)' }}
          >
            {t('discModal.flat')}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>
            {discountForm.type === 'percentage' ? t('discModal.labelPerc') : t('discModal.labelFlat')}
          </label>
          <input 
            type="number" 
            step={discountForm.type === 'percentage' ? "1" : "0.01"} 
            placeholder={discountForm.type === 'percentage' ? t('discModal.placePerc') : t('discModal.placeFlat')} 
            value={discountForm.value} 
            onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })} 
            style={{ width: '100%', padding: '15px', fontSize: '1.5rem', textAlign: 'center', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)' }} 
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {activeTicket?.discount && (
            <button onClick={handleRemoveDiscount} style={{ flex: 1, padding: '16px', background: 'transparent', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>
              {t('discModal.btnRemove')}
            </button>
          )}
          <button onClick={handleApplyDiscount} style={{ flex: 2, padding: '16px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>
            {t('discModal.btnApply')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DiscountModal;