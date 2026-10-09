import { describe, expect, it } from 'vitest';
import { canOrderItem, resolveOrderTarget, isOrderDocument, orderItemId } from '../utils/canvasOrdering';
import { cloneNodeGeometry } from '../utils/canvasDocument';

const item = { id: 'coffee', name: 'Coffee', available: true, price_type: 'fixed', price_cents: 4500 };
const items = new Map([[item.id, item]]);

describe('canvas order targets', () => {
  it('uses existing bindings and live catalog values', () => {
    expect(resolveOrderTarget({ type: 'item-binding', item_id: item.id, order_item_id: 'other' }, items)).toBe(item);
  });
  it.each([{ type: 'text' }, { type: 'image' }, { type: 'shape', shape: 'rect' }, { type: 'shape', shape: 'circle' }])('supports an explicit action on %o', (node) => {
    expect(resolveOrderTarget({ ...node, order_item_id: item.id, text: '$1' }, items)).toBe(item);
  });
  it.each(['date-field', 'path', 'whatsapp', 'unknown'])('does not infer actions on %s', (type) => {
    expect(resolveOrderTarget({ type, item_id: item.id, order_item_id: item.id }, items)).toBeNull();
  });
  it('keeps lines and visibility-only links decorative', () => {
    expect(resolveOrderTarget({ type: 'shape', shape: 'line', order_item_id: item.id }, items)).toBeNull();
    expect(resolveOrderTarget({ type: 'text', link: { itemId: item.id } }, items)).toBeNull();
  });
  it('rejects hidden, deleted, and category-filtered targets', () => {
    expect(resolveOrderTarget({ type: 'text', hidden: true, order_item_id: item.id }, items)).toBeNull();
    expect(resolveOrderTarget({ type: 'text', order_item_id: 'deleted' }, items)).toBeNull();
    expect(resolveOrderTarget({ type: 'item-binding', item_id: item.id }, new Map())).toBeNull();
  });
  it('respects independent visibility links', () => {
    const catalog = new Map([...items, ['stock', { id: 'stock', available: false }]]);
    expect(resolveOrderTarget({ type: 'text', order_item_id: item.id, link: { itemId: 'stock' } }, catalog)).toBeNull();
    expect(resolveOrderTarget({ type: 'text', order_item_id: item.id, link: { itemId: 'stock', hideWhenOOS: false } }, catalog)).toBe(item);
  });
  it('rejects unavailable and non-fixed products', () => {
    for (const changed of [{ available: false }, { price_type: 'market' }, { price_type: undefined }]) {
      const catalog = new Map([[item.id, { ...item, ...changed }]]);
      expect(resolveOrderTarget({ type: 'item-binding', item_id: item.id }, catalog)).toBeNull();
      expect(canOrderItem(item.id, catalog)).toBe(false);
    }
  });
  it.each(['closed', 'paused', 'disabled'])('blocks the %s gate', (gate) => {
    expect(canOrderItem(item.id, items, gate)).toBe(false);
    expect(resolveOrderTarget({ type: 'item-binding', item_id: item.id }, items, gate)).toBeNull();
  });
  it('permits eligible catalog items independently of artwork', () => {
    expect(canOrderItem(item.id, items)).toBe(true);
    expect(canOrderItem('deleted', items)).toBe(false);
  });
});

describe('ordering document compatibility', () => {
  const doc = { version: 1, page_size: { w: 600, h: 800 }, pages: [{ nodes: [{ type: 'text', text: 'Menu' }] }] };
  it('accepts supported documents including future node types', () => {
    expect(isOrderDocument(doc)).toBe(true);
    expect(isOrderDocument({ ...doc, pages: [{ nodes: [{ type: 'future-type' }, ...doc.pages[0].nodes] }] })).toBe(true);
  });
  it.each([null, {}, { ...doc, version: 2 }, { ...doc, page_size: { w: 0, h: 800 } }, { ...doc, page_size: { w: Infinity, h: 800 } }, { ...doc, pages: [] }, { ...doc, pages: [{ nodes: [] }] }, { ...doc, pages: [{ nodes: null }] }, { ...doc, pages: [{ nodes: [null] }] }])('rejects empty or structurally invalid documents %o', (value) => {
    expect(isOrderDocument(value)).toBe(false);
  });
  it('only reports supported action IDs', () => {
    expect(orderItemId({ type: 'text', order_item_id: 'coffee' })).toBe('coffee');
    expect(orderItemId({ type: 'item-binding', item_id: 'coffee' })).toBe('coffee');
    expect(orderItemId({ type: 'shape', shape: 'line', order_item_id: 'coffee' })).toBeNull();
  });
  it('preserves independent action and visibility fields through geometry clones and JSON reload', () => {
    const node = { id: 'n', type: 'text', x: 10, y: 20, order_item_id: 'coffee', link: { itemId: 'stock', hideWhenOOS: true } };
    const restored = JSON.parse(JSON.stringify(cloneNodeGeometry(node)));
    expect(restored.order_item_id).toBe('coffee');
    expect(restored.link).toEqual(node.link);
    expect(restored.id).not.toBe(node.id);
  });
});
