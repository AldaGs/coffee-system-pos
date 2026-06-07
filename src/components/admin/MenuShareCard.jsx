// "Tu menú público" share card. Shown in the General Settings tab so the
// shop owner can grab the URL for the customer-facing /menu page, copy it,
// and download a QR for printing.
//
// All client-side — the URL is whatever this terminal is currently on, plus
// '/menu'. Customers visiting it never see auth/setup (see App.jsx Gate 0).

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';

const QR_SIZE = 180;       // rendered size in the card
const QR_DOWNLOAD_SIZE = 1024; // larger version for the downloaded PNG

function MenuShareCard({ menuData }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  // window.location.origin is stable for the life of the page; computing it
  // once on mount keeps the URL displayed and the URL embedded in the QR in
  // lockstep.
  const menuUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/menu`
    : '/menu';

  const brand = menuData?.posSettings?.brandColor || '#f28b05';
  const shopName = (menuData?.posSettings?.name || 'menu')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'menu';

  // Render the inline QR into the visible canvas on mount + whenever the URL
  // changes (which is effectively never, but keeps the effect honest).
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, menuUrl, {
      width: QR_SIZE,
      margin: 1,
      color: { dark: '#111', light: '#ffffff' }
    }).catch(err => setError(err.message));
  }, [menuUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older WebViews / non-https without clipboard API: surface a visible
      // fallback so the user knows the auto-copy failed and can select the URL.
      setError('clipboard');
      setTimeout(() => setError(null), 2400);
    }
  };

  // Render at a larger size for downloads — printers and phones look better
  // with the higher-res QR. Off-screen canvas, blob → object URL → anchor click.
  const handleDownload = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(menuUrl, {
        width: QR_DOWNLOAD_SIZE,
        margin: 2,
        color: { dark: '#111', light: '#ffffff' }
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `menu-${shopName}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={cardStyle}>
      <h3 style={titleStyle}>
        <Icon icon="lucide:qr-code" style={{ color: brand }} />
        {t('share.title')}
      </h3>
      <p style={descStyle}>{t('share.desc')}</p>

      <div style={rowStyle}>
        <canvas
          ref={canvasRef}
          width={QR_SIZE}
          height={QR_SIZE}
          style={qrStyle}
          aria-label={t('share.qrAlt')}
        />

        <div style={controlsStyle}>
          <label style={labelStyle}>{t('share.urlLabel')}</label>
          <div style={urlRowStyle}>
            <input
              readOnly
              value={menuUrl}
              onFocus={(e) => e.target.select()}
              style={urlInputStyle}
            />
            <button
              type="button"
              onClick={handleCopy}
              style={{ ...buttonStyle, background: brand }}
              title={t('share.copy')}
            >
              <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} />
              {copied ? t('share.copied') : t('share.copy')}
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            style={{ ...buttonStyle, background: 'transparent', color: brand, border: `2px solid ${brand}`, marginTop: 12 }}
          >
            <Icon icon="lucide:download" />
            {t('share.download')}
          </button>

          {error === 'clipboard' && (
            <p style={errorTextStyle}>{t('share.copyFallback')}</p>
          )}
          {error && error !== 'clipboard' && (
            <p style={errorTextStyle}>{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  background: 'var(--bg-surface)',
  padding: 'var(--admin-padding, 24px)',
  borderRadius: 'var(--admin-card-radius, 16px)',
  border: '1px solid var(--border)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
  marginTop: 24
};

const titleStyle = {
  marginTop: 0,
  marginBottom: 8,
  color: 'var(--text-main)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: '1.2rem',
  fontWeight: 800
};

const descStyle = {
  margin: '0 0 24px',
  color: 'var(--text-muted)',
  fontSize: '0.95rem'
};

const rowStyle = {
  display: 'flex',
  gap: 24,
  alignItems: 'flex-start',
  flexWrap: 'wrap'
};

const qrStyle = {
  width: QR_SIZE,
  height: QR_SIZE,
  borderRadius: 12,
  background: 'white',
  padding: 8,
  border: '1px solid var(--border)',
  flexShrink: 0
};

const controlsStyle = {
  flex: 1,
  minWidth: 240,
  display: 'flex',
  flexDirection: 'column'
};

const labelStyle = {
  fontSize: '0.85rem',
  fontWeight: 'bold',
  color: 'var(--text-muted)',
  marginBottom: 8
};

const urlRowStyle = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap'
};

const urlInputStyle = {
  flex: 1,
  minWidth: 0,
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--bg-main)',
  color: 'var(--text-main)',
  outline: 'none',
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: '0.9rem',
  fontWeight: 600
};

const buttonStyle = {
  padding: '12px 16px',
  border: 'none',
  borderRadius: 12,
  color: 'white',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '0.95rem'
};

const errorTextStyle = {
  marginTop: 12,
  marginBottom: 0,
  fontSize: '0.85rem',
  color: '#e74c3c',
  fontWeight: 600
};

export default MenuShareCard;
