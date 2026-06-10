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

// ────────────────────────────────────────────────────────────────────────
// Phase 4c.6 — starter templates.
//
// These materialize the three Phase 4a layouts (Lista / Tarjetas / Pizarra)
// as canvas documents so a user opening a blank designed menu gets a real
// fork-and-edit starting point instead of the near-empty sample. Each
// factory takes the catalog (already filtered to the selected categories)
// and spawns one item-binding node per item — matching the materialize-on-
// drop binding model: the *set* of nodes is fixed at design time, but each
// node still pulls live name/price/availability by item_id at render.
//
// Catalog shape expected (from menu.js loadMenu(), assembled by the caller):
//   [{ name: string, items: [{ id, name }] }]   // only id is load-bearing
//
// Each factory returns { document, theme } so the caller can write both
// menu.data.document and menu.data.theme in one update — the theme keeps the
// template-mode → canvas-mode visual identity (Phase 4b tokens).

function emptyCatNotice(page, msg, W, M, y, color, font) {
  page.nodes.push({
    id: nodeId(), type: 'text', x: M, y, w: W - 2 * M, h: 80, rotation: 0, z: 1,
    text: msg, style: { fontFamily: font, fontSize: 32, fontWeight: 400, fontStyle: 'italic', color, align: 'left' }
  });
}

// Shared vertical-flow engine for the list-shaped templates (Lista, Pizarra).
// Lays the shop title, then each category as a heading + a stack of full-width
// item rows, opening a fresh page per category and overflowing onto
// continuation pages when a category is taller than one page.
function flowListDoc({ W, H, M, shopName, categories, s }) {
  const doc = { version: DOC_VERSION, page_size: { w: W, h: H }, pages: [] };
  const bottom = H - M;
  let page = null, y = 0, first = true;

  function newPage() {
    page = { background: s.bg, nodes: [] };
    doc.pages.push(page);
    y = M;
  }
  function heading(text) {
    page.nodes.push({
      id: nodeId(), type: 'text', x: M, y, w: W - 2 * M, h: s.headingH, rotation: 0, z: 1,
      text, style: { fontFamily: s.font, fontSize: s.headingSize, fontWeight: 800, color: s.accent, align: 'left' }
    });
    y += s.headingH;
    if (s.divider) {
      page.nodes.push({
        id: nodeId(), type: 'shape', shape: 'line', x: M, y, w: W - 2 * M, h: 3, rotation: 0, z: 0,
        style: { fill: s.divider }
      });
    }
    y += s.headingGap;
  }

  for (const cat of (categories || [])) {
    newPage();
    if (first) {
      page.nodes.push({
        id: nodeId(), type: 'text', x: M, y, w: W - 2 * M, h: s.titleH, rotation: 0, z: 1,
        text: shopName, style: { fontFamily: s.font, fontSize: s.titleSize, fontWeight: 800, color: s.ink, align: 'center' }
      });
      y += s.titleH + s.titleGap;
      first = false;
    }
    heading(cat.name);

    const items = cat.items || [];
    if (items.length === 0) {
      emptyCatNotice(page, '(sin productos)', W, M, y, s.muted, s.font);
      continue;
    }
    for (const it of items) {
      if (y + s.rowH > bottom) {
        newPage();
        heading(cat.name + ' …');
      }
      page.nodes.push({
        id: nodeId(), type: 'item-binding', x: M, y, w: W - 2 * M, h: s.rowH, rotation: 0, z: 1,
        item_id: it.id, fields: ['name', 'price'], layout: 'inline',
        style: { fontFamily: s.font, fontSize: s.rowSize, fontWeight: 400, color: s.ink, align: 'left', padding: 4 }
      });
      y += s.rowH + s.rowGap;
    }
  }

  if (doc.pages.length === 0) {
    newPage();
    page.nodes.push({
      id: nodeId(), type: 'text', x: M, y, w: W - 2 * M, h: s.titleH, rotation: 0, z: 1,
      text: shopName, style: { fontFamily: s.font, fontSize: s.titleSize, fontWeight: 800, color: s.ink, align: 'center' }
    });
  }
  return doc;
}

