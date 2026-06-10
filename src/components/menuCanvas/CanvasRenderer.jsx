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
import { buildItemIndex } from '../../utils/canvasDocument';
import { formatForDisplay } from '../../utils/moneyUtils';

export default function CanvasRenderer({ document, data, lang, isTv = false }) {
  if (!document?.pages?.length) return null;
  const pageW = document.page_size?.w || 1920;
  const pageH = document.page_size?.h || 1080;
  const itemIndex = useMemo(() => buildItemIndex(data?.categories || []), [data]);

  // TV mode: render only the current page in fullscreen; rotation hook in
  // PublicMenu's TvMode owns the page index. For /menu we stack pages
  // vertically so customers can scroll the whole document.
  if (isTv) {
    return <PageStack pages={document.pages} pageW={pageW} pageH={pageH} itemIndex={itemIndex} lang={lang} fit="contain" />;
  }
  return <PageStack pages={document.pages} pageW={pageW} pageH={pageH} itemIndex={itemIndex} lang={lang} fit="width" />;
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

  if (node.type === 'shape') {
    const s = node.style || {};
    if (node.shape === 'circle') {
      return <div style={{ ...baseStyle, borderRadius: '50%', background: s.fill || 'transparent', border: s.stroke ? `${s.strokeWidth || 1}px solid ${s.stroke}` : undefined }} />;
    }
    if (node.shape === 'line') {
      return <div style={{ ...baseStyle, background: s.fill || s.stroke || '#000' }} />;
    }
    // rect (default)
    return <div style={{ ...baseStyle, background: s.fill || 'transparent', border: s.stroke ? `${s.strokeWidth || 1}px solid ${s.stroke}` : undefined, borderRadius: s.borderRadius || 0 }} />;
  }

  if (node.type === 'item-binding') {
    const item = itemIndex.get(node.item_id);
    if (!item) {
      // Item was deleted from the catalog after the doc was authored. Show
      // a discrete "(no disponible)" so the layout doesn't reflow — owner
      // sees it on next preview and re-binds.
      return <div style={{ ...baseStyle, ...textStyle(node.style), opacity: 0.35 }}>(no disponible)</div>;
    }
    return <ItemBindingView node={node} item={item} lang={lang} />;
  }

  // Unknown node type — render an empty bounding box so existing layouts
  // don't shift when future node types ship.
  return <div style={baseStyle} />;
}

function ItemBindingView({ node, item, lang }) {
  const fields = node.fields && node.fields.length > 0 ? node.fields : ['name', 'price'];
  const layout = node.layout === 'stacked' ? 'column' : 'row';
  const s = node.style || {};
  const parts = [];

  for (const f of fields) {
    if (f === 'emoji' && item.emoji) parts.push(<span key="emoji" style={{ marginRight: 12 }}>{item.emoji}</span>);
    if (f === 'image' && item.image_url) parts.push(<img key="image" src={item.image_url} alt="" style={{ height: '100%', objectFit: 'cover', borderRadius: 8 }} />);
    if (f === 'name') parts.push(<span key="name" style={{ flex: 1 }}>{item.name}</span>);
    if (f === 'price') parts.push(
      <span key="price" style={{ whiteSpace: 'nowrap', marginLeft: 16 }}>
        {item.price_type === 'open' ? '—' : formatForDisplay(item.price_cents, lang)}
      </span>
    );
  }

  const baseStyle = {
    position: 'absolute',
    left: node.x || 0, top: node.y || 0, width: node.w || 0, height: node.h || 0,
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
    justifyContent: justifyFromAlign(s.align)
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
