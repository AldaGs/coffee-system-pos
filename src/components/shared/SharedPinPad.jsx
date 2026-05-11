import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Icon } from '@iconify/react';

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
  submitIcon = 'lucide:log-in'
}) {

  const [isSubmitting, setIsSubmitting] = useState(false);

  const submittingRef = useRef(false);

  const handleSubmit = useCallback(async () => {
    if (!onSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [onSubmit]);

  // --- AUTO SUBMIT ---
  useEffect(() => {
    if (pin.length === 4 && !error && !isSubmitting) {
      // Use a small timeout to avoid calling setState synchronously within an effect
      const timer = setTimeout(() => {
        handleSubmit();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [pin, error, isSubmitting, handleSubmit]);

  // --- UNIVERSAL KEYBOARD LISTENER ---
  useEffect(() => {
    const handleKeyDown = (e) => {
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
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, onCancel, setPin, setError, isSubmitting, handleSubmit]);

  // --- INNER CONTENT (The Premium UI) ---
  const content = (
    <div className={`fade-in ${error ? 'input-error-shake' : ''}`} style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 30px 100px rgba(0,0,0,0.15)', textAlign: 'center', border: `2px solid ${error ? '#e74c3c' : 'var(--border)'}`, transition: 'all 0.3s' }}>
      
      {/* Dynamic Header: Avatar OR Icon */}
      {avatarText ? (
        <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', fontWeight: '900', margin: '0 auto 24px auto', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}>
          {avatarText}
        </div>
      ) : (
        <div style={{ width: '64px', height: '64px', background: 'rgba(52, 152, 219, 0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}>
          <Icon icon={icon || "lucide:shield-alert"} style={{ fontSize: '2.2rem', color: 'var(--brand-color)' }} />
        </div>
      )}
      
      <h2 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: '900' }}>{title}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '1rem' }}>{subtitle}</p>
      
      <div style={{ 
        fontSize: '2.5rem', letterSpacing: '16px', marginBottom: '32px', fontWeight: 'bold', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-main)', borderRadius: '20px', border: `2px solid ${error ? '#e74c3c' : 'var(--border)'}`, color: error ? '#e74c3c' : 'var(--text-main)',
        boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.05)'
      }}>
        {pin.replace(/./g, '●') || <span style={{opacity: 0.15, letterSpacing: 'normal', fontSize: '1.2rem'}}>••••</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
          <button key={num} onClick={() => { if(setError) setError(false); setPin(prev => prev.length < 4 ? prev + num : prev); }} style={{ padding:'18px', fontSize: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold', transition: 'all 0.2s'}} onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(2px)'; e.currentTarget.style.boxShadow = 'none'; }} onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 0 var(--border)'; }}>{num}</button>
        ))}
        <button onClick={onCancel} style={{ padding:'18px', height: '72px', fontSize: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: '#e74c3c', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon icon="lucide:x" />
        </button>
        <button onClick={() => { if(setError) setError(false); setPin(prev => prev.length < 4 ? prev + 0 : prev); }} style={{padding:'18px', fontSize: '1.5rem', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold'}}>0</button>
        <button onClick={() => setPin(prev => prev.slice(0, -1))} style={{ padding:'18px', fontSize: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon icon="lucide:delete" />
        </button>
      </div>

      <button 
        onClick={handleSubmit}
        disabled={pin.length !== 4 || isSubmitting}
        style={{ width: '100%', padding: '20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '20px', cursor: (pin.length !== 4 || isSubmitting) ? 'not-allowed' : 'pointer', fontWeight: '900', fontSize: '1.3rem', boxShadow: pin.length === 4 ? '0 10px 25px rgba(52, 152, 219, 0.3)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: pin.length === 4 ? 1 : 0.5, transition: 'all 0.3s' }}
      >
        {isSubmitting ? (
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
    return <div className="modal-overlay" style={{ zIndex: 1000 }}>{content}</div>;
  }

  return (
    <div style={{ height:'100dvh', width: '100vw', display: 'flex', backgroundColor: 'var(--bg-surface)', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui', color: 'var(--text-main)', textAlign: 'center', padding: '32px'}}>
      {content}
    </div>
  );
}