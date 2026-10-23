// Starting geometry and style for each element the toolbar adds.
export const PATH_STYLE = { stroke: '#111111', strokeWidth: 6, fill: 'transparent' };

export const textNode = (pageW, pageH, text) => ({
  type: 'text', autoWidth: true, x: pageW / 2 - 200, y: pageH / 2 - 40, w: 240, h: 64, rotation: 0,
  text, style: { fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 700, color: '#111', align: 'left' },
});

export const rectNode = (pageW, pageH) => ({
  type: 'shape', shape: 'rect', x: pageW / 2 - 150, y: pageH / 2 - 100, w: 300, h: 200, rotation: 0,
  style: { fill: '#f28b05', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 },
});

export const circleNode = (pageW, pageH) => ({
  type: 'shape', shape: 'circle', x: pageW / 2 - 100, y: pageH / 2 - 100, w: 200, h: 200, rotation: 0,
  style: { fill: '#1c2a3a', stroke: 'transparent', strokeWidth: 0 },
});

export const imageNode = (src) => ({ type: 'image', x: 200, y: 200, w: 600, h: 400, rotation: 0, src, fit: 'cover' });

export const whatsAppNode = (pageW, pageH, label) => ({
  type: 'whatsapp-button',
  x: Math.round(pageW / 2 - 260), y: Math.round(pageH / 2 - 40), w: 520, h: 88, rotation: 0,
  label, url: '',
  style: { fill: '#25D366', color: '#ffffff', fontFamily: 'system-ui, sans-serif', fontSize: 34, fontWeight: 800, borderRadius: 999, align: 'center', padding: 16 },
});

export const dateNode = (pageW, pageH, label) => ({
  type: 'date-field',
  x: Math.round(pageW / 2 - 200), y: Math.round(pageH / 2 - 30), w: 400, h: 60, rotation: 0,
  emoji: '🔥', label, value: '', relative: true, item_id: null,
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 32, fontWeight: 600, color: '#8a6d3b', align: 'left' },
});

// One binding per picked product, stacked from near the top. The set of nodes is
// fixed when placed; each one's name and price stay live from the menu.
export const bindingRows = (pageW, pageH, itemIds) => {
  const rowH = 96, rowGap = 16;
  return itemIds.map((itemId, i) => ({
    type: 'item-binding',
    x: Math.round(pageW * 0.1), y: Math.round(pageH * 0.2) + i * (rowH + rowGap),
    w: Math.round(pageW * 0.8), h: rowH, rotation: 0,
    item_id: itemId, fields: ['emoji', 'name', 'price'], layout: 'inline',
    style: { fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 600, color: '#111', align: 'left' },
  }));
};
