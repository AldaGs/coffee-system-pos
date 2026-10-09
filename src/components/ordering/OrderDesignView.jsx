import { Component, useMemo, useState } from 'react';
import CanvasRenderer from '../menuCanvas/CanvasRenderer';
import { buildItemIndex } from '../../utils/canvasDocument';
import { isOrderDocument, resolveOrderTarget } from '../../utils/canvasOrdering';

const LABELS = {
  en: { design: 'Design', catalog: 'Catalog', hint: 'Tap a linked product to add it. Use Catalog for larger controls.', noActions: 'This design has no available linked products. Order from the catalog.', invalid: 'This design is unavailable. Order from the catalog.', failed: 'The design could not be displayed. Your cart is safe; order from the catalog.' },
  es: { design: 'Diseño', catalog: 'Catálogo', hint: 'Toca un producto vinculado para agregarlo. Usa Catálogo para controles más grandes.', noActions: 'Este diseño no tiene productos vinculados disponibles. Pide desde el catálogo.', invalid: 'Este diseño no está disponible. Pide desde el catálogo.', failed: 'No se pudo mostrar el diseño. Tu carrito se conserva; pide desde el catálogo.' },
};

// Only the artwork can fail. Ordering state, cart, and checkout stay in PublicOrder.
class OrderDesignBoundary extends Component {
  state = { failed: false, document: null };
  static getDerivedStateFromProps(props, state) {
    return props.document !== state.document ? { document: props.document, failed: false } : null;
  }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function OrderDesignView({ data, lang, brand, gate, onSelectItem, catalog }) {
  const document = data.menu?.kind === 'designed' ? data.menu.data?.document : null;
  const valid = isOrderDocument(document);
  const items = useMemo(() => buildItemIndex(data.categories), [data.categories]);
  // A closed ordering gate changes activation, not which presentation opens.
  const hasActions = valid && document.pages.some(page => page.nodes.some(node => resolveOrderTarget(node, items)));
  const [choice, setChoice] = useState(null);
  const view = choice?.document === document ? choice.view : hasActions ? 'design' : 'catalog';
  const s = LABELS[lang] || LABELS.es;
  if (!document) return catalog;
  if (!valid) return <><p role="status" style={noticeStyle}>{s.invalid}</p>{catalog}</>;
  const fallback = <><p role="status" style={noticeStyle}>{s.failed}</p>{catalog}</>;
  return <>
    <div role="group" aria-label={lang === 'en' ? 'Menu view' : 'Vista del menú'} style={{ display: 'flex', gap: 8, padding: 12 }}>
      {['design', 'catalog'].map(value => <button key={value} type="button" aria-pressed={view === value}
        onClick={() => setChoice({ document, view: value })}
        style={{ minHeight: 44, padding: '10px 16px', border: `1px solid ${brand}`, borderRadius: 10, background: view === value ? brand : 'white', color: view === value ? 'white' : '#333', fontWeight: 700, cursor: 'pointer' }}>{s[value]}</button>)}
    </div>
    {view === 'design' && hasActions && !gate && <p style={noticeStyle}>{s.hint}</p>}
    {!hasActions && <p role="status" style={noticeStyle}>{s.noActions}</p>}
    {view === 'design' ? <OrderDesignBoundary document={document} fallback={fallback}>
      <CanvasRenderer document={document} data={data} lang={lang} ordering={{ onSelectItem, gate, brand }} />
    </OrderDesignBoundary> : catalog}
  </>;
}

const noticeStyle = { padding: '8px 16px', margin: 0, color: '#666', fontSize: '0.9rem' };
