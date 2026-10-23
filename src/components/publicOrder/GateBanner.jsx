import { isOpenNow, nextOpening, formatHours } from '../../utils/pickupSlots';

// Read-only banner: why orders are off, when we open next, and the store hours by day.
export default function GateBanner({ s, gate, shop }) {
  const tz = shop?.timezone || 'America/Mexico_City';
  let text = gate === 'online_orders_paused' ? s.paused : gate === 'online_orders_closed' ? s.closed : s.notOpen;
  const lines = gate === 'online_orders_closed' ? formatHours(shop?.open_hours, s.dayNames, s.allDays) : [];
  if (gate === 'online_orders_closed' && !isOpenNow(shop?.open_hours, { tz })) {
    const n = nextOpening(shop?.open_hours, { tz });
    if (n) text += ' · ' + s.opensAt.replace('{when}', `${n.dayOffset === 0 ? s.today : n.dayOffset === 1 ? s.tomorrow : s.dayNames[n.dow]} ${n.time}`);
  }
  return (
    <div role="status" style={{ margin: '12px 16px 0', padding: '14px 16px', borderRadius: 12, background: '#fff4e5', border: '1px solid #f5d9a8', color: '#5a3b00' }}>
      <div style={{ fontWeight: 800 }}>{text}</div>
      {lines.length > 0 && (
        <details open style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{s.hoursTitle}</summary>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
