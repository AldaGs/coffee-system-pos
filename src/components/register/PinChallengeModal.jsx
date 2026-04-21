import { useEffect } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

function PinChallengeModal({ pinChallenge, setPinChallenge, challengePinAttempt, setChallengePinAttempt, handleChallengeKeyDown, challengeError, handleChallengeSubmit }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!pinChallenge.isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        setChallengePinAttempt(prev => prev.length < 4 ? prev + e.key : prev);
      } else if (e.key === 'Backspace') {
        setChallengePinAttempt(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault(); // 🛑 Kills the "Ghost Click" on background buttons
        if (challengePinAttempt.length === 4) handleChallengeSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault(); // 🛑 Prevents background actions
        setPinChallenge({ isOpen: false, title: "", onAuthorized: null });
        setChallengePinAttempt('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinChallenge.isOpen, challengePinAttempt, handleChallengeSubmit]);

  if (!pinChallenge.isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className={`modal-content fade-in ${challengeError ? 'shake' : ''}`} style={{ maxWidth: '350px', textAlign: 'center', background: 'var(--bg-surface)', padding: '32px', borderRadius: '16px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🛡️</div>
        <h2 style={{ color: 'var(--text-main)', margin: '0 0 10px 0' }}>{pinChallenge.title}</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>{t('pin.managerReq')}</p>
        
        <div style={{ 
          fontSize: '2.5rem', letterSpacing: '16px', marginBottom: '24px', fontWeight: 'bold', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-main)', borderRadius: '12px', border: `1px solid var(--border)`, color: 'var(--text-main)' 
        }}>
          {challengePinAttempt.replace(/./g, '●') || <span style={{opacity: 0.2, letterSpacing: 'normal', fontSize: '1rem'}}>{t('pin.required')}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button key={num} onClick={() => setChallengePinAttempt(prev => prev.length < 4 ? prev + num : prev)} style={{ padding: '18px', fontSize: '1.5rem', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold' }}>{num}</button>
          ))}
          <button onClick={() => { setPinChallenge({ isOpen: false, title: "", onAuthorized: null }); setChallengePinAttempt(''); }} style={{ padding: '18px', fontSize: '0.9rem', background: 'rgba(231, 76, 60, 0.1)', border: 'none', borderRadius: '10px', cursor: 'pointer', color: '#e74c3c', fontWeight: 'bold' }}>{t('pin.btnCancel')}</button>
          <button onClick={() => setChallengePinAttempt(prev => prev.length < 4 ? prev + 0 : prev)} style={{ padding: '18px', fontSize: '1.5rem', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold' }}>0</button>
          <button onClick={() => setChallengePinAttempt(prev => prev.slice(0, -1))} style={{ padding: '18px', fontSize: '1.5rem', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold' }}>⌫</button>
        </div>

        <button 
          onClick={handleChallengeSubmit}
          disabled={challengePinAttempt.length !== 4}
          style={{ width: '100%', padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', opacity: challengePinAttempt.length === 4 ? 1 : 0.5 }}
        >
          {t('pin.btnVerify')}
        </button>
      </div>
    </div>
  );
}

export default PinChallengeModal;