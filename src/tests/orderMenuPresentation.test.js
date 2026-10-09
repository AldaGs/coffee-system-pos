import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import OrderCatalog from '../components/ordering/OrderCatalog';
import CanvasRenderer from '../components/menuCanvas/CanvasRenderer';
import OrderDesignView from '../components/ordering/OrderDesignView';

const categories = [{ id: 'drinks', name: 'Drinks', items: [
  { id: 'coffee', name: 'Coffee', emoji: '☕', price_cents: 4500, price_type: 'fixed' },
  { id: 'sold', name: 'Sold coffee', price_cents: 4500, price_type: 'fixed', available: false },
  { id: 'market', name: 'Market item', price_cents: 0, price_type: 'market' },
] }, { id: 'food', name: 'Food', items: [{ id: 'cake', name: 'Cake', price_type: 'fixed', price_cents: 6000 }] }];
const props = { categories, active: categories[0], setActiveCat: () => {}, brand: '#f28b05', s: { add: 'Add', soldOut: 'Sold out' }, fmt: (cents) => `$${cents / 100}`, onAdd: () => {} };

describe('ordering catalog presentation', () => {
  it.each([false, true])('preserves category navigation and active items (wide=%s)', (wide) => {
    const html = renderToStaticMarkup(createElement(OrderCatalog, { ...props, wide }));
    expect(html).toContain('Drinks');
    expect(html).toContain('Food');
    expect(html).toContain('Coffee');
    expect(html).toContain('$45');
    expect(html).toContain('Sold out');
    expect(html).not.toContain('Cake');
    expect(html.match(/>Add<\/button>/g)).toHaveLength(1);
  });
  it.each(['closed', 'paused', 'disabled'])('keeps the catalog read-only while %s', (gate) => {
    const html = renderToStaticMarkup(createElement(OrderCatalog, { ...props, gate }));
    expect(html).toContain('Coffee');
    expect(html).not.toContain('>Add</button>');
  });
  it('displays the selected category', () => {
    const html = renderToStaticMarkup(createElement(OrderCatalog, { ...props, active: categories[1] }));
    expect(html).toContain('Cake');
    expect(html).not.toContain('Sold coffee');
  });
});

describe('selected design presentation', () => {
  const document = { version: 1, page_size: { w: 600, h: 800 }, pages: [{ nodes: [{ id: 'binding', type: 'item-binding', item_id: 'coffee', x: 10, y: 20, w: 200, h: 60 }] }] };
  const render = (doc, extra = {}) => renderToStaticMarkup(createElement(OrderDesignView, { data: { menu: { kind: 'designed', data: { document: doc } }, categories }, lang: 'en', brand: '#f28b05', onSelectItem: () => {}, catalog: createElement('div', null, 'Catalog fixture'), ...extra }));
  it('starts eligible designs in Design and keeps closed designs visible', () => {
    expect(render(document)).toContain('aria-label="Add Coffee"');
    expect(render(document)).not.toContain('Catalog fixture');
    expect(render(document, { gate: 'closed' })).toContain('aria-label="Unavailable: Coffee"');
    expect(render(document)).toContain('Tap a linked product');
    expect(render(document, { lang: 'es' })).toContain('Toca un producto vinculado');
  });
  it('keeps template-only and invalid documents in Catalog', () => {
    expect(render(null)).toContain('Catalog fixture');
    expect(render({ ...document, page_size: { w: 0, h: 800 } })).toContain('This design is unavailable');
  });
  it('starts designs with no eligible actions in Catalog and offers Design', () => {
    const doc = { ...document, pages: [{ nodes: [{ type: 'text', text: 'Decorative' }] }] };
    const html = render(doc);
    expect(html).toContain('Catalog fixture');
    expect(html).toContain('no available linked products');
    expect(html).toContain('>Design</button>');
  });
});

describe('canvas ordering presentation', () => {
  const nodes = [
    { id: 'binding', type: 'item-binding', item_id: 'coffee', x: 10, y: 20, w: 200, h: 60, autoWidth: true, rotation: 15 },
    { id: 'text', type: 'text', text: 'Handwritten $1', order_item_id: 'coffee', x: 10, y: 100, autoWidth: true },
    { id: 'image', type: 'image', src: '/fixture.png', order_item_id: 'coffee', x: 10, y: 160, w: 100, h: 60 },
    { id: 'shape', type: 'shape', shape: 'circle', label: 'Order', order_item_id: 'coffee', x: 10, y: 230, w: 100, h: 100 },
    { id: 'sold', type: 'text', text: 'Sold', order_item_id: 'sold', x: 10, y: 350, w: 100, h: 30 },
    { id: 'filtered', type: 'text', text: 'Filtered', order_item_id: 'filtered', x: 10, y: 390, w: 100, h: 30 },
    { id: 'hidden', type: 'text', text: 'Hidden', order_item_id: 'coffee', hidden: true },
    { id: 'decor', type: 'text', text: 'Decoration' },
    { id: 'date', type: 'date-field', item_id: 'coffee' },
    { id: 'whatsapp', type: 'whatsapp-button', order_item_id: 'coffee', url: 'https://wa.me/123' },
  ];
  const document = { version: 1, page_size: { w: 600, h: 800 }, pages: [{ nodes }] };
  const render = (extra = {}) => renderToStaticMarkup(createElement(CanvasRenderer, { document, data: { categories }, lang: 'en', ordering: { onSelectItem: () => {}, gate: null }, ...extra }));
  it('renders native order buttons using live names and preserves authored geometry', () => {
    const html = render();
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Add Coffee"');
    expect(html).toContain('type="button"');
    expect(html).toContain('rotate(15deg)');
    expect(html).toContain('width:auto');
    expect(html).toContain('Handwritten $1');
    expect(html).not.toContain('>Hidden<');
    expect(html).toContain('href="https://wa.me/123"');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
  it('disables every action while gated without removing artwork', () => {
    const html = render({ ordering: { onSelectItem: () => {}, gate: 'paused' } });
    expect(html.match(/disabled=""/g)).toHaveLength(6);
    expect(html).toContain('Handwritten $1');
  });
  it('keeps intentionally stock-hidden bindings out of the action list', () => {
    const doc = { ...document, pages: [{ nodes: [{ type: 'item-binding', item_id: 'sold', hide_when_out_of_stock: true }] }] };
    const html = render({ document: doc });
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Sold coffee');
  });
  it('renders each page with its own native actions', () => {
    const doc = { ...document, pages: [{ nodes: [nodes[0]] }, { nodes: [nodes[1]] }] };
    expect(render({ document: doc }).match(/<button/g)).toHaveLength(2);
  });
  it.each([{ ordering: undefined }, { isTv: true }, { isPrint: true }])('keeps public/TV/print renderers read-only %o', (extra) => {
    const html = render(extra);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('tp-canvas-order-action');
    expect(html).toContain('Handwritten $1');
  });
});
