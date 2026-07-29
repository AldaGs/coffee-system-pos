// Public, backend-free loyalty enrollment. Routed at /enroll and bypasses every
// App.jsx auth/setup gate.
//
// Why no database write: `customers` is RLS-locked to authenticated devices
// (migration 001) and this is a bring-your-own-Supabase app, so there is no
// central service-role endpoint a customer's browser could safely post to.
// Instead this page just mints the customer's personal loyalty QR (their
// reusable "card") entirely client-side. The customer saves it; on their next
// visit the cashier's authenticated scan is what records them in the directory.
//
// The QR encodes `${origin}/enroll?c=<phone>`, so scanning the saved card with a
// plain camera reopens this page, and the register's scanner reads the phone
// back out (see parsePhoneFromScan). One artifact serves both flows.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { translations } from '../utils/translations';
import { cleanPhone, isValidPhone } from '../utils/customerCapture';

const lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('es') ? 'es' : 'en';
const t = (key) => translations[lang]?.[key] || translations.en?.[key] || key;

export default function PublicEnroll() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const prefill = cleanPhone(params.get('c') || params.get('phone') || '');

  const [phone, setPhone] = useState(prefill);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);
  const [dataUrl, setDataUrl] = useState(null);

  const valid = isValidPhone(phone);

  const generate = () => {
    if (!valid) { setError(true); return; }
    setError(false);
    setSubmitted(true);
  };

  useEffect(() => {
    if (!submitted || !valid) return;
    const origin = window.location.origin;
    const payload = `${origin}/enroll?c=${cleanPhone(phone)}`;
    let cancelled = false;
    QRCode.toDataURL(payload, { width: 260, margin: 1 })
      .then(url => { if (!cancelled) setDataUrl(url); })
      .catch(err => console.warn('QR generation failed:', err));
    return () => { cancelled = true; };
  }, [submitted, valid, phone]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `loyalty-card-${cleanPhone(phone)}.png`;
    a.click();
  };

  const wrap = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '24px', background: '#0f1115', color: '#f5f5f5',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  };
  const card = {
    width: '100%', maxWidth: '380px', background: '#191c22', borderRadius: '18px',
    padding: '28px 24px', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.4)'
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: '2.4rem', marginBottom: '6px' }}>☕️</div>
        <h1 style={{ margin: '0 0 6px', fontSize: '1.4rem' }}>{t('enroll.title')}</h1>
        <p style={{ margin: '0 0 22px', color: '#9aa0aa', fontSize: '0.95rem', lineHeight: 1.4 }}>
          {submitted ? t('enroll.savedSub') : t('enroll.sub')}
        </p>

        {!submitted ? (
          <>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder={t('loy.placeholder')}
              value={phone}
              onChange={(e) => setPhone(cleanPhone(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && generate()}
              style={{
                width: '100%', padding: '15px', fontSize: '1.5rem', letterSpacing: '2px',
                textAlign: 'center', borderRadius: '10px', border: `2px solid ${error ? '#e74c3c' : '#3b82f6'}`,
                background: '#0f1115', color: '#fff', boxSizing: 'border-box', outline: 'none', marginBottom: '8px'
              }}
            />
            {error && <p style={{ color: '#e74c3c', fontSize: '0.85rem', margin: '0 0 8px' }}>{t('enroll.invalid')}</p>}
            <button
              onClick={generate}
              disabled={!valid}
              style={{
                width: '100%', marginTop: '10px', padding: '15px', borderRadius: '10px', border: 'none',
                background: valid ? '#3b82f6' : '#2a2f3a', color: '#fff', fontWeight: 'bold',
                fontSize: '1.05rem', cursor: valid ? 'pointer' : 'not-allowed'
              }}
            >
              {t('enroll.btn')}
            </button>
          </>
        ) : (
          <>
            {dataUrl && (
              <img
                src={dataUrl}
                alt={t('card.alt')}
                style={{ width: 240, height: 240, borderRadius: '14px', background: '#fff', padding: '10px' }}
              />
            )}
            <p style={{ color: '#9aa0aa', fontSize: '0.85rem', margin: '14px 0 18px' }}>{t('enroll.showCashier')}</p>
            <button
              onClick={download}
              style={{
                width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
                background: '#3b82f6', color: '#fff', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer'
              }}
            >
              {t('card.save')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