// Lista — clean serif menu on warm paper. Vertical 9:16, one category/page.
export function templateListDoc({ shopName = 'Menú', categories = [] } = {}) {
  const theme = { font_preset: 'serif', background: '#fbf7ef', text: '#2a2118', accent: '#a9612b', density: 'cozy' };
  const document = flowListDoc({
    W: 1080, H: 1920, M: 80, shopName, categories,
    s: {
      bg: '#fbf7ef', ink: '#2a2118', muted: '#9a8f80', accent: '#a9612b',
      font: 'Georgia, "Times New Roman", serif',
      titleSize: 88, titleH: 120, titleGap: 48,
      headingSize: 52, headingH: 72, headingGap: 28, divider: '#e0d4c0',
      rowSize: 40, rowH: 72, rowGap: 14
    }
  });
  return { document, theme };
}

// Pizarra — chalkboard look: dark slate, handwritten font, chalk-light text.
// Vertical 9:16, one category/page. Loads the "Permanent Marker" web font so
// the chalk look is identical on every device instead of falling back to
// whatever cursive face the OS happens to ship.
const CHALK_FONT_URL = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
export function templateChalkboardDoc({ shopName = 'Menú', categories = [] } = {}) {
  const theme = { font_preset: 'handwritten', background: '#1d2722', text: '#f3efe2', accent: '#e7c14c', density: 'cozy' };
  const document = flowListDoc({
    W: 1080, H: 1920, M: 90, shopName, categories,
    s: {
      bg: '#1d2722', ink: '#f3efe2', muted: '#8aa093', accent: '#e7c14c',
      font: '"Permanent Marker", "Chalkboard SE", "Bradley Hand", "Segoe Script", "Marker Felt", cursive',
      titleSize: 96, titleH: 130, titleGap: 50,
      headingSize: 60, headingH: 80, headingGap: 26, divider: '#3a4a40',
      rowSize: 44, rowH: 78, rowGap: 12
    }
  });
  document.fonts = [CHALK_FONT_URL];
  return { document, theme };
}

// ── Web-font loading for canvas documents ───────────────────────────────
// A document may carry `fonts: [googleFontsUrl, ...]`. Both renderers (public
// DOM + Konva editor) inject these as <link> tags so node `style.fontFamily`
// stacks that reference the web family resolve consistently. Independent of
// the Phase 4b theme font URL (menuTheme.js) — that path is template-mode.

export function docFontUrls(doc) {
  return Array.isArray(doc?.fonts) ? doc.fonts.filter(Boolean) : [];
}

// Pull the quoted CSS family name out of a Google Fonts URL, for
// document.fonts.load() priming in the editor. Returns [] on anything odd.
export function docFontFamilies(doc) {
  const out = [];
  for (const url of docFontUrls(doc)) {
    try {
      const u = new URL(url);
      // css2 uses ?family=Name:..., css (v1) uses ?family=Name|Name2
      const raw = u.searchParams.get('family');
      if (!raw) continue;
      for (const part of raw.split('|')) {
        const name = part.split(':')[0].replace(/\+/g, ' ').trim();
        if (name) out.push(`"${name}"`);
      }
    } catch { /* ignore malformed */ }
  }
  return out;
}

// Idempotently sync <link rel=stylesheet> tags for the document's fonts,
// removing any previously-injected ones no longer referenced.
export function syncDocFonts(doc) {
  if (typeof window === 'undefined' || !window.document) return;
  const head = window.document.head;
  const urls = docFontUrls(doc);
  head.querySelectorAll('link[data-tinypos-doc-font]').forEach(l => {
    if (!urls.includes(l.href) && !urls.includes(l.getAttribute('href'))) l.remove();
  });
  for (const url of urls) {
    const already = Array.from(head.querySelectorAll('link[data-tinypos-doc-font]'))
      .some(l => l.getAttribute('href') === url);
    if (already) continue;
    const link = window.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.setAttribute('data-tinypos-doc-font', '1');
    head.appendChild(link);
  }
}

