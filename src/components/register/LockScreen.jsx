import { useTranslation } from '../../hooks/useTranslation';
import { useNavigate } from 'react-router-dom';

function LockScreen({ posSettings, cashiers, selectedProfile, setSelectedProfile, pinAttempt, setPinAttempt, handlePinKeyDown, phoneError, handleUnlockSubmit }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div style={{ position: 'relative', height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <h1 style={{ color: 'var(--brand-color)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '1rem' }}>{posSettings?.name || "Register"}</h1>
      <h2 style={{ color: 'var(--text-main)', marginBottom: '40px', marginTop: 0 }}>{t('lock.who')}</h2>

      {!selectedProfile ? (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {cashiers.map(cashier => (
            <button key={cashier.id} onClick={() => setSelectedProfile(cashier)} style={{ height: '120px', width: '120px', borderRadius: '16px', border: 'none', background: 'var(--bg-surface)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'transform 0.1s' }} onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}>
              <div style={{ height: '50px', width: '50px', borderRadius: '25px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                {cashier.name.charAt(0)}
              </div>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{cashier.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <h2 style={{ color: 'var(--text-main)', margin: 0 }}>{t('lock.welcome')} {selectedProfile.name}</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('lock.enterPin')}</p>
          <input type="password" maxLength="4" autoFocus value={pinAttempt} onChange={(e) => setPinAttempt(e.target.value)} onKeyDown={handlePinKeyDown} className={phoneError ? 'input-error-shake' : ''} style={{ padding: '15px', fontSize: '2rem', width: '150px', textAlign: 'center', letterSpacing: '8px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none' }} />
          <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <button onClick={() => { setSelectedProfile(null); setPinAttempt(''); }} style={{ flex: 1, padding: '15px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>{t('lock.btnBack')}</button>
            <button onClick={handleUnlockSubmit} style={{ flex: 2, padding: '15px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>{t('lock.btnUnlock')}</button>
          </div>
        </div>
      )}

      {/* Centered Admin Button at the bottom */}
      <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)' }}>
        <button
          onClick={() => navigate('/admin')}
          className="admin-btn"
          style={{
            width: 'calc(100vw - 200px)',
            maxWidth: '500px',
            borderRadius: '9999px'
          }}
        >
          {t('menuArea.admin')}
        </button>
      </div>
    </div>
  );
}

export default LockScreen;