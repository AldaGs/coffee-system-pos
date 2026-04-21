import { useTranslation } from '../../hooks/useTranslation';

function LoyaltyModal({ loyaltyModal, setLoyaltyModal, menuData, handleCheckLoyalty, handleGuestReceipt, phoneError, sendFinalMessage }) {
  const { t } = useTranslation();

  if (!loyaltyModal.isOpen) return null;
  const isLoyaltyActive = menuData?.loyaltySettings?.isActive === true || menuData?.loyaltySettings?.isActive === "true";

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (isLoyaltyActive) {
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
          <h2 style={{ margin: 0, color: 'var(--text-main)' }}>{t('loy.title')}</h2>
          <button onClick={() => setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null })} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        {loyaltyModal.step === 'phone' && (
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
              {isLoyaltyActive ? t('loy.checkPhone') : t('loy.sendPhone')}
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
              {isLoyaltyActive && (
                <button onClick={handleCheckLoyalty} style={{ width: '100%', padding: '15px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  {t('loy.btnCheck')}
                </button>
              )}
              <button onClick={handleGuestReceipt} style={{ width: '100%', padding: '15px', background: isLoyaltyActive ? 'transparent' : '#25D366', color: isLoyaltyActive ? 'var(--text-muted)' : 'white', border: isLoyaltyActive ? '1px solid var(--border)' : 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>
                {isLoyaltyActive ? t('loy.btnSendOnly') : t('loy.btnSendNormal')}
              </button>
            </div>
          </div>
        )}

        {loyaltyModal.step === 'result' && loyaltyModal.data && (
          <div>
            {loyaltyModal.data.isRewardReady ? (
              <div style={{ background: '#fff0f5', border: '2px solid #ff69b4', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
                <h1 style={{ margin: '0 0 10px 0', fontSize: '3rem' }}>🎉</h1>
                <h2 style={{ color: '#ff1493', margin: '0 0 10px 0' }}>{t('loy.rewardReady')}</h2>
                <p style={{ fontSize: '1.1rem', color: '#333', margin: 0 }}>
                  <strong>{t('loy.tellCustomer')}</strong><br />
                  {t('loy.rewardMsg').replace('{{num}}', loyaltyModal.data.visits).replace('{{reward}}', loyaltyModal.data.reward)}
                </p>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-main)', border: '2px solid var(--border)', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
                <h2 style={{ color: 'var(--brand-color)', margin: '0 0 10px 0' }}>{t('loy.visitLabel')}{loyaltyModal.data.visits}</h2>
                <div style={{ fontSize: '1.5rem', margin: '10px 0' }}>{"⭐".repeat(loyaltyModal.data.visits % loyaltyModal.data.target || loyaltyModal.data.target)}</div>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>
                  <strong>{t('loy.tellCustomer')}</strong><br />
                  {t('loy.statusMsg')
                    .replace('{{num}}', loyaltyModal.data.visits)
                    .replace('{{needed}}', loyaltyModal.data.target - (loyaltyModal.data.visits % loyaltyModal.data.target))
                    .replace('{{reward}}', loyaltyModal.data.reward)}
                </p>
              </div>
            )}
            <button onClick={() => sendFinalMessage(loyaltyModal.phone.replace(/\D/g, ''), loyaltyModal.data)} style={{ width: '100%', padding: '15px', background: '#25D366', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              {t('loy.btnSendWA')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoyaltyModal;