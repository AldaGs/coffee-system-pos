// The index must contain only the selected menu's filtered public catalog.
import { DOC_VERSION } from './canvasDocument';

export function orderItemId(node) {
  if (!node) return null;
  if (node.type === 'item-binding') return node.item_id ?? null;
  const supported = node.type === 'text' || node.type === 'image'
    || (node.type === 'shape' && ['rect', 'circle'].includes(node.shape));
  return supported ? node.order_item_id ?? null : null;
}

export function isOrderDocument(doc) {
  if (doc?.version !== DOC_VERSION || !Number.isFinite(doc.page_size?.w) || doc.page_size.w <= 0
    || !Number.isFinite(doc.page_size?.h) || doc.page_size.h <= 0 || !Array.isArray(doc.pages) || !doc.pages.length) return false;
  if (!doc.pages.every(page => page && Array.isArray(page.nodes) && page.nodes.every(node => node && typeof node.type === 'string'))) return false;
  // Unknown nodes stay forward compatible, but cannot make an empty page useful.
  return doc.pages.some(page => page.nodes.some(node => !node.hidden
    && ['text', 'image', 'shape', 'path', 'item-binding', 'date-field', 'whatsapp-button'].includes(node.type)));
}

export function canOrderItem(id, itemsById, gate = null) {
  const item = itemsById.get(id);
  return !gate && !!item && item.available !== false && item.price_type === 'fixed';
}

// Visibility links remain independent of ordering actions. Resolve IDs only:
// handwritten names, prices, and date-field bindings never imply an action.
export function resolveOrderTarget(node, itemsById, gate = null) {
  if (!node || node.hidden) return null;
  if (node.link?.itemId && node.link.hideWhenOOS !== false && itemsById.get(node.link.itemId)?.available === false) return null;
  const id = orderItemId(node);
  return canOrderItem(id, itemsById, gate) ? itemsById.get(id) : null;
}
