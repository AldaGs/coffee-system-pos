import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Icon } from '@iconify/react';

// Shared PIN pad. Auto-verifies on the 4th digit and locks down the whole
// modal (visual dim + pointer-events: none + keyboard blocked) while the
// onSubmit promise is pending, so a fast typist can't append extra digits or
// double-fire verification. On failure the parent flips `error` to true to
// trigger the shake; we treat that flip as "verification finished, let the
// user try again."
export default function SharedPinPad({
  variant = 'fullscreen', // 'fullscreen' | 'modal'
  title,
  subtitle,
  icon,         // Pass an icon name (e.g., 'lucide:lock')
  avatarText,   // OR pass a letter (e.g., 'A' for cashier)
  pin,
  setPin,
  error,
  setError,
  onSubmit,
  onCancel,
  submitText,
  submitIcon = 'lucide:log-in',
  lockoutUntil = null,   // epoch ms; while in the future the pad is frozen
  lockoutText,           // e.g. "Demasiados intentos. Intenta de nuevo en"
}) {

  // --- SERVER LOCKOUT COUNTDOWN ---
  // The database refuses PIN attempts after too many wrong ones (migration
  // 044). Without this the pad would keep saying "wrong PIN" at a cashier
  // whose PIN is right, so freeze the pad and show the time remaining.
  const [secondsLeft, setSecondsLeft] = useState(() =>
    lockoutUntil ? Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000)) : 0);

  useEffect(() => {
    if (!lockoutUntil) { setSecondsLeft(0); return; }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  const cooling = secondsLeft > 0;

  const [isVerifying, setIsVerifying] = useState(false);
  const verifyingRef = useRef(false);

  const handleSubmit = useCallback(async () => {
    if (!onSubmit || verifyingRef.current) return;
    verifyingRef.current = true;
    setIsVerifying(true);
    try {
      await onSubmit();
    } finally {
      verifyingRef.current = false;
      setIsVerifying(false);
    }
  }, [onSubmit]);

  // --- AUTO-VERIFY: trigger as soon as the 4th digit lands ---
  useEffect(() => {
    if (pin.length === 4 && !error && !verifyingRef.current && !cooling) {
      // Defer one tick so we don't setState inside a render commit.
      const timer = setTimeout(() => { handleSubmit(); }, 0);
      return () => clearTimeout(timer);
    }
  }, [pin, error, handleSubmit, cooling]);

  // --- UNIVERSAL KEYBOARD LISTENER (also gated by isVerifying) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isVerifying || cooling) return; // hard lockdown
      if (e.key >= '0' && e.key <= '9') {
        if (setError) setError(false);
        setPin(prev => prev.length < 4 ? prev + e.key : prev);
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length === 4) handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, onCancel, setPin, setError, isVerifying, cooling, handleSubmit]);

  // Single guard for every interactive control inside the pad.
  const lockedOut = isVerifying || cooling;

  const pushDigit = (d) => {
    if (lockedOut) return;
    if (setError) setError(false);
    setPin(prev => prev.length < 4 ? prev + d : prev);
  };
  const backspace = () => {
    if (lockedOut) return;
    setPin(prev => prev.slice(0, -1));
  };
  const cancel = () => {
    // Cancel stays live during a cooldown: staff must be able to back out of
    // a frozen pad rather than wait it out.
    if (isVerifying) return;
    onCancel?.();
  };

  // --- INNER CONTENT ---
  const content = (
    <div
      className={`fade-in ${error ? 'shake' : ''} ${isVerifying ? 'verifying' : ''}`}
      aria-busy={isVerifying || undefined}
      style={{ background: 'var(--bg-surface)', padding: 'clamp(16px, 3vh, 32px)', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 30px 100px rgba(0,0,0,0.15)', textAlign: 'center', border: `2px solid ${error ? '#e74c3c' : 'var(--border)'}`, transition: 'all 0.3s' }}
    >

      {/* Dynamic Header: Avatar OR Icon */}
      {avatarText ? (
        <div style={{ width: 'clamp(44px, 7vh, 64px)', height: 'clamp(44px, 7vh, 64px)', borderRadius: '20px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(1.3rem, 3.5vh, 1.8rem)', fontWeight: '900', margin: '0 auto clamp(12px, 2.5vh, 24px) auto', flexShrink: 0, boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}>
          {avatarText}
        </div>
      ) : (
        <div style={{ width: 'clamp(44px, 7vh, 64px)', height: 'clamp(44px, 7vh, 64px)', background: 'rgba(52, 152, 219, 0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto clamp(12px, 2.5vh, 24px) auto', flexShrink: 0 }}>
          <Icon icon={icon || "lucide:shield-alert"} style={{ fontSize: '2.2rem', color: 'var(--brand-color)' }} />
        </div>
      )}

      <h2 style={{ margin: '0 0 8px 0', fontSize: 'clamp(1.3rem, 3.2vh, 1.8rem)', fontWeight: '900' }}>{title}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'clamp(14px, 3vh, 32px)', fontSize: 'clamp(0.85rem, 1.9vh, 1rem)' }}>{subtitle}</p>

      {cooling && (
        <div
          role="status"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'rgba(231, 76, 60, 0.1)', color: '#c0392b', border: '1px solid rgba(231, 76, 60, 0.35)', borderRadius: '12px', padding: '10px 14px', marginBottom: 'clamp(12px, 2.5vh, 20px)', fontSize: 'clamp(0.8rem, 1.8vh, 0.95rem)', fontWeight: 700 }}
        >
          <Icon icon="lucide:timer" style={{ fontSize: '1.1rem', flexShrink: 0 }} />
          <span>{lockoutText} {secondsLeft}s</span>
        </div>
      )}

      <div style={{
        fontSize: 'clamp(1.7rem, 4vh, 2.5rem)', letterSpacing: '16px', marginBottom: 'clamp(14px, 3vh, 32px)', fontWeight: 'bold', minHeight: 'clamp(54px, 8vh, 80px)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-main)', borderRadius: '20px', border: `2px solid ${error ? '#e74c3c' : 'var(--border)'}`, color: error ? '#e74c3c' : 'var(--text-main)',
        boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.05)'
      }}>
        {pin.replace(/./g, '●') || <span style={{opacity: 0.15, letterSpacing: 'normal', fontSize: '1.2rem'}}>••••</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: 'clamp(46px, 7.5vh, 72px)', gap: 'clamp(6px, 1.2vh, 10px)', marginBottom: 'clamp(12px, 2.5vh, 24px)' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
          <button key={num} disabled={lockedOut} onClick={() => pushDigit(num)} style={{ padding: 0, fontSize: 'clamp(1.1rem, 2.6vh, 1.5rem)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', cursor: lockedOut ? 'not-allowed' : 'pointer', color: 'var(--text-main)', fontWeight: 'bold', transition: 'all 0.2s'}} onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(2px)'; e.currentTarget.style.boxShadow = 'none'; }} onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 0 var(--border)'; }}>{num}</button>
        ))}
        <button disabled={lockedOut} onClick={cancel} style={{ padding: 0, fontSize: 'clamp(1.1rem, 2.6vh, 1.5rem)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', cursor: lockedOut ? 'not-allowed' : 'pointer', color: '#e74c3c', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon icon="lucide:x" />
        </button>
        <button disabled={lockedOut} onClick={() => pushDigit(0)} style={{padding: 0, fontSize: 'clamp(1.1rem, 2.6vh, 1.5rem)', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px', cursor: lockedOut ? 'not-allowed' : 'pointer', color: 'var(--text-main)', fontWeight: 'bold'}}>0</button>
        <button disabled={lockedOut} onClick={backspace} style={{ padding: 0, fontSize: 'clamp(1.1rem, 2.6vh, 1.5rem)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', cursor: lockedOut ? 'not-allowed' : 'pointer', color: 'var(--text-main)', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon icon="lucide:delete" />
        </button>
      </div>

      <button
        onClick={handleSubmit}
        disabled={pin.length !== 4 || isVerifying || cooling}
        style={{ width: '100%', padding: 'clamp(12px, 2.2vh, 20px)', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '20px', cursor: (pin.length !== 4 || isVerifying || cooling) ? 'not-allowed' : 'pointer', fontWeight: '900', fontSize: 'clamp(1rem, 2.4vh, 1.3rem)', boxShadow: pin.length === 4 ? '0 10px 25px rgba(52, 152, 219, 0.3)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: pin.length === 4 ? 1 : 0.5, transition: 'all 0.3s' }}
      >
        {isVerifying ? (
          <div className="spinner" style={{ width: '24px', height: '24px', borderWidth: '3px', borderColor: 'white', borderBottomColor: 'transparent' }} />
        ) : (
          <>
            <Icon icon={submitIcon} />
            {submitText}
          </>
        )}
      </button>
    </div>
  );

  // --- LAYOUT ROUTER ---
  if (variant === 'modal') {
    // safe center + overflow: on short viewports the pad scrolls instead of
    // getting its top and bottom clipped by the centering.
    return <div className="modal-overlay" style={{ zIndex: 1000, alignItems: 'safe center', overflowY: 'auto', padding: 'clamp(12px, 2vh, 24px)' }}>{content}</div>;
  }

  return (
    <div style={{ height:'100dvh', width: '100vw', display: 'flex', backgroundColor: 'var(--bg-surface)', justifyContent: 'center', alignItems: 'safe center', overflowY: 'auto', fontFamily: 'system-ui', color: 'var(--text-main)', textAlign: 'center', padding: 'clamp(12px, 2vh, 32px)'}}>
      {content}
    </div>
  );
}
