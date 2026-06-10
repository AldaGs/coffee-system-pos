// Interactive crop + zoom for menu item photos. Wraps react-easy-crop with
// an aspect-ratio preset row + zoom slider. The owner picks any ratio
// (Original / 1:1 / 4:3 / 16:9) — items can be food shots, decorative
// graphics, anything — so we don't force square.
//
// On confirm: parent gets back ({ blob, pixels }) for upload.

import { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Icon } from '@iconify/react';
import { cropToWebpBlob } from '../../api/menuImages';

const ASPECT_PRESETS = [
  { id: 'original', label: 'Original', value: null },
  { id: 'square',   label: '1:1',      value: 1 },
  { id: '4-3',      label: '4:3',      value: 4 / 3 },
  { id: '16-9',     label: '16:9',     value: 16 / 9 },
];

function ImageCropModal({ imageSrc, onConfirm, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspectId, setAspectId] = useState('original');
  const [originalAspect, setOriginalAspect] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setOriginalAspect(img.naturalWidth / img.naturalHeight);
    img.src = imageSrc;
  }, [imageSrc]);

  const aspect = (() => {
    const preset = ASPECT_PRESETS.find(p => p.id === aspectId);
    if (preset?.value) return preset.value;
    return originalAspect;
  })();

  const onCropComplete = useCallback((_, areaPixels) => {
    setCroppedPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedPixels) return;
    setBusy(true);
    try {
      const blob = await cropToWebpBlob(imageSrc, croppedPixels);
      onConfirm(blob);
    } catch (err) {
      console.error('crop failed:', err);
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <header style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Recortar imagen</h3>
          <button onClick={onCancel} style={closeBtnStyle} aria-label="Cerrar">
            <Icon icon="lucide:x" />
          </button>
        </header>

        <div style={cropperContainerStyle}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            restrictPosition={false}
          />
        </div>

        <div style={controlsStyle}>
          <div style={presetRowStyle}>
            {ASPECT_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setAspectId(p.id)}
                style={{
                  ...presetBtnStyle,
                  background: aspectId === p.id ? 'var(--brand-color)' : 'var(--bg-main)',
                  color: aspectId === p.id ? 'white' : 'var(--text-main)',
                  border: aspectId === p.id ? 'none' : '1px solid var(--border)'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <label style={zoomLabelStyle}>
            <Icon icon="lucide:zoom-in" />
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </label>

          <div style={actionRowStyle}>
            <button onClick={onCancel} style={cancelBtnStyle}>Cancelar</button>
            <button
              onClick={handleConfirm}
              disabled={busy || !croppedPixels}
              style={{
                ...confirmBtnStyle,
                opacity: busy || !croppedPixels ? 0.6 : 1,
                cursor: busy || !croppedPixels ? 'wait' : 'pointer'
              }}
            >
              <Icon icon="lucide:check" />
              {busy ? 'Procesando…' : 'Usar imagen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  // Above the asset library modal (z 1000) so "upload new" cropping stacks
  // on top of it, then drops back to the library after confirming.
  zIndex: 1100, padding: 16
};

const modalStyle = {
  background: 'var(--bg-surface)',
  borderRadius: 16, width: '100%', maxWidth: 560,
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
};

const headerStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '16px 20px', borderBottom: '1px solid var(--border)'
};

const closeBtnStyle = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontSize: '1.2rem', color: 'var(--text-muted)'
};

const cropperContainerStyle = {
  position: 'relative', width: '100%', height: 360, background: '#222'
};

const controlsStyle = {
  padding: 20, display: 'flex', flexDirection: 'column', gap: 16
};

const presetRowStyle = { display: 'flex', gap: 8, flexWrap: 'wrap' };

const presetBtnStyle = {
  padding: '8px 14px', borderRadius: 10, fontWeight: 700,
  fontSize: '0.85rem', cursor: 'pointer'
};

const zoomLabelStyle = {
  display: 'flex', alignItems: 'center', gap: 12,
  color: 'var(--text-muted)'
};

const actionRowStyle = {
  display: 'flex', gap: 12, justifyContent: 'flex-end'
};

const cancelBtnStyle = {
  padding: '12px 20px', borderRadius: 12,
  background: 'var(--bg-main)', color: 'var(--text-main)',
  border: '1px solid var(--border)', fontWeight: 700, cursor: 'pointer'
};

const confirmBtnStyle = {
  padding: '12px 20px', borderRadius: 12,
  background: 'var(--brand-color)', color: 'white',
  border: 'none', fontWeight: 800,
  display: 'inline-flex', alignItems: 'center', gap: 8
};

export default ImageCropModal;