// Tarjetas — card grid on a 16:9 page. Each item is a rounded panel with the
// name + price stacked inside. Cards flow left-to-right, top-to-bottom across
// pages; categories are introduced by a band that spans the row.
export function templateCardsDoc({ shopName = 'Menú', categories = [] } = {}) {
  const W = 1920, H = 1080, M = 80;
  const bg = '#f4f1ec', ink = '#2b2b2b', accent = '#c2703d', card = '#ffffff';
  const font = '"Helvetica Neue", "Inter", system-ui, sans-serif';
  const cols = 3, gap = 36;
  const cardW = Math.floor((W - 2 * M - (cols - 1) * gap) / cols);
  const cardH = 280;
  const headingH = 84;
  const bottom = H - M;

  const theme = { font_preset: 'display', background: bg, text: ink, accent, density: 'cozy' };
  const doc = { version: DOC_VERSION, page_size: { w: W, h: H }, pages: [] };
  let page = null, y = 0, col = 0, first = true;

  function newPage() {
    page = { background: bg, nodes: [] };
    doc.pages.push(page);
    y = M; col = 0;
  }
  function rowBreak() { col = 0; y += cardH + gap; }
  function band(text, withTitle) {
    if (col !== 0) rowBreak();
    if (y + headingH > bottom) newPage();
    if (withTitle) {
      page.nodes.push({
        id: nodeId(), type: 'text', x: M, y, w: W - 2 * M, h: 90, rotation: 0, z: 1,
        text: shopName, style: { fontFamily: font, fontSize: 72, fontWeight: 800, color: ink, align: 'center' }
      });
      y += 110;
      if (y + headingH > bottom) newPage();
    }
    page.nodes.push({
      id: nodeId(), type: 'text', x: M, y, w: W - 2 * M, h: headingH, rotation: 0, z: 1,
      text, style: { fontFamily: font, fontSize: 46, fontWeight: 800, color: accent, align: 'left' }
    });
    y += headingH + 12;
  }

  newPage();
  for (const cat of (categories || [])) {
    band(cat.name, first);
    first = false;
    const items = cat.items || [];
    if (items.length === 0) {
      emptyCatNotice(page, '(sin productos)', W, M, y, '#9a8f80', font);
      rowBreak();
      continue;
    }
    for (const it of items) {
      if (col >= cols) rowBreak();
      if (y + cardH > bottom) { newPage(); }
      const x = M + col * (cardW + gap);
      page.nodes.push({
        id: nodeId(), type: 'shape', shape: 'rect', x, y, w: cardW, h: cardH, rotation: 0, z: 0,
        style: { fill: card, stroke: '#e6e0d6', strokeWidth: 1, borderRadius: 18 }
      });
      page.nodes.push({
        id: nodeId(), type: 'item-binding', x: x + 24, y: y + 24, w: cardW - 48, h: cardH - 48, rotation: 0, z: 1,
        item_id: it.id, fields: ['name', 'price'], layout: 'stacked',
        style: { fontFamily: font, fontSize: 38, fontWeight: 700, color: ink, align: 'center', padding: 8 }
      });
      col++;
    }
    rowBreak();
  }
  return { document: doc, theme };
}

// Lookup by template id, mirroring DesignedEditor's template ids
// ('list' | 'cards' | 'chalkboard'). Returns { document, theme }.
export function templateDoc(template, ctx) {
  switch (template) {
    case 'cards':      return templateCardsDoc(ctx);
    case 'chalkboard': return templateChalkboardDoc(ctx);
    case 'list':
    default:           return templateListDoc(ctx);
  }
}
