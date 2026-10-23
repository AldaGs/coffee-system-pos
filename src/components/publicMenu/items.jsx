import { formatForDisplay } from '../../utils/moneyUtils';
import { emojiStyle, imageStyle, itemLeftStyle, itemNameStyle, itemStyle, listStyle, modifiersWrapStyle, priceStyle, soldOutBadgeStyle, trackMenu } from './shared';

export function ItemList({ items, groupsById, lang, brand, showModifiers = true }) {
  if (!items || items.length === 0) {
    return <p style={{ textAlign: 'center', color: '#888', padding: '40px 16px' }}>—</p>;
  }
  return (
    <ul style={listStyle}>
      {items.map(item => {
        const soldOut = item.available === false;
        return (
        <li key={item.id} style={{ ...itemStyle, opacity: soldOut ? 0.55 : 1 }}>
          <div style={itemLeftStyle}>
            {item.image_url ? (
              <img
                src={item.image_url}
                alt=""
                loading="lazy"
                style={{ ...imageStyle, filter: soldOut ? 'grayscale(1)' : 'none' }}
              />
            ) : (
              <span style={emojiStyle} aria-hidden>{item.emoji || '•'}</span>
            )}
            <div>
              <div style={itemNameStyle}>
                {item.name}
                {soldOut && <span style={soldOutBadgeStyle}>{lang === 'en' ? 'Sold out' : 'Agotado'}</span>}
              </div>
              <RoastLine roastDate={item.roast_date} lang={lang} />
              {showModifiers && item.modifier_group_ids?.length > 0 && (
                <ItemModifiers groupIds={item.modifier_group_ids} groupsById={groupsById} lang={lang} brand={brand} />
              )}
              {item.whatsapp_url && (
                <WhatsAppButton url={item.whatsapp_url} lang={lang} itemId={item.id} />
              )}
            </div>
          </div>
          <div style={priceStyle}>
            {item.price_type === 'open'
              ? <span style={{ color: '#888', fontWeight: 600 }}>—</span>
              : formatForDisplay(item.price_cents, lang)}
          </div>
        </li>
        );
      })}
    </ul>
  );
}

// Roast-date line — shows the date plus a relative freshness hint ("hace 3
// días") because that's what a coffee buyer actually cares about. Renders
// nothing for a missing/unparseable date so non-coffee items stay clean.
export function RoastLine({ roastDate, lang }) {
  const label = formatRoastDate(roastDate, lang);
  if (!label) return null;
  return (
    <div style={{ fontSize: '0.78rem', color: '#8a6d3b', fontWeight: 600, marginTop: 3 }}>
      🔥 {label}
    </div>
  );
}

function formatRoastDate(value, lang) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const en = lang === 'en';
  const dateStr = d.toLocaleDateString(en ? 'en-US' : 'es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  const today = new Date();
  const days = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  const roasted = en ? 'Roasted' : 'Tostado';
  if (days <= 0) return `${roasted}: ${dateStr} · ${en ? 'today' : 'hoy'}`;
  const ago = en ? `${days} day${days === 1 ? '' : 's'} ago` : `hace ${days} día${days === 1 ? '' : 's'}`;
  return `${roasted}: ${dateStr} · ${ago}`;
}

// "Order on WhatsApp" button. Opens the owner-pasted catalog/wa.me link in a
// new tab. Stops click bubbling so it never triggers surrounding row handlers.
export function WhatsAppButton({ url, lang, itemId }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => { e.stopPropagation(); trackMenu('whatsapp_click', { itemId }); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
        padding: '7px 12px', borderRadius: 999, background: '#25D366', color: 'white',
        fontWeight: 800, fontSize: '0.8rem', textDecoration: 'none'
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.76.46 3.45 1.34 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.4 1.3-1.94 1.35-.5.05-.98.23-3.3-.69-2.78-1.1-4.56-3.94-4.7-4.13-.14-.19-1.13-1.5-1.13-2.86 0-1.36.71-2.03.97-2.31.24-.26.53-.32.7-.32.18 0 .35 0 .5.01.16.01.38-.06.59.45.24.58.81 2 .88 2.15.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.18-.28.37-.23.62-.14.25.09 1.61.76 1.89.9.28.14.46.21.53.32.07.12.07.66-.17 1.34Z"/>
      </svg>
      {lang === 'en' ? 'Order on WhatsApp' : 'Pedir por WhatsApp'}
    </a>
  );
}

export function ItemModifiers({ groupIds, groupsById, lang, brand }) {
  const groups = groupIds.map(id => groupsById.get(id)).filter(Boolean);
  if (groups.length === 0) return null;
  return (
    <div style={modifiersWrapStyle}>
      {groups.map(g => (
        <div key={g.id} style={{ marginTop: 6 }}>
          <div style={{ fontSize: '0.75rem', color: brand, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {g.name}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: 2 }}>
            {g.options.map((o, idx) => {
              const delta = o.price_delta_cents;
              const label = delta ? `${o.name} ${delta > 0 ? '+' : ''}${formatForDisplay(delta, lang)}` : o.name;
              return (
                <span key={o.id}>
                  {idx > 0 && <span style={{ color: '#ccc' }}> · </span>}
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Swipeable page carousel for pdf/image kinds. Touch swipes via touchstart/end
// deltas (no library); keyboard arrows work too. Single-page menus skip the
// chrome entirely so they look like a clean poster.
