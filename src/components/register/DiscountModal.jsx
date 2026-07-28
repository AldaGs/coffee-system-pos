import { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

function DiscountModal({ isDiscountModalOpen, setIsDiscountModalOpen, discountForm, setDiscountForm, handleApplyDiscount, handleRemoveDiscount, activeTicket, menuData, handleToggleManualRule, isAdvancedMode }) {
  const { t } = useTranslation();
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(false);

  if (!isDiscountModalOpen) return null;

  const allRules = isAdvancedMode ? (menuData?.discountRules || []) : [];
  const isLive = (r) => r.isActive && !(r.usage === 'once' && r.consumedAt);
  // Attended presets: tap-to-apply cashier rules (e.g. "Cyclist 10%"). Coupon
  // rules (those with a code) are entered by code below, not shown as chips.
  const presetRules = allRules.filter(r => r.trigger === 'manual' && !r.code && isLive(r));
  const activatedIds = activeTicket?.activatedManualRuleIds || [];

  const applyCode = () => {
    const entered = codeInput.trim().toLowerCase();
    if (!entered) return;
    const match = allRules.find(r => r.code && r.code.toLowerCase() === entered && isLive(r));
    if (!match) { setCodeError(true); return; }
    if (!activatedIds.includes(match.id)) handleToggleManualRule(match);
    setCodeInput('');
    setCodeError(false);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}>
      <div className="modal-content fade-in" style={{ maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: '#8e44ad' }}>{t('discModal.title')}</h2>
          <button onClick={() => setIsDiscountModalOpen(false)} aria-label={t('common.close')} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
        </div>

        {presetRules.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '900', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>{t('discModal.presetsTitle')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {presetRules.map(rule => {
                const on = activatedIds.includes(rule.id);
                const amountLabel = rule.kind === 'buyXgetY'
                  ? `${rule.buyQty}×${rule.payQty}`
                  : (rule.type === 'percentage' ? `${rule.value}%` : null);
                return (
                  <button key={rule.id} onClick={() => handleToggleManualRule(rule)}
                    style={{ padding: '10px 14px', borderRadius: '999px', fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', border: `2px solid ${on ? '#8e44ad' : 'var(--border)'}`, background: on ? '#8e44ad' : 'var(--bg-main)', color: on ? 'white' : 'var(--text-main)' }}>
                    {on && <span aria-hidden="true">✓</span>}
                    {rule.name}{amountLabel ? ` · ${amountLabel}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isAdvancedMode && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '900', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>{t('discModal.couponTitle')}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={codeInput}
                onChange={(e) => { setCodeInput(e.target.value); setCodeError(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyCode(); }}
                placeholder={t('discModal.couponPlaceholder')}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `2px solid ${codeError ? '#e74c3c' : 'var(--border)'}`, background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 'bold', textTransform: 'uppercase' }}
              />
              <button onClick={applyCode} style={{ padding: '12px 18px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>{t('discModal.couponApply')}</button>
            </div>
            {codeError && <div style={{ color: '#e74c3c', fontSize: '0.8rem', marginTop: '6px', fontWeight: 'bold' }}>{t('discModal.couponInvalid')}</div>}
            {activatedIds.map(id => allRules.find(r => r.id === id && r.code)).filter(Boolean).map(r => (
              <div key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px', marginRight: '8px', padding: '6px 10px', borderRadius: '999px', background: '#8e44ad', color: 'white', fontSize: '0.85rem', fontWeight: 'bold' }}>
                {r.name}
                <button onClick={() => handleToggleManualRule(r)} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
              </div>
            ))}
          </div>
        )}

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
            min="0"
            max={discountForm.type === 'percentage' ? "100" : undefined}
            step={discountForm.type === 'percentage' ? "1" : "0.01"}
            placeholder={discountForm.type === 'percentage' ? t('discModal.placePerc') : t('discModal.placeFlat')}
            value={discountForm.value}
            onChange={(e) => {
              const raw = e.target.value;
              if (discountForm.type === 'percentage' && raw !== '') {
                const n = parseFloat(raw);
                if (!isNaN(n) && n > 100) return setDiscountForm({ ...discountForm, value: '100' });
                if (!isNaN(n) && n < 0)   return setDiscountForm({ ...discountForm, value: '0' });
              }
              setDiscountForm({ ...discountForm, value: raw });
            }}
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