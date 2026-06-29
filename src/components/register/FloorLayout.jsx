import { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { tablesOf, DEFAULT_FLOOR_SIZE } from '../../utils/floorDocument';

// FloorLayout — the front screen of the "tables" register layout. Renders the
// saved floor plan(s) read-only with live, color-coded per-table status derived
// from the open tickets. Tapping a table hands control back to the Register
// parent (onSelectTable), which opens that table's scoped ticket flow.
//
// The map is laid out with PERCENTAGE positioning against the floor's authored
// canvas size, so it is resolution-independent without any JS scaling (same
// principle as the menu CanvasRenderer). One zone/floor shows at a time, with a
// tab strip when there are several.
//
// Status (derived, see docs/tables.md):
//   available — no open tickets           (muted)
//   seated    — ticket(s) but no items    (amber)
//   ordered   — at least one item ordered (brand color)

function statusForTickets(list) {
  if (!list.length) return 'available';
  const anyItems = list.some(tk => (tk.items || []).length > 0);
  return anyItems ? 'ordered' : 'seated';
}

const STATUS_STYLE = {
  available: { bg: 'var(--bg-card)', border: 'var(--border)', text: 'var(--text-muted)' },
  seated: { bg: '#f59e0b', border: '#d97706', text: '#fff' },
  ordered: { bg: 'var(--brand-color, #3498db)', border: 'var(--brand-color, #2980b9)', text: '#fff' },
};

export default function FloorLayout({ floors, tickets, onSelectTable }) {
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

  if (!floors || floors.length === 0) {
    return (
      <main className="floor-layout floor-layout--empty">
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          <Icon icon="lucide:armchair" style={{ fontSize: '2.5rem', opacity: 0.4 }} />
          <p>{t('reg.tableNoFloor')}</p>
        </div>
      </main>
    );
  }

  const floor = floors[Math.min(zoneIdx, floors.length - 1)];
  const size = floor.document?.size || DEFAULT_FLOOR_SIZE;
  const tables = tablesOf(floor.document);

  return (
    <main className="floor-layout" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Zone tabs (only when multiple floors) + legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', flexWrap: 'wrap' }}>
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
        <div style={{ flex: 1 }} />
        <Legend label={t('reg.tableAvailable')} color={STATUS_STYLE.available.border} hollow />
        <Legend label={t('reg.tableSeated')} color={STATUS_STYLE.seated.bg} />
        <Legend label={t('reg.tableOrdered')} color={STATUS_STYLE.ordered.bg} />
      </div>

      {/* Floor canvas — percentage-positioned tables against the authored size */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'auto' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: `min(100%, calc((100vh - 220px) * ${size.w / size.h}))`,
          aspectRatio: `${size.w} / ${size.h}`, background: 'var(--bg-card)', borderRadius: 12, boxShadow: '0 0 0 1px var(--border)' }}>
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
                  border: `2px solid ${st.border}`,
                  borderRadius: isRound ? '50%' : (tb.shape === 'rect' ? 10 : 8),
                  cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4,
                  fontWeight: 800, lineHeight: 1.1, overflow: 'hidden',
                }}>
                <span style={{ fontSize: 'clamp(0.7rem, 1.4vw, 1.05rem)' }}>{tb.number || '?'}</span>
                {tb.name && <span style={{ fontSize: '0.7rem', fontWeight: 600, opacity: 0.9 }}>{tb.name}</span>}
                {list.length > 0 ? (
                  <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>
                    {list.length} {t('reg.tableTickets')} · {itemCount} 🛒
                  </span>
                ) : (
                  <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{tb.seats} 👤</span>
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
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, background: hollow ? 'transparent' : color, border: `2px solid ${color}` }} />
      {label}
    </span>
  );
}
