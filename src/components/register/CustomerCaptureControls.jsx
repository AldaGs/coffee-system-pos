import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { useQrScanner } from '../../hooks/useQrScanner';
import { useNfcReader } from '../../hooks/useNfcReader';
import { parsePhoneFromScan } from '../../utils/customerCapture';

/**
 * QR-scan and NFC-tap capture, shown beneath the manual phone entry. Both are
 * feature-detected — the buttons only appear where the browser supports them —
 * and both resolve to a 10-digit phone handed to `onCapture`, the same pipeline
 * the manual entry uses. Anything scanned that isn't a recognizable phone
 * surfaces a gentle inline error instead of silently doing nothing.
 */
function CustomerCaptureControls({ onCapture }) {
  const { t } = useTranslation();
  const [scanError, setScanError] = useState(false);

  const handleDecoded = (raw) => {
    const phone = parsePhoneFromScan(raw);
    if (phone) {
      setScanError(false);
      onCapture(phone);
    } else {
      setScanError(true);
      setTimeout(() => setScanError(false), 2500);
    }
  };

  const {
    supported: qrSupported, scanning, error: qrError, videoRef, start: qrStart, stop: qrStop,
  } = useQrScanner(handleDecoded);
  const {
    supported: nfcSupported, reading, error: nfcError, start: nfcStart, stop: nfcStop,
  } = useNfcReader(handleDecoded);

  if (!qrSupported && !nfcSupported) return null;

  const chipStyle = {
    flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--bg-card, var(--bg-main))',
    color: 'var(--text-main)', fontWeight: 'bold', fontSize: '0.95rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 12px' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('cap.or') || 'or'}</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>

      {scanning ? (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: '12px', overflow: 'hidden', background: '#000' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
            <div style={{ position: 'absolute', inset: '18%', border: '3px solid rgba(255,255,255,0.9)', borderRadius: '12px', boxShadow: '0 0 0 100vmax rgba(0,0,0,0.25)' }} />
          </div>
          <button onClick={qrStop} style={{ ...chipStyle, width: '100%', marginTop: '10px' }}>
            <Icon icon="lucide:x" /> {t('cap.cancelScan') || 'Cancel'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '10px' }}>
          {qrSupported && (
            <button onClick={qrStart} style={chipStyle}>
              <Icon icon="lucide:scan-line" style={{ fontSize: '1.2rem', color: 'var(--brand-color)' }} />
              {t('cap.scanQr') || 'Scan QR'}
            </button>
          )}
          {nfcSupported && (
            <button onClick={reading ? nfcStop : nfcStart} style={chipStyle}>
              <Icon icon={reading ? 'lucide:loader' : 'lucide:nfc'} style={{ fontSize: '1.2rem', color: 'var(--brand-color)' }} />
              {reading ? (t('cap.tapNow') || 'Tap a card…') : (t('cap.tapNfc') || 'Tap NFC')}
            </button>
          )}
        </div>
      )}

      {(scanError || qrError === 'denied' || nfcError === 'denied') && (
        <p style={{ fontSize: '0.8rem', color: '#e74c3c', margin: '8px 0 0', textAlign: 'center' }}>
          {qrError === 'denied' || nfcError === 'denied'
            ? (t('cap.permDenied') || 'Camera/NFC permission was denied.')
            : (t('cap.noPhone') || 'Couldn’t read a valid number from that code.')}
        </p>
      )}
    </div>
  );
}

export default CustomerCaptureControls;
