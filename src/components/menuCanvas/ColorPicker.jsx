// Phase 4c.2 — popover color picker for the canvas editor. Wraps
// react-colorful (3KB, no deps) so we get a proper saturation/hue plane
// instead of the OS-native eyedropper, which on Windows looks rough and
// blocks the editor while open.
//
// Same controlled-input contract as a plain <input type="color">:
//   <ColorPicker value="#ff0000" onChange={hex => …} />
//
// Click the swatch → popover opens; click outside → closes. Hex field
// inside the popover lets users paste exact colors.

import { useEffect, useRef, useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';

export default function ColorPicker({ value, onChange, swatchStyle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click. Capture phase so we beat the popover's own
  // mousedown handlers on Konva or other overlays.
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 36, height: 28, padding: 0, border: '1px solid #30363d',
          borderRadius: 6, cursor: 'pointer', background: value || '#000',
          ...swatchStyle
        }}
        aria-label="Elegir color"
      />
      {open && (
        <div style={popover}>
          <HexColorPicker color={value || '#000000'} onChange={onChange} />
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#888', fontSize: '0.8rem' }}>#</span>
            <HexColorInput
              color={value || '#000000'}
              onChange={onChange}
              style={hexInput}
              prefixed={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const popover = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  zIndex: 50,
  background: '#22272e',
  border: '1px solid #30363d',
  borderRadius: 10,
  padding: 10,
  boxShadow: '0 12px 30px rgba(0,0,0,0.45)'
};

const hexInput = {
  flex: 1,
  background: '#0d1117',
  border: '1px solid #30363d',
  color: 'white',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: '0.85rem',
  outline: 'none',
  textTransform: 'uppercase',
  fontFamily: 'monospace'
};
