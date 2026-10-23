import { useEffect, useRef, useState } from 'react';
import { centerStyle } from './shared';

export function UploadedMenu({ menu, brand }) {
  const pages = menu?.data?.pages || [];
  const originalUrl = menu?.data?.original_url;
  const [idx, setIdx] = useState(0);
  const touchX = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') setIdx(i => Math.min(pages.length - 1, i + 1));
      if (e.key === 'ArrowLeft')  setIdx(i => Math.max(0, i - 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages.length]);

  if (pages.length === 0) {
    return <div style={centerStyle}>Menú vacío.</div>;
  }

  const onTouchStart = e => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = e => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx > 50) setIdx(i => Math.max(0, i - 1));
    else if (dx < -50) setIdx(i => Math.min(pages.length - 1, i + 1));
    touchX.current = null;
  };

  return (
    <div style={{ padding: '12px 0 32px' }}>
      <div
        style={{
          position: 'relative',
          background: '#000',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 'min(80vh, 720px)',
          overflow: 'hidden'
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={pages[idx]}
          alt={`Página ${idx + 1}`}
          style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
        />
        {pages.length > 1 && (
          <>
            <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} style={{ ...carouselBtn, left: 12 }} aria-label="Anterior">
              ‹
            </button>
            <button onClick={() => setIdx(i => Math.min(pages.length - 1, i + 1))} disabled={idx === pages.length - 1} style={{ ...carouselBtn, right: 12 }} aria-label="Siguiente">
              ›
            </button>
          </>
        )}
      </div>

      {pages.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '14px 16px 0' }}>
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Página ${i + 1}`}
              style={{
                width: 10, height: 10, borderRadius: 999, border: 'none', padding: 0,
                background: i === idx ? brand : '#ccc', cursor: 'pointer'
              }}
            />
          ))}
        </div>
      )}

      {originalUrl && (
        <div style={{ textAlign: 'center', padding: '18px 16px 0' }}>
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand, fontWeight: 700, textDecoration: 'none', fontSize: '0.9rem' }}
          >
            Descargar PDF original ↓
          </a>
        </div>
      )}
    </div>
  );
}

const carouselBtn = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 44, height: 44,
  borderRadius: 999,
  border: 'none',
  background: 'rgba(255,255,255,0.85)',
  color: '#222',
  fontSize: '1.8rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1
};

// Print mode wrapper. Fires window.print() once on mount so the user lands
// in the print dialog without an extra click. Browsers handle the rest —
// the @page CSS injected by CanvasRenderer's PrintStack tells them what
// paper size to use.
export function PrintWrapper({ enabled, children }) {
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => { try { window.print(); } catch { /* ignore */ } }, 400);
    return () => clearTimeout(t);
  }, [enabled]);
  return children;
}

// Phase 4a templates. All three templates take the same props and render the
// catalog payload returned by get_active_menu (kind='designed' gets the same
// shape as 'live'). Bindings stay live — prices, hidden state, and modifier
// groups flow through automatically because the customer fetches the same RPC.
