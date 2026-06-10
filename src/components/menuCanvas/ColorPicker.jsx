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

import { useContext, useEffect, useRef, useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { PaletteContext } from './paletteContext';

export default function ColorPicker({ value, onChange, swatchStyle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { palette, addSwatch, removeSwatch } = useContext(PaletteContext);

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

          {/* Document palette: click to apply, Alt-click to remove. */}
          <div style={{ marginTop: 10, borderTop: '1px solid #30363d', paddingTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#8b949e', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paleta</span>
              <button
                type="button"
                onClick={() => value && addSwatch(value)}
                title="Guardar el color actual en la paleta"
                style={{ background: 'transparent', border: '1px solid #30363d', color: '#ddd', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
              >+ Guardar</button>
            </div>
            {palette.length === 0 ? (
              <span style={{ color: '#586069', fontSize: '0.68rem' }}>Sin colores guardados</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {palette.map(hex => (
                  <button
                    key={hex}
                    type="button"
                    onClick={e => (e.altKey ? removeSwatch(hex) : onChange(hex))}
                    title={`${hex} — clic para aplicar, Alt+clic para quitar`}
                    style={{ width: 20, height: 20, borderRadius: 4, border: hex.toLowerCase() === (value || '').toLowerCase() ? '2px solid #1f6feb' : '1px solid #30363d', background: hex, cursor: 'pointer', padding: 0 }}
                  />
                ))}
              </div>
            )}
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
