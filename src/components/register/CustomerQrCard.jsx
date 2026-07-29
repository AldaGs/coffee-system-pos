import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * A customer's personal loyalty QR — their reusable "digital card". It encodes
 * `${origin}/enroll?c=<phone>`, so the cashier's scanner reads the phone back
 * (see parsePhoneFromScan) AND a customer scanning it with a plain camera lands
 * on the public enroll page. Generated fully client-side; no network needed.
 */
function CustomerQrCard({ phone, compact = false }) {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    if (!phone) { setDataUrl(null); return; }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const payload = `${origin}/enroll?c=${phone}`;
    let cancelled = false;
    QRCode.toDataURL(payload, { width: compact ? 160 : 240, margin: 1 })
      .then(url => { if (!cancelled) setDataUrl(url); })
      .catch(err => console.warn('QR generation failed:', err));
    return () => { cancelled = true; };
  }, [phone, compact]);

  if (!dataUrl) return null;

  const download = () => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `loyalty-card-${phone}.png`;
    a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <img
        src={dataUrl}
        alt={t('card.alt') || 'Loyalty QR card'}
        style={{ width: compact ? 160 : 240, height: compact ? 160 : 240, borderRadius: '12px', background: '#fff', padding: '8px' }}
      />
      {!compact && (
        <button
          onClick={download}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
            borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)',
            color: 'var(--text-main)', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem'
          }}
        >
          <Icon icon="lucide:download" /> {t('card.save') || 'Save card'}
        </button>
      )}
    </div>
  );
}

export default CustomerQrCard;
