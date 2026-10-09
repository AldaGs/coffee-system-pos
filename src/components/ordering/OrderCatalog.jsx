export default function OrderCatalog({ categories, active, setActiveCat, wide, brand, gate, s, fmt, onAdd }) {
  return <>
      <nav style={{ display: 'flex', overflowX: 'auto', gap: 12, padding: wide ? '12px 4px' : '12px 16px', background: wide ? '#fafafa' : 'white', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 5 }}>
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => setActiveCat(c.id)}
            style={{ background: 'none', border: 'none', borderBottom: `2px solid ${c.id === active.id ? brand : 'transparent'}`, color: c.id === active.id ? brand : '#555', fontWeight: 700, padding: '8px 4px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
            {c.name}
          </button>
        ))}
      </nav>

      <ul style={wide
        ? { listStyle: 'none', margin: 0, padding: '16px 0 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }
        : { listStyle: 'none', margin: 0, padding: '8px 16px 16px' }}>
        {active.items.map((it) => {
          const out = it.available === false || it.price_type !== 'fixed';
          return (
            <li key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'center', opacity: out ? 0.5 : 1,
              ...(wide ? { background: 'white', borderRadius: 14, padding: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' } : { padding: '14px 0', borderBottom: '1px solid #eee' }) }}>
              {it.image_url ? <img src={it.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} /> : <span style={{ fontSize: '1.6rem' }}>{it.emoji}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{it.name}</div>
                <div style={{ color: '#666' }}>{out && it.available === false ? s.soldOut : fmt(it.price_cents)}</div>
              </div>
              {!out && !gate && <button type="button" onClick={() => onAdd(it)} style={{ background: brand, color: 'white', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}>{s.add}</button>}
            </li>
          );
        })}
      </ul>
  </>;
}
