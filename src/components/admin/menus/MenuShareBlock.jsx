import { useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import { menuBaseUrl } from '../../../utils/customDomainSync';
import { storedProjectRef } from '../../../utils/projectRef';
import QRCode from 'qrcode';
import { useTranslation } from '../../../hooks/useTranslation';
import { useFlash } from '../../../hooks/useFlash';
import { btnSecondary } from './menuShared';

// Per-menu deep link: /menu?p=<ref>&m=<id>. Each non-live menu gets its own
// block so a shop can print one QR per menu (Brunch QR always shows brunch
// regardless of time).
export function MenuShareBlock({ menu }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [copied, flashCopied] = useFlash(1500);

  const ref = storedProjectRef();
  const link = ref ? `${menuBaseUrl()}/menu?p=${ref}&m=${menu.id}` : '';

  useEffect(() => {
    if (!canvasRef.current || !link) return;
    QRCode.toCanvas(canvasRef.current, link, {
      width: 140, margin: 1, errorCorrectionLevel: 'L',
      color: { dark: '#111', light: '#ffffff' }
    }).catch(() => {});
  }, [link]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      flashCopied();
    } catch { /* ignore */ }
  }

  async function downloadQr() {
    const big = document.createElement('canvas');
    await QRCode.toCanvas(big, link, { width: 1024, margin: 2, errorCorrectionLevel: 'L', color: { dark: '#111', light: '#ffffff' } });
    const a = document.createElement('a');
    a.href = big.toDataURL('image/png');
    a.download = `menu-${menu.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || menu.id}.png`;
    a.click();
  }

  async function downloadQrSvg() {
    const svgString = await QRCode.toString(link, { type: 'svg', width: 1024, margin: 2, errorCorrectionLevel: 'L', color: { dark: '#111', light: '#ffffff' } });
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menu-${menu.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || menu.id}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!link) {
    return (
      <div style={{ borderTop: '1px solid var(--border)', padding: 18, background: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        {t('menusTab.noCredentials')}
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: 18, background: 'var(--bg-main)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <canvas ref={canvasRef} style={{ borderRadius: 8, background: 'white', padding: 4 }} />
      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t('menusTab.directLink')}
        </p>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {t('menusTab.directLinkDesc').split('{name}').map((part, i) => i === 0 ? part : <span key={i}><strong>{menu.name}</strong>{part}</span>)}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)' }}>
          <code style={{ flex: 1, fontSize: '0.7rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</code>
          <button onClick={copy} style={{ ...btnSecondary, padding: '6px 10px', fontSize: '0.78rem' }}>
            <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} /> {copied ? t('menusTab.copied') : t('menusTab.copy')}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={downloadQr} style={{ ...btnSecondary, alignSelf: 'flex-start' }}>
            <Icon icon="lucide:image" /> PNG
          </button>
          <button onClick={downloadQrSvg} style={{ ...btnSecondary, alignSelf: 'flex-start' }}>
            <Icon icon="lucide:move-diagonal" /> SVG
          </button>
        </div>
      </div>
    </div>
  );
}
