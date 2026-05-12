import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';

function LoyaltyModal({ loyaltyModal, setLoyaltyModal, menuData, handleCheckLoyalty, handleRedeemReward, handleGuestReceipt, phoneError, sendFinalMessage, isAdvancedMode }) {
  const { t } = useTranslation();

  if (!loyaltyModal.isOpen) return null;
  const isLoyaltyActive = menuData?.loyaltySettings?.isActive === true || menuData?.loyaltySettings?.isActive === "true";
  const effectiveLoyaltyActive = isAdvancedMode && isLoyaltyActive;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (effectiveLoyaltyActive) {
        handleCheckLoyalty();
      } else {
        handleGuestReceipt();
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: 'var(--text-main)' }}>{isAdvancedMode ? t('loy.title') : t('loy.titleLite')}</h2>
          <button 
            onClick={() => setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null })} 
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon icon="lucide:x" />
          </button>
        </div>

        {loyaltyModal.step === 'phone' && (
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
              {effectiveLoyaltyActive ? t('loy.checkPhone') : t('loy.sendPhone')}
            </p>
            
            <input 
              type="tel" 
              maxLength="10" 
              placeholder={t('loy.placeholder')} 
              value={loyaltyModal.phone} 
              onChange={(e) => setLoyaltyModal({ ...loyaltyModal, phone: e.target.value })} 
              onKeyDown={handleKeyDown} 
              className={phoneError ? 'input-error-shake' : ''} 
              style={{ width: '100%', padding: '15px', fontSize: '1.5rem', letterSpacing: '2px', textAlign: 'center', marginBottom: '20px', borderRadius: '8px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', boxSizing: 'border-box', outline: 'none' }} 
            />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {effectiveLoyaltyActive && (
                <button onClick={handleCheckLoyalty} style={{ width: '100%', padding: '15px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  {t('loy.btnCheck')}
                </button>
              )}
              <button onClick={handleGuestReceipt} style={{ width: '100%', padding: '15px', background: effectiveLoyaltyActive ? 'transparent' : '#25D366', color: effectiveLoyaltyActive ? 'var(--text-muted)' : 'white', border: effectiveLoyaltyActive ? '1px solid var(--border)' : 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>
                {effectiveLoyaltyActive ? t('loy.btnSendOnly') : t('loy.btnSendNormal')}
              </button>
            </div>
          </div>
        )}

        {loyaltyModal.step === 'result' && loyaltyModal.data && (
          <div>
            {loyaltyModal.data.isCompleted && (
              <div style={{ padding: '12px', marginBottom: '16px', background: 'rgba(46, 204, 113, 0.1)', color: '#27ae60', border: '1px solid rgba(46, 204, 113, 0.3)', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <Icon icon="lucide:check-circle" />
                {t('loy.programCompleted') || 'This customer has completed the program.'}
              </div>
            )}
            {loyaltyModal.data.isRewardReady ? (
              <div style={{ background: 'rgba(255, 20, 147, 0.05)', border: '2px solid #ff1493', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <Icon icon="lucide:party-popper" style={{ fontSize: '3rem', color: '#ff1493' }} />
                </div>
                <h2 style={{ color: '#ff1493', margin: '0 0 10px 0' }}>{t('loy.rewardReady')}</h2>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>
                  <strong>{t('loy.tellCustomer')}</strong><br />
                  {t('loy.rewardMsg').replace('{{num}}', loyaltyModal.data.visits).replace('{{reward}}', loyaltyModal.data.reward)}
                </p>
                {loyaltyModal.data.isProjection && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '12px 0 0 0', fontStyle: 'italic' }}>
                    ★ {loyaltyModal.data.currentVisits} → {loyaltyModal.data.visits} {t('loy.afterPay') || '(after payment)'}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ background: 'var(--bg-main)', border: '2px solid var(--border)', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
                <h2 style={{ color: 'var(--brand-color)', margin: '0 0 10px 0' }}>{t('loy.visitLabel')}{loyaltyModal.data.visits}</h2>
                {loyaltyModal.data.isProjection && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 8px 0', fontStyle: 'italic' }}>
                    ★ {loyaltyModal.data.currentVisits} + {loyaltyModal.data.earnedToday} {t('loy.afterPay') || '(after payment)'}
                  </p>
                )}
                <div style={{ fontSize: '1.5rem', margin: '10px 0', display: 'flex', justifyContent: 'center', gap: '5px' }}>
                  {[...Array(loyaltyModal.data.visits % loyaltyModal.data.target || loyaltyModal.data.target)].map((_, i) => (
                    <Icon key={i} icon="lucide:star" style={{ color: '#f1c40f' }} />
                  ))}
                </div>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>
                  <strong>{t('loy.tellCustomer')}</strong><br />
                  {t('loy.statusMsg')
                    .replace('{{num}}', loyaltyModal.data.visits)
                    .replace('{{needed}}', loyaltyModal.data.target - (loyaltyModal.data.visits % loyaltyModal.data.target))
                    .replace('{{reward}}', loyaltyModal.data.reward)}
                </p>
              </div>
            )}
            {loyaltyModal.data.canRedeem && (
              <button
                onClick={handleRedeemReward}
                style={{ width: '100%', padding: '15px', background: '#ff1493', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '10px' }}
              >
                <Icon icon="lucide:gift" style={{ fontSize: '1.4rem' }} />
                {t('loy.btnApplyReward') || 'Apply free reward'}
              </button>
            )}
            {loyaltyModal.data.justRedeemed && (
              <div style={{ padding: '12px', marginBottom: '10px', background: 'rgba(46, 204, 113, 0.1)', color: '#27ae60', borderRadius: '8px', fontWeight: 'bold' }}>
                <Icon icon="lucide:check-circle" style={{ marginRight: '6px' }} />
                {t('loy.redeemedNotice') || 'Reward applied to this ticket.'}
              </div>
            )}
            <button onClick={() => sendFinalMessage(loyaltyModal.phone.replace(/\D/g, ''), loyaltyModal.data)} style={{ width: '100%', padding: '15px', background: '#25D366', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <Icon icon="mdi:whatsapp" style={{ fontSize: '1.4rem' }} />
              {t('loy.btnSendWA')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoyaltyModal;