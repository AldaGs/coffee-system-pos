function PinChallengeModal({ pinChallenge, setPinChallenge, challengePinAttempt, setChallengePinAttempt, handleChallengeKeyDown, challengeError, handleChallengeSubmit }) {
  if (!pinChallenge.isOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}><div className="modal-content fade-in" style={{ maxWidth: '350px', textAlign: 'center', background: 'var(--bg-surface)' }}>
      <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🛡️</div>
      <h2 style={{ color: 'var(--text-main)', margin: '0 0 10px 0' }}>{pinChallenge.title}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Enter PIN to continue</p>
      <input type="password" maxLength="4" autoFocus value={challengePinAttempt} onChange={(e) => setChallengePinAttempt(e.target.value.replace(/\D/g, ''))} onKeyDown={handleChallengeKeyDown} className={challengeError ? 'input-error-shake' : ''} style={{ padding: '15px', fontSize: '2rem', width: '150px', textAlign: 'center', letterSpacing: '8px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button onClick={() => { setPinChallenge({ isOpen: false, title: "", onAuthorized: null }); setChallengePinAttempt(''); }} style={{ flex: 1, padding: '12px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
        <button onClick={handleChallengeSubmit} style={{ flex: 1, padding: '12px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Verify</button>
      </div>
    </div></div>
  );
}
export default PinChallengeModal;
