// Phase 4c.0 — canvas document schema + helpers.
//
// A canvas-kind menu is stored on menu.data.document. The document is
// renderer-agnostic JSON; the public-side <CanvasRenderer> walks it with
// plain DOM, the (future) editor uses react-konva over the same shape.
//
// All node coordinates are authored in PAGE pixels (the page_size below).
// The renderer applies a single CSS scale() to fit the viewport, so the
// document is resolution-independent — it looks identical at 360px wide,
// at 1920px, and at 4K, without any per-node math.
//
// Invariant: nodes of type 'item-binding' store only { item_id, fields }.
// Live name/price/image come from the RPC payload at render time, so a
// price change in the catalog propagates without re-saving the document.

// Page presets. Digital sizes are CSS pixels; print sizes are pixel
// equivalents at 150 DPI so they round-trip cleanly through @page CSS
// rules. The renderer treats every value as opaque pixels — the print
// CSS is what tells the browser to lay them out on physical paper.
export const PAGE_PRESETS = {
  '16:9':     { label: 'Pantalla 16:9 (1920×1080)', w: 1920, h: 1080, category: 'digital' },
  '9:16':     { label: 'Vertical 9:16 (1080×1920)', w: 1080, h: 1920, category: 'digital' },
  'a4-p':     { label: 'A4 vertical (210×297mm)',   w: 1240, h: 1754, category: 'print', paper: { w: '210mm', h: '297mm' } },
  'a4-l':     { label: 'A4 horizontal (297×210mm)', w: 1754, h: 1240, category: 'print', paper: { w: '297mm', h: '210mm' } },
  'letter-p': { label: 'Carta vertical (8.5×11")',  w: 1275, h: 1650, category: 'print', paper: { w: '8.5in', h: '11in' } },
  'letter-l': { label: 'Carta horizontal (11×8.5")', w: 1650, h: 1275, category: 'print', paper: { w: '11in', h: '8.5in' } }
};

// Reverse-lookup a preset key from a page_size, for editor UI display.
export function presetKeyFor(size) {
  if (!size) return null;
  for (const [key, p] of Object.entries(PAGE_PRESETS)) {
    if (p.w === size.w && p.h === size.h) return key;
  }
  return null;
}

export const DOC_VERSION = 1;

export function newDocument(preset = '16:9') {
  const size = PAGE_PRESETS[preset] || PAGE_PRESETS['16:9'];
  return {
    version: DOC_VERSION,
    page_size: { w: size.w, h: size.h },
    pages: [newPage()]
  };
}

export function newPage() {
  return { background: '#ffffff', nodes: [] };
}

// Quick-and-dirty unique-ish id for nodes. Editor will replace with nanoid.
export function nodeId() {
  return 'n_' + Math.random().toString(36).slice(2, 10);
}

// Sample document — used to seed a new canvas-kind menu so the foundation
// renderer has something to render. Shows the four supported node types.
// shopName/firstItem are passed in so the seed reflects the actual catalog.
export function sampleDocument({ shopName = 'Tu Menú', firstItemId = null } = {}) {
  const doc = newDocument('16:9');
  const page = doc.pages[0];
  page.background = '#0e1620';
  page.nodes = [
    {
      id: nodeId(), type: 'shape', shape: 'rect',
      x: 0, y: 0, w: 1920, h: 220, rotation: 0, z: 0,
      style: { fill: '#1c2a3a', stroke: 'transparent' }
    },
    {
      id: nodeId(), type: 'text',
      x: 80, y: 60, w: 1760, h: 140, rotation: 0, z: 1,
      text: shopName,
      style: { fontFamily: 'Georgia, serif', fontSize: 96, fontWeight: 800, color: '#f5f0e1', align: 'center' }
    },
    {
      id: nodeId(), type: 'text',
      x: 80, y: 280, w: 1760, h: 80, rotation: 0, z: 1,
      text: 'Lienzo (beta) — pronto editable',
      style: { fontFamily: 'Georgia, serif', fontSize: 36, fontWeight: 400, color: '#a8b3c2', align: 'center' }
    },
    firstItemId && {
      id: nodeId(), type: 'item-binding',
      x: 200, y: 420, w: 1520, h: 160, rotation: 0, z: 2,
      item_id: firstItemId,
      fields: ['name', 'price'],
      layout: 'inline',
      style: { fontFamily: 'Georgia, serif', fontSize: 64, color: '#f5f0e1', align: 'left' }
    }
  ].filter(Boolean);
  return doc;
}

// Flat lookup across all categories — bindings reference items by id and
// don't know their category. O(items) per lookup; cache the map at render
// root to avoid repeating per binding.
export function buildItemIndex(categories) {
  const m = new Map();
  for (const c of categories || []) {
    for (const it of c.items || []) m.set(it.id, it);
  }
  return m;
}
