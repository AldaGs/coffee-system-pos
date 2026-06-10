// "Tu menú público" share card. Shown in the MenusTab so the shop owner can
// grab a short URL for the customer-facing /menu page, copy it, and download
// a QR for printing.
//
// Short-URL strategy: uploads a config.json (containing the anon key) to a
// public Supabase Storage bucket ("menu"), then builds a short URL like
// /menu?p=PROJECT_REF. The PublicMenu page derives the Supabase URL from the
// ref and fetches the anon key from storage. This keeps the architecture
// stateless — no Edge Functions or alias table needed — while producing a
// ~55-char URL that QR-scans reliably.

import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { supabase } from '../../supabaseClient';

const QR_SIZE = 180;       // rendered size in the card
const QR_DOWNLOAD_SIZE = 1024; // larger version for the downloaded PNG

function MenuShareCard({ menuData }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [menuUrl, setMenuUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Derive project ref + anon key from localStorage (written by SetupScreen).
  const supabaseUrl = localStorage.getItem('tinypos_supabase_url') || '';
  const anonKey = localStorage.getItem('tinypos_supabase_anon_key') || '';
  // Extract project ref: https://XXXXX.supabase.co → XXXXX
  const projectRef = (() => {
    try { return new URL(supabaseUrl).hostname.split('.')[0]; }
    catch { return ''; }
  })();
  const missingCreds = !projectRef || !anonKey;

  const brand = menuData?.posSettings?.brandColor || '#f28b05';
  const shopName = (menuData?.posSettings?.name || 'menu')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'menu';

  // Upload config.json with the anon key, then build the short URL.
  const generateShortUrl = useCallback(async () => {
    if (missingCreds || !supabase) return;
    setUploading(true);
    setError(null);
    try {
      // 1. Upload a config.json containing only the anon key to the public
      //    "menu" bucket. The Supabase URL is derivable from the project ref,
      //    so we only need to store the key.
      const config = JSON.stringify({ k: anonKey });
      const blob = new Blob([config], { type: 'application/json' });

      const { error: uploadError } = await supabase.storage
        .from('menu')
        .upload('config.json', blob, {
          upsert: true,
          contentType: 'application/json',
          cacheControl: '0',
        });

      if (uploadError) throw uploadError;

      // 2. Build the short URL: /menu?p=PROJECT_REF
      //    PublicMenu reads ?p, constructs the Supabase URL, and fetches
      //    the anon key from storage.
      const origin = window.location.origin;
      setMenuUrl(`${origin}/menu?p=${projectRef}`);
    } catch (err) {
      console.error('MenuShareCard: config upload failed', err);
      setError(err.message || 'Error uploading config');
      // Fall back to the long URL so the QR is still usable.
      const origin = window.location.origin;
      const u = btoa(supabaseUrl);
      const k = btoa(anonKey);
      setMenuUrl(`${origin}/menu?u=${u}&k=${k}`);
    } finally {
      setUploading(false);
    }
  }, [projectRef, anonKey, missingCreds]);

  // On mount (and whenever creds change), upload the config.
  useEffect(() => {
    generateShortUrl();
  }, [generateShortUrl]);

  // Render the inline QR into the visible canvas once menuUrl is ready.
  useEffect(() => {
    if (!canvasRef.current || !menuUrl) return;
    QRCode.toCanvas(canvasRef.current, menuUrl, {
      width: QR_SIZE,
      margin: 1,
      errorCorrectionLevel: 'L',
      color: { dark: '#111', light: '#ffffff' }
    }).catch(err => setError(err.message));
  }, [menuUrl]);

  const handleCopy = async () => {
    if (!menuUrl) return;
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
    if (!menuUrl) return;
    try {
      const dataUrl = await QRCode.toDataURL(menuUrl, {
        width: QR_DOWNLOAD_SIZE,
        margin: 2,
        errorCorrectionLevel: 'L',
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

  const handleDownloadSvg = async () => {
    if (!menuUrl) return;
    try {
      const svgString = await QRCode.toString(menuUrl, {
        type: 'svg',
        width: QR_DOWNLOAD_SIZE,
        margin: 2,
        errorCorrectionLevel: 'L',
        color: { dark: '#111', light: '#ffffff' }
      });
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `menu-${shopName}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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

      {uploading && (
        <div style={uploadingBarStyle}>
          <Icon icon="lucide:loader" style={{ animation: 'spin 1s linear infinite', fontSize: '1.1rem' }} />
          <span>Generando enlace corto…</span>
        </div>
      )}

      <div style={rowStyle}>
        <canvas
          ref={canvasRef}
          width={QR_SIZE}
          height={QR_SIZE}
          style={{ ...qrStyle, opacity: uploading ? 0.4 : 1, transition: 'opacity 0.3s' }}
          aria-label={t('share.qrAlt')}
        />

        <div style={controlsStyle}>
          <label style={labelStyle}>{t('share.urlLabel')}</label>
          <div style={urlRowStyle}>
            <input
              readOnly
              value={uploading ? 'Generando…' : (menuUrl || '')}
              onFocus={(e) => e.target.select()}
              style={urlInputStyle}
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={uploading || !menuUrl}
              style={{ ...buttonStyle, background: brand, opacity: uploading ? 0.5 : 1 }}
              title={t('share.copy')}
            >
              <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} />
              {copied ? t('share.copied') : t('share.copy')}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={handleDownload}
              disabled={uploading || !menuUrl}
              style={{ ...buttonStyle, background: 'transparent', color: brand, border: `2px solid ${brand}`, opacity: uploading ? 0.5 : 1 }}
            >
              <Icon icon="lucide:image" />
              {t('share.download')} (PNG)
            </button>
            <button
              type="button"
              onClick={handleDownloadSvg}
              disabled={uploading || !menuUrl}
              style={{ ...buttonStyle, background: 'transparent', color: brand, border: `2px solid ${brand}`, opacity: uploading ? 0.5 : 1 }}
            >
              <Icon icon="lucide:move-diagonal" />
              SVG
            </button>
          </div>

          {missingCreds && (
            <p style={errorTextStyle}>
              Configura las credenciales de Supabase para generar el enlace público.
            </p>
          )}
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

const uploadingBarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  marginBottom: 16,
  borderRadius: 12,
  background: 'var(--bg-main)',
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
  fontSize: '0.9rem',
  fontWeight: 600
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
