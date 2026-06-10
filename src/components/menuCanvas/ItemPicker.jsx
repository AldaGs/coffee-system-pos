// Phase 4c.3 — catalog item picker for the canvas editor.
//
// Modal that browses the live catalog. Two ways to add:
//   - Click a single item → onPick([itemId])
//   - Click "Agregar todos" on a category → onPick(itemIds[])
// Either way the editor materializes one item-binding node per id at
// design time (Canva-style — set of nodes fixed, fields stay live).
//
// Search filters across all items by name (case/diacritic-insensitive).

import { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';

function normalize(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default function ItemPicker({ menuData, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set()); // category names

  // Catalog → flat list of {category, items}. Filter when search active.
  const sections = useMemo(() => {
    const cats = menuData?.categoryOrder || Object.keys(menuData?.categories || {});
    const hidden = new Set(menuData?.hiddenCategories || []);
    const q = normalize(query.trim());
    return cats
      .filter(c => !hidden.has(c))
      .map(name => {
        const items = (menuData?.categories?.[name] || []).filter(it => !it.isHidden);
        const filtered = q ? items.filter(it => normalize(it.name).includes(q) || normalize(it.emoji).includes(q)) : items;
        return { name, items: filtered, totalCount: items.length };
      })
      .filter(s => !q || s.items.length > 0);
  }, [menuData, query]);

  function pickItem(it) {
    onPick([it.id]);
  }
  function pickCategory(section) {
    if (!section.items.length) return;
    onPick(section.items.map(it => it.id));
  }
  function toggle(name) {
    setExpanded(s => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const showAllExpanded = !!query.trim();

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={e => e.stopPropagation()}>
        <header style={header}>
          <h3 style={{ margin: 0, fontWeight: 800 }}>Vincular producto</h3>
          <button onClick={onClose} style={iconCloseBtn}><Icon icon="lucide:x" /></button>
        </header>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0d1117', borderRadius: 8, border: '1px solid #30363d', padding: '8px 10px' }}>
          <Icon icon="lucide:search" style={{ color: '#888' }} />
          <input
            autoFocus
            placeholder="Buscar producto…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: '0.95rem' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={iconCloseBtn} title="Limpiar">
              <Icon icon="lucide:x" />
            </button>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sections.length === 0 && (
            <p style={{ color: '#888', textAlign: 'center', padding: 20 }}>
              {query ? 'Sin resultados.' : 'Aún no hay productos en el catálogo.'}
            </p>
          )}
          {sections.map(section => {
            const open = showAllExpanded || expanded.has(section.name);
            return (
              <div key={section.name} style={sectionStyle}>
                <div style={sectionHeader}>
                  <button onClick={() => toggle(section.name)} style={{ ...ghostBtn, flex: 1, justifyContent: 'flex-start', textAlign: 'left' }}>
                    <Icon icon={open ? 'lucide:chevron-down' : 'lucide:chevron-right'} />
                    <strong>{section.name}</strong>
                    <span style={{ color: '#888', marginLeft: 6, fontSize: '0.8rem' }}>{section.items.length}{!query && section.items.length !== section.totalCount ? `/${section.totalCount}` : ''}</span>
                  </button>
                  {section.items.length > 0 && (
                    <button onClick={() => pickCategory(section)} style={categoryAddBtn}>
                      <Icon icon="lucide:layers" /> Agregar todos
                    </button>
                  )}
                </div>
                {open && (
                  <div style={itemList}>
                    {section.items.map(it => (
                      <button key={it.id} onClick={() => pickItem(it)} style={itemBtn}>
                        <span style={{ fontSize: '1.2rem', minWidth: 24, textAlign: 'center' }}>{it.emoji || '•'}</span>
                        <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{it.name}</span>
                        <Icon icon="lucide:plus" style={{ color: '#1f6feb' }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ margin: 0, color: '#888', fontSize: '0.78rem' }}>
          Los nodos vinculados muestran datos en vivo del catálogo: si cambias el nombre o el precio, el menú se actualiza solo.
        </p>
      </div>
    </div>
  );
}

const backdrop = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 };
const dialog = { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 18, width: 'min(600px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', color: 'white', gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' };
const header = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const iconCloseBtn = { background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: 6, borderRadius: 6 };
const ghostBtn = { background: 'transparent', border: 'none', color: 'white', padding: '6px 8px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 };
const sectionStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden' };
const sectionHeader = { display: 'flex', alignItems: 'center', gap: 4, padding: 4 };
const categoryAddBtn = { background: 'rgba(31,111,235,0.15)', color: '#7aa9ff', border: '1px solid rgba(31,111,235,0.4)', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 700 };
const itemList = { display: 'flex', flexDirection: 'column', borderTop: '1px solid #30363d' };
const itemBtn = { background: 'transparent', border: 'none', color: 'white', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(48,54,61,0.5)', fontSize: '0.92rem' };
