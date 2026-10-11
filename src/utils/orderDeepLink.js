// "Order here" deep links: /order?add=ID[:QTY][,ID[:QTY]...] pre-fills the
// basket (e.g. from a shop's landing page). Pure helpers so they're testable.

const MAX_QTY = 20;

// "a:2,b" → [{ id: 'a', qty: 2 }, { id: 'b', qty: 1 }]; junk tokens dropped,
// repeated ids summed, qty clamped to 1..MAX_QTY.
export function parseAddParam(raw) {
  if (!raw) return [];
  const byId = new Map();
  String(raw).split(',').forEach((tok) => {
    const [rawId, rawQty] = tok.split(':');
    const id = (rawId || '').trim();
    if (!id) return;
    const n = parseInt(rawQty, 10);
    const qty = Number.isFinite(n) && n > 0 ? n : 1;
    byId.set(id, Math.min(MAX_QTY, (byId.get(id) || 0) + qty));
  });
  return [...byId].map(([id, qty]) => ({ id, qty }));
}

// Link for one item on the ordering page. `base` is e.g. https://ordena.shop.mx/order?p=REF
export function itemOrderLink(base, itemId) {
  const url = new URL(base);
  url.searchParams.set('add', itemId);
  return url.toString();
}
