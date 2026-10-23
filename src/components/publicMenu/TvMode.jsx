import { useEffect, useMemo, useState } from 'react';
import { formatForDisplay } from '../../utils/moneyUtils';
import CanvasRenderer from '../menuCanvas/CanvasRenderer';
import { mapGroups } from './shared';

export function TvMode({ data, brand, lang }) {
  const menu = data.menu || {};
  const kind = menu.kind || 'live';
  const rotationMs = Math.max(3000, menu.data?.rotation_ms || 12000);
  const showModifiers = menu.data?.show_modifiers !== false;

  const slides = useMemo(() => {
    // Canvas-mode designed menus → one slide per document page. Beats the
    // category-list fallback because the owner picked exactly the layout
    // they want on the screen.
    if (kind === 'designed' && menu.data?.document?.pages?.length) {
      return menu.data.document.pages.map((_, i) => ({
        key: `canvaspg-${i}`, kind: 'canvas-page', payload: { index: i }
      }));
    }
    if (kind === 'live' || kind === 'designed') {
      const wanted = menu.data?.category_names && menu.data.category_names.length > 0
        ? new Set(menu.data.category_names)
        : null;
      // TV always hides out-of-stock items — a kiosk advertising sold-out
      // items is the worst case for this feature.
      const cats = (data.categories || [])
        .filter(c => !wanted || wanted.has(c.name))
        .map(c => ({ ...c, items: c.items.filter(it => it.available !== false) }))
        // Skip categories with no available items so the kiosk never rotates
        // to a slide showing just a title and an empty list.
        .filter(c => c.items.length > 0);
      return cats.map(c => ({ key: `cat-${c.id}`, kind: 'category', payload: c }));
    }
    if (kind === 'pdf' || kind === 'image') {
      return (menu.data?.pages || []).map((url, i) => ({ key: `pg-${i}`, kind: 'page', payload: { url, index: i } }));
    }
    return [{ key: 'placeholder', kind: 'placeholder', payload: null }];
  }, [data, kind, menu.data]);

  const [rawIdx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  // Back to the first slide if the set shrank under us (e.g. a category was hidden).
  const idx = rawIdx < slides.length ? rawIdx : 0;

  // Rotation: hide → swap → show, for a clean crossfade.
  useEffect(() => {
    if (slides.length <= 1) return;
    const tick = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => ((i < slides.length ? i : 0) + 1) % slides.length);
        setVisible(true);
      }, 350);
    }, rotationMs);
    return () => clearInterval(tick);
  }, [slides.length, rotationMs]);

  // Wake Lock — quiet best-effort. Some browsers require a gesture; if the
  // request rejects we just let the screen sleep rather than nag the viewer.
  useEffect(() => {
    let sentinel = null;
    let released = false;
    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          sentinel = await navigator.wakeLock.request('screen');
        }
      } catch { /* ignore */ }
    }
    function onVisibility() {
      // Browsers auto-release on tab hide; reacquire when shown again.
      if (document.visibilityState === 'visible' && !released) acquire();
    }
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) sentinel.release().catch(() => {});
    };
  }, []);

  const slide = slides[idx];

  // Canvas-designed menus own the whole screen — the document IS the design,
  // so skip the brand header/dots chrome and render edge-to-edge from the
  // top-left on a black backdrop. (The header was the orange bar bleeding in.)
  if (slide?.kind === 'canvas-page') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
        <div style={{ width: '100%', height: '100%', opacity: visible ? 1 : 0, transition: 'opacity 0.35s ease' }}>
          <CanvasRenderer
            document={menu.data.document}
            data={data}
            lang={lang}
            isTv={true}
            tvPageIndex={slide.payload.index}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={tvPageStyle}>
      <div style={{ ...tvHeaderStyle, background: brand }}>
        <h1 style={tvHeaderTitleStyle}>{data.shop?.name || 'Menu'}</h1>
        {slides.length > 1 && (
          <div style={tvDotsStyle}>
            {slides.map((_, i) => (
              <span key={i} style={{ ...tvDotStyle, background: i === idx ? 'white' : 'rgba(255,255,255,0.35)' }} />
            ))}
          </div>
        )}
      </div>
      <div style={{ ...tvSlideStyle, opacity: visible ? 1 : 0 }}>
        {slide?.kind === 'category' && <TvCategorySlide category={slide.payload} groupsById={mapGroups(data.modifier_groups)} lang={lang} brand={brand} showModifiers={showModifiers} />}
        {slide?.kind === 'page' && <TvPageSlide url={slide.payload.url} />}
        {slide?.kind === 'canvas-page' && (
          <CanvasRenderer
            document={menu.data.document}
            data={data}
            lang={lang}
            isTv={true}
            tvPageIndex={slide.payload.index}
          />
        )}
        {slide?.kind === 'placeholder' && (
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.5rem' }}>
            {menu.name || 'Menú'} — formato no disponible aún
          </div>
        )}
      </div>
    </div>
  );
}


function TvCategorySlide({ category, groupsById, lang, brand, showModifiers = true }) {
  const items = category?.items || [];
  return (
    <div style={{ width: '100%', height: '100%', padding: '40px 80px 60px', display: 'flex', flexDirection: 'column', gap: 40, color: 'white' }}>
      <h2 style={{ margin: 0, fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', fontWeight: 900, letterSpacing: '-0.02em', color: brand }}>
        {category?.name || ''}
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: items.length > 6 ? '1fr 1fr' : '1fr',
        gap: '18px 60px',
        flex: 1,
        overflow: 'hidden',
        alignContent: 'start'
      }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24, borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 14 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 'clamp(1.4rem, 2.2vw, 2rem)', fontWeight: 800, lineHeight: 1.2 }}>
                {item.emoji ? `${item.emoji} ` : ''}{item.name}
              </div>
              {showModifiers && item.modifier_group_ids?.length > 0 && (
                <div style={{ fontSize: 'clamp(0.9rem, 1.2vw, 1.1rem)', color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
                  {item.modifier_group_ids.map(id => groupsById.get(id)?.name).filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <div style={{ fontSize: 'clamp(1.4rem, 2.2vw, 2rem)', fontWeight: 900, whiteSpace: 'nowrap' }}>
              {item.price_type === 'open' ? '—' : formatForDisplay(item.price_cents, lang)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TvPageSlide({ url }) {
  return (
    <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
  );
}

const tvPageStyle = {
  position: 'fixed',
  inset: 0,
  background: '#0b0b0b',
  color: 'white',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  overflow: 'hidden'
};

const tvHeaderStyle = {
  padding: '24px 80px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: 'white'
};

const tvHeaderTitleStyle = {
  margin: 0,
  fontSize: 'clamp(1.4rem, 2.4vw, 2.4rem)',
  fontWeight: 900,
  letterSpacing: '-0.01em'
};

const tvDotsStyle = { display: 'flex', gap: 8 };
const tvDotStyle = { width: 10, height: 10, borderRadius: 999, display: 'inline-block' };

const tvSlideStyle = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'opacity 350ms ease',
  minHeight: 0
};
