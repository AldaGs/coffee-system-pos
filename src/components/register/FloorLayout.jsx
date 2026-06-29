import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { tablesOf, DEFAULT_FLOOR_SIZE } from '../../utils/floorDocument';
import RegisterActionBar from './RegisterActionBar';

// FloorLayout — the front screen of the "tables" register layout. Renders the
// saved floor plan(s) read-only with live, color-coded per-table status derived
// from the open tickets. Tapping a table hands control back to the Register
// parent (onSelectTable), which opens that table's scoped ticket flow.
//
// The map is laid out with PERCENTAGE positioning against the floor's authored
// canvas size, so it is resolution-independent without any JS scaling (same
// principle as the menu CanvasRenderer). One zone/floor shows at a time, with a
// tab strip when there are several. The shared RegisterActionBar rides in the
// header so the floor screen keeps the cashier pill + Lock/Admin/Corte/Gasto/
// sync controls (notably on mobile, where this IS the home screen).
//
// Status (derived, see docs/tables.md):
//   available — no open tickets           (light, outlined)
//   seated    — ticket(s) but no items    (amber)
//   ordered   — at least one item ordered (brand color)

function statusForTickets(list) {
  if (!list.length) return 'available';
  const anyItems = list.some(tk => (tk.items || []).length > 0);
  return anyItems ? 'ordered' : 'seated';
}

const STATUS_STYLE = {
  available: { bg: 'var(--bg-surface, #eef2f6)', border: '#94a3b8', text: 'var(--text-main)' },
  seated: { bg: '#f59e0b', border: '#b45309', text: '#fff' },
  ordered: { bg: 'var(--brand-color, #3498db)', border: 'rgba(0,0,0,0.35)', text: '#fff' },
};

export default function FloorLayout({
  floors,
  tickets,
  onSelectTable,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  setIsSyncModalOpen,
  setIsExpenseModalOpen,
  setIsCorteModalOpen,
}) {
  const { t } = useTranslation();
  const [zoneIdx, setZoneIdx] = useState(0);

  // Group open tickets by table id once per render.
  const ticketsByTable = useMemo(() => {
    const map = new Map();
    for (const tk of tickets || []) {
      if (tk.table_id == null) continue;
      if (!map.has(tk.table_id)) map.set(tk.table_id, []);
      map.get(tk.table_id).push(tk);
    }
    return map;
  }, [tickets]);

  const actionBar = (
    <RegisterActionBar
      isMobileMenuOpen={isMobileMenuOpen}
      setIsMobileMenuOpen={setIsMobileMenuOpen}
      setIsSyncModalOpen={setIsSyncModalOpen}
      setIsExpenseModalOpen={setIsExpenseModalOpen}
      setIsCorteModalOpen={setIsCorteModalOpen}
    />
  );

  const floor = floors && floors.length ? floors[Math.min(zoneIdx, floors.length - 1)] : null;
  const size = floor?.document?.size || DEFAULT_FLOOR_SIZE;
  const tables = tablesOf(floor?.document);

  // Measure the available area and compute the board's pixel size so it always
  // keeps the floor's TRUE aspect ratio (CSS aspect-ratio + max-width/height
  // fight each other and distort the percentage-positioned tables — stretching
  // them tall — so we size explicitly, the way the editor's Stage does).
  // Declared before any early return so hook order stays stable.
  const boardAreaRef = useRef(null);
  const [board, setBoard] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) return;
    const recalc = () => {
      const availW = el.clientWidth, availH = el.clientHeight;
      if (!availW || !availH) return;
      const fit = Math.min(availW / size.w, availH / size.h);
      setBoard({ w: Math.floor(size.w * fit), h: Math.floor(size.h * fit) });
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h, zoneIdx]);

  if (!floor) {
    return (
      <main className="floor-layout" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px' }}>{actionBar}</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
            <Icon icon="lucide:armchair" style={{ fontSize: '2.5rem', opacity: 0.4 }} />
            <p>{t('reg.tableNoFloor')}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="floor-layout" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header: zone tabs + legend + system toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        {floors.length > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {floors.map((f, i) => (
              <button key={f.id} onClick={() => setZoneIdx(i)}
                style={{ padding: '6px 14px', borderRadius: 999, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                  border: i === zoneIdx ? 'none' : '1px solid var(--border)',
                  background: i === zoneIdx ? 'var(--brand-color, #3498db)' : 'var(--bg-card)',
                  color: i === zoneIdx ? '#fff' : 'var(--text-main)' }}>
                {f.name}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <Legend label={t('reg.tableAvailable')} color={STATUS_STYLE.available.border} hollow />
          <Legend label={t('reg.tableSeated')} color={STATUS_STYLE.seated.bg} />
          <Legend label={t('reg.tableOrdered')} color={STATUS_STYLE.ordered.bg} />
        </div>
        <div style={{ flex: 1 }} />
        {actionBar}
      </div>

      {/* Floor canvas — percentage-positioned tables against the authored size.
          The board is sized in JS (board.w/h) to preserve the floor's aspect. */}
      <div ref={boardAreaRef} style={{ flex: 1, minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'hidden' }}>
        <div style={{ position: 'relative', width: board.w, height: board.h,
          background: 'var(--bg-card)', borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--border)' }}>
          {tables.map(tb => {
            const list = ticketsByTable.get(tb.id) || [];
            const status = statusForTickets(list);
            const st = STATUS_STYLE[status];
            const itemCount = list.reduce((n, tk) => n + (tk.items || []).reduce((m, i) => m + (i.qty || 1), 0), 0);
            const isRound = tb.shape === 'round';
            return (
              <button key={tb.id} type="button" onClick={() => onSelectTable(tb)}
                title={tb.name || `#${tb.number}`}
                style={{
                  position: 'absolute',
                  left: `${(tb.x / size.w) * 100}%`, top: `${(tb.y / size.h) * 100}%`,
                  width: `${(tb.w / size.w) * 100}%`, height: `${(tb.h / size.h) * 100}%`,
                  transform: tb.rotation ? `rotate(${tb.rotation}deg)` : undefined,
                  background: st.bg, color: st.text,
                  border: `3px solid ${st.border}`,
                  borderRadius: isRound ? '50%' : (tb.shape === 'rect' ? 12 : 10),
                  boxShadow: status === 'available' ? 'none' : '0 2px 8px rgba(0,0,0,0.18)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3, padding: 4,
                  fontWeight: 800, lineHeight: 1.05, overflow: 'hidden',
                }}>
                <span style={{ fontSize: 'clamp(1.05rem, 2.4vw, 1.7rem)', fontWeight: 900 }}>{tb.number || '?'}</span>
                {tb.name && <span style={{ fontSize: 'clamp(0.7rem, 1.2vw, 0.92rem)', fontWeight: 700, opacity: 0.95 }}>{tb.name}</span>}
                {list.length > 0 ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'clamp(0.72rem, 1.3vw, 0.95rem)', fontWeight: 700 }}>
                    <Icon icon="lucide:receipt-text" /> {list.length}
                    <Icon icon="lucide:shopping-cart" style={{ marginLeft: 2 }} /> {itemCount}
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'clamp(0.78rem, 1.4vw, 1rem)', fontWeight: 700 }}>
                    <Icon icon="lucide:users" /> {tb.seats}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function Legend({ label, color, hollow }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: hollow ? 'transparent' : color, border: `2px solid ${color}` }} />
      {label}
    </span>
  );
}
