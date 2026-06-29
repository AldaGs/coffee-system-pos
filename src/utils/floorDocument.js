// Floor-plan document schema + helpers. A floor_plan row stores one of these on
// floor_plan.data.document (see docs/tables.md). It is deliberately simpler than
// the menu canvas document: a single page holding only "table" nodes.
//
// All coordinates are authored in CANVAS pixels (size below). The runtime floor
// view (Phase 4) applies a single scale() to fit the viewport, so the layout is
// resolution-independent — same math as the menu CanvasRenderer.
//
// Node shape (one per table):
//   { id, number, name, seats, shape: 'round'|'square'|'rect', x, y, w, h, rotation }
// `id` is a client-generated uuid and is what active_tickets.table_id points at.
// `number` is the human label/number; `seats` is the expected cover count
// (overridable per ticket on open). x/y is the top-left in canvas pixels.

export const FLOOR_DOC_VERSION = 1;

// Default canvas area. Roomy 16:10-ish so a typical dining room fits without
// scrolling; the editor lets nodes be placed anywhere inside.
export const DEFAULT_FLOOR_SIZE = { w: 1600, h: 1000 };

export const TABLE_SHAPES = ['round', 'square', 'rect'];

export function newFloorDocument() {
  return {
    version: FLOOR_DOC_VERSION,
    size: { ...DEFAULT_FLOOR_SIZE },
    tables: [],
  };
}

// Sensible default geometry for a freshly-added table, nudged so successive
// adds don't stack exactly on top of each other.
export function newTableNode(index = 0, overrides = {}) {
  const shape = overrides.shape || 'round';
  const base = shape === 'rect' ? { w: 200, h: 120 } : { w: 120, h: 120 };
  const offset = (index % 6) * 28;
  return {
    id: crypto.randomUUID(),
    number: overrides.number ?? String(index + 1),
    name: overrides.name ?? '',
    seats: overrides.seats ?? 4,
    shape,
    x: 80 + offset,
    y: 80 + offset,
    ...base,
    rotation: 0,
    ...overrides,
  };
}

// Read all table nodes out of a (possibly null / legacy) document, defensively.
export function tablesOf(document) {
  if (!document || !Array.isArray(document.tables)) return [];
  return document.tables;
}

// Clamp a node's geometry so it stays within the canvas bounds. Keeps drags and
// resizes from parking a table off-screen where it can't be selected again.
export function clampNode(node, size = DEFAULT_FLOOR_SIZE) {
  const w = Math.max(40, Math.min(node.w, size.w));
  const h = Math.max(40, Math.min(node.h, size.h));
  const x = Math.max(0, Math.min(node.x, size.w - w));
  const y = Math.max(0, Math.min(node.y, size.h - h));
  return { ...node, x, y, w, h };
}

// Validate that table numbers are unique within a floor — duplicate numbers are
// the one thing that breaks the runtime floor (two tables, one label). Returns
// the list of offending numbers (empty = valid).
export function duplicateNumbers(document) {
  const seen = new Map();
  for (const t of tablesOf(document)) {
    const key = String(t.number || '').trim();
    if (!key) continue;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}
