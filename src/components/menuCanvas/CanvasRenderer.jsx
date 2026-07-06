// Phase 4c.0 — DOM renderer for canvas documents.
//
// Walks menu.data.document.pages and emits absolutely-positioned <div>s on
// a fixed-size page wrapped in a CSS scale() transform. Author coordinates
// are page pixels; on-screen size is whatever the viewport allows.
//
// All four node types from canvasDocument.js are supported: text, image,
// shape (rect/circle/line), item-binding. Unknown node types render as
// transparent boxes — forward-compatible with documents written by future
// editors.

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildItemIndex, PAGE_PRESETS, syncDocFonts, docFontFamilies, docFontLoadSpecs, pathToSvgD, formatDateField } from '../../utils/canvasDocument';
import { formatForDisplay } from '../../utils/moneyUtils';

export default function CanvasRenderer({ document, data, lang, isTv = false, tvPageIndex = 0, isPrint = false }) {
  // Load any web fonts the document declares (e.g. the chalkboard template's
  // Permanent Marker) so style.fontFamily stacks resolve to the real face.
  //
  // NOTE: the `document` PROP shadows the global, so the browser FontFaceSet
  // must be reached via `window.document.fonts` — `document.fonts` here is the
  // doc model's URL array. Injecting the <link> alone is unreliable on the
  // public/kiosk page (no force-fetch, no repaint), so we also FontFaceSet-load
  // each family and bump state to repaint once ready — mirroring the editor.
  const [, setFontTick] = useState(0);
  const fontsKey = JSON.stringify(document?.fonts || []);
  useEffect(() => {
    syncDocFonts(document);
    const fonts = (typeof window !== 'undefined') && window.document?.fonts;
    const specs = docFontLoadSpecs(document);
    if (!fonts || specs.length === 0) return;
    let active = true;
    // Prime every family × weight the document uses, not just the default 400
    // face — otherwise bold headings paint in a fallback until lazily fetched,
    // which is exactly the "font differs on the display link" mismatch. Bump
    // state once resolved so the tree repaints with correct glyphs.
    Promise.all(specs.map(s => fonts.load(s).catch(() => {})))
      .then(() => { if (active) setFontTick(t => t + 1); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsKey]);

  const pageW = document?.page_size?.w || 1920;
  const pageH = document?.page_size?.h || 1080;
  const itemIndex = useMemo(() => buildItemIndex(data?.categories || []), [data]);

  if (!document?.pages?.length) return null;

  // Print mode: render every page at native size with page-break separators
  // and inject an @page rule so the browser's print dialog sizes paper
  // correctly. Resolution scaling stays at 1 — the print engine handles
  // fit-to-paper.
  if (isPrint) {
    return <PrintStack document={document} itemIndex={itemIndex} lang={lang} />;
  }

  // TV mode: render only one page, fit-to-viewport, no surrounding chrome.
  // TvMode owns the rotation and the fullscreen black backdrop, so we return a
  // bare centered page (PageStack would add its own padding/background and push
  // the page down from the top-left).
  if (isTv) {
    const idx = Math.max(0, Math.min(tvPageIndex, document.pages.length - 1));
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ScaledPage page={document.pages[idx]} pageW={pageW} pageH={pageH} itemIndex={itemIndex} lang={lang} fit="contain" />
      </div>
    );
  }
  return <PageStack pages={document.pages} pageW={pageW} pageH={pageH} itemIndex={itemIndex} lang={lang} fit="width" />;
}

// Renders every page at native pixel size with page-break-after between
// them. The injected <style> emits @page rules so the browser print dialog
// uses the document's intended paper size. window.print() is triggered by
// the wrapping <PublicMenu> after data loads.
function PrintStack({ document, itemIndex, lang }) {
  const { w, h } = document.page_size || { w: 1920, h: 1080 };
  // Choose @page size: prefer a print preset's paper units if matched.
  const matchedPaper = (() => {
    for (const p of Object.values(PAGE_PRESETS)) {
      if (p.w === w && p.h === h && p.paper) return p.paper;
    }
    return null;
  })();
  const pageRule = matchedPaper
    ? `@page { size: ${matchedPaper.w} ${matchedPaper.h}; margin: 0; }`
    : `@page { size: ${w}px ${h}px; margin: 0; }`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        ${pageRule}
        html, body { margin: 0; padding: 0; background: white; }
        .tinypos-print-page {
          width: ${w}px; height: ${h}px;
          position: relative; overflow: hidden;
          page-break-after: always;
          break-after: page;
        }
        .tinypos-print-page:last-child { page-break-after: auto; break-after: auto; }
        @media screen {
          body { background: #444; }
          .tinypos-print-page { box-shadow: 0 4px 20px rgba(0,0,0,0.4); margin: 20px auto; }
        }
      `}} />
      {document.pages.map((p, i) => {
        const sortedNodes = [...(p.nodes || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
        return (
          <div key={i} className="tinypos-print-page" style={{ background: p.background || '#fff' }}>
            {sortedNodes.map(node => (
              <NodeView key={node.id} node={node} itemIndex={itemIndex} lang={lang} />
            ))}
          </div>
        );
      })}
    </>
  );
}


function PageStack({ pages, pageW, pageH, itemIndex, lang, fit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '24px 0', background: '#0a0a0a' }}>
      {pages.map((p, i) => (
        <ScaledPage key={i} page={p} pageW={pageW} pageH={pageH} itemIndex={itemIndex} lang={lang} fit={fit} />
      ))}
    </div>
  );
}

// Wraps a page at its native size inside a viewport-fitting container and
// applies a single transform: scale() so all nodes inside use the authored
// pixel values without recomputation.
function ScaledPage({ page, pageW, pageH, itemIndex, lang, fit }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function recalc() {
      const el = wrapRef.current;
      if (!el) return;
      const parent = el.parentElement;
      if (!parent) return;
      if (fit === 'width') {
        const available = parent.clientWidth - 0;
        setScale(Math.min(1, available / pageW));
      } else {
        // contain: fit both axes inside the viewport, kiosk-friendly.
        const aw = window.innerWidth;
        const ah = window.innerHeight;
        setScale(Math.min(aw / pageW, ah / pageH));
      }
    }
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [pageW, pageH, fit]);

  const sortedNodes = [...(page.nodes || [])].sort((a, b) => (a.z || 0) - (b.z || 0));

  return (
    <div ref={wrapRef} style={{ width: pageW * scale, height: pageH * scale, position: 'relative' }}>
      <div
        style={{
          width: pageW, height: pageH,
          background: page.background || '#fff',
          position: 'relative',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          overflow: 'hidden'
        }}
      >
        {sortedNodes.map(node => (
          <NodeView key={node.id} node={node} itemIndex={itemIndex} lang={lang} />
        ))}
      </div>
    </div>
  );
}

function NodeView({ node, itemIndex, lang }) {
  if (node.hidden) return null;
  // Visibility link: any node can be tied to a catalog item's stock so
  // decorative elements (badges, callouts, background photos) disappear
  // alongside a product that sells out — not just its bound price line. The
  // link is optional and defaults to hiding when the item is unavailable.
  if (node.link?.itemId && node.link.hideWhenOOS !== false) {
    const linked = itemIndex.get(node.link.itemId);
    if (linked && linked.available === false) return null;
  }

  const baseStyle = {
    position: 'absolute',
    left: node.x || 0,
    top: node.y || 0,
    width: node.w || 0,
    height: node.h || 0,
    transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
    transformOrigin: 'center center'
  };

  if (node.type === 'text') {
    // Auto-width text hugs its glyphs: drop the fixed width and don't wrap, so
    // the DOM box matches what the editor measured (avoids 1-px engine
    // differences clipping the last letter).
    if (node.autoWidth) {
      return (
        <div style={{ ...baseStyle, width: 'auto', height: 'auto', whiteSpace: 'nowrap', ...textStyle(node.style) }}>
          {node.text || ''}
        </div>
      );
    }
    return <div style={{ ...baseStyle, ...textStyle(node.style), display: 'flex', alignItems: 'center', justifyContent: justifyFromAlign(node.style?.align) }}>{node.text || ''}</div>;
  }

  if (node.type === 'image') {
    return (
      <div style={baseStyle}>
        <img
          src={node.src}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: node.fit || 'cover', display: 'block', borderRadius: node.style?.borderRadius || 0 }}
        />
      </div>
    );
  }

  if (node.type === 'path') {
    // Points are page-absolute; a viewBox at the node's bbox maps them 1:1
    // into an SVG positioned at that bbox. overflow:visible so wide strokes
    // near the edge aren't clipped.
    const s = node.style || {};
    const x = node.x || 0, y = node.y || 0, w = Math.max(1, node.w || 1), h = Math.max(1, node.h || 1);
    return (
      <svg
        style={{ position: 'absolute', left: x, top: y, width: w, height: h, overflow: 'visible' }}
        viewBox={`${x} ${y} ${w} ${h}`}
      >
        <path
          d={pathToSvgD(node.points, node.closed)}
          fill={s.fill && s.fill !== 'transparent' ? s.fill : 'none'}
          stroke={s.stroke || '#111'}
          strokeWidth={s.strokeWidth ?? 4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (node.type === 'shape') {
    const s = node.style || {};
    const shapeStyle = node.shape === 'circle'
      ? { ...baseStyle, borderRadius: '50%', background: s.fill || 'transparent', border: s.stroke ? `${s.strokeWidth || 1}px solid ${s.stroke}` : undefined }
      : node.shape === 'line'
      ? { ...baseStyle, background: s.fill || s.stroke || '#000' }
      : { ...baseStyle, background: s.fill || 'transparent', border: s.stroke ? `${s.strokeWidth || 1}px solid ${s.stroke}` : undefined, borderRadius: s.borderRadius || 0 };
    if (!node.label) return <div style={shapeStyle} />;
    // Centered label rides inside the shape box.
    const ls = node.labelStyle || {};
    return (
      <div style={{ ...shapeStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', boxSizing: 'border-box' }}>
        <span style={{ fontFamily: ls.fontFamily || 'Georgia, serif', fontSize: ls.fontSize || 32, fontWeight: ls.fontWeight || 700, color: ls.color || '#ffffff', textAlign: 'center', lineHeight: 1.15 }}>
          {node.label}
        </span>
      </div>
    );
  }

  if (node.type === 'item-binding') {
    const item = itemIndex.get(node.item_id);
    if (!item) {
      // Item was deleted from the catalog after the doc was authored. Show
      // a discrete "(no disponible)" so the layout doesn't reflow — owner
      // sees it on next preview and re-binds.
      return <div style={{ ...baseStyle, ...textStyle(node.style), opacity: 0.35 }}>(no disponible)</div>;
    }
    // Out-of-stock handling: hide entirely if hide_when_out_of_stock is set,
    // otherwise dim + strikethrough so the slot is visible but obviously
    // unavailable. Default behavior (no flag) keeps the original render
    // — the editor opts in per binding.
    if (item.available === false) {
      if (node.hide_when_out_of_stock) return null;
      return <ItemBindingView node={node} item={item} lang={lang} outOfStock />;
    }
    return <ItemBindingView node={node} item={item} lang={lang} />;
  }

  if (node.type === 'whatsapp-button') {
    const s = node.style || {};
    const label = node.label || 'Pedir por WhatsApp';
    const href = (node.url || '').trim();
    const bg = s.fill || '#25D366';
    return (
      <a
        href={href || undefined}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => { if (!href) e.preventDefault(); e.stopPropagation(); }}
        style={{
          ...baseStyle,
          display: 'flex', alignItems: 'center', justifyContent: justifyFromAlign(s.align) === 'flex-start' ? 'center' : justifyFromAlign(s.align),
          gap: Math.max(6, (s.fontSize || 28) * 0.35),
          padding: s.padding ?? 12,
          boxSizing: 'border-box',
          background: bg,
          color: s.color || '#ffffff',
          borderRadius: s.borderRadius ?? 999,
          fontFamily: s.fontFamily || 'system-ui, sans-serif',
          fontSize: s.fontSize || 28,
          fontWeight: s.fontWeight || 800,
          textDecoration: 'none',
          cursor: href ? 'pointer' : 'default'
        }}
      >
        <WhatsAppGlyph size={(s.fontSize || 28) * 0.95} />
        <span>{label}</span>
      </a>
    );
  }

  if (node.type === 'date-field') {
    const s = node.style || {};
    // Prefer an explicit value; else pull the bound item's roast_date so a
    // freshness line stays live with the catalog.
    const bound = node.item_id ? itemIndex.get(node.item_id) : null;
    const value = node.value || bound?.roast_date || null;
    const dateStr = formatDateField(value, { lang, relative: node.relative !== false });
    const emoji = node.emoji || '';
    const label = node.label || '';
    const text = [emoji, label, dateStr].filter(Boolean).join(' ');
    if (!text) return <div style={{ ...baseStyle, ...textStyle(s), opacity: 0.35 }}>{emoji || '📅'}</div>;
    return (
      <div style={{ ...baseStyle, ...textStyle(s), display: 'flex', alignItems: 'center', justifyContent: justifyFromAlign(s.align) }}>
        {text}
      </div>
    );
  }

  // Unknown node type — render an empty bounding box so existing layouts
  // don't shift when future node types ship.
  return <div style={baseStyle} />;
}

// Inline WhatsApp mark, shared by the whatsapp-button node. Kept local to the
// renderer so the public bundle carries no icon-font dependency.
function WhatsAppGlyph({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.76.46 3.45 1.34 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.4 1.3-1.94 1.35-.5.05-.98.23-3.3-.69-2.78-1.1-4.56-3.94-4.7-4.13-.14-.19-1.13-1.5-1.13-2.86 0-1.36.71-2.03.97-2.31.24-.26.53-.32.7-.32.18 0 .35 0 .5.01.16.01.38-.06.59.45.24.58.81 2 .88 2.15.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.18-.28.37-.23.62-.14.25.09 1.61.76 1.89.9.28.14.46.21.53.32.07.12.07.66-.17 1.34Z"/>
    </svg>
  );
}

function ItemBindingView({ node, item, lang, outOfStock = false }) {
  const fields = node.fields && node.fields.length > 0 ? node.fields : ['name', 'price'];
  const layout = node.layout === 'stacked' ? 'column' : 'row';
  const s = node.style || {};
  // Auto-box: the binding hugs its content instead of filling the authored
  // w/h — mirrors the free-text autoWidth option so dynamic item text never
  // clips. The name column stops flex-growing so the box collapses to fit.
  const auto = !!node.autoWidth;
  const parts = [];

  for (const f of fields) {
    if (f === 'emoji' && item.emoji) parts.push(<span key="emoji" style={{ marginRight: 12 }}>{item.emoji}</span>);
    if (f === 'image' && item.image_url) parts.push(<img key="image" src={item.image_url} alt="" style={{ height: auto ? '1.2em' : '100%', objectFit: 'cover', borderRadius: 8 }} />);
    if (f === 'name') parts.push(<span key="name" style={{ flex: auto ? '0 0 auto' : 1, whiteSpace: auto ? 'nowrap' : undefined }}>{item.name}</span>);
    if (f === 'price') parts.push(
      <span key="price" style={{ whiteSpace: 'nowrap', marginLeft: 16 }}>
        {item.price_type === 'open' ? '—' : formatForDisplay(item.price_cents, lang)}
      </span>
    );
  }

  const baseStyle = {
    position: 'absolute',
    left: node.x || 0, top: node.y || 0,
    width: auto ? 'auto' : (node.w || 0), height: auto ? 'auto' : (node.h || 0),
    whiteSpace: auto ? 'nowrap' : undefined,
    transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
    transformOrigin: 'center center',
    display: 'flex',
    flexDirection: layout,
    alignItems: 'center',
    gap: 8,
    padding: s.padding ?? 8,
    background: s.fill || 'transparent',
    border: s.stroke && s.strokeWidth ? `${s.strokeWidth}px solid ${s.stroke}` : undefined,
    borderRadius: s.borderRadius || 0,
    boxSizing: 'border-box',
    ...textStyle(s),
    justifyContent: justifyFromAlign(s.align),
    ...(outOfStock ? { opacity: 0.45, textDecoration: 'line-through' } : null)
  };

  return <div style={baseStyle}>{parts}</div>;
}

function textStyle(s = {}) {
  return {
    fontFamily: s.fontFamily || 'system-ui, -apple-system, sans-serif',
    fontSize: s.fontSize || 24,
    fontWeight: s.fontWeight || 400,
    fontStyle: s.fontStyle || 'normal',
    color: s.color || '#111',
    lineHeight: s.lineHeight || 1.15,
    letterSpacing: s.letterSpacing || 0,
    textAlign: s.align || 'left'
  };
}

function justifyFromAlign(a) {
  if (a === 'center') return 'center';
  if (a === 'right')  return 'flex-end';
  return 'flex-start';
}
