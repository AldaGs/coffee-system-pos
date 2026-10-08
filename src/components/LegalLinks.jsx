import { useEffect, useState } from 'react';

const L = {
  es: { privacy: 'Aviso de privacidad', terms: 'Términos y condiciones', close: 'Cerrar' },
  en: { privacy: 'Privacy notice', terms: 'Terms and conditions', close: 'Close' },
};

// Links to the shop's privacy notice / terms (public get_legal RPC). The text is
// fetched lazily on first click; links whose text turns out empty disappear.
// `only` limits to one kind.
export default function LegalLinks({ client, lang = 'es', only, style }) {
  const [legal, setLegal] = useState(null);
  const [open, setOpen] = useState(null);
  const s = L[lang] || L.es;
  useEffect(() => {
    if (!open || legal) return;
    client.rpc('get_legal').then(({ data }) => setLegal(data || {}), () => setLegal({}));
  }, [open, legal, client]);
  const links = (only ? [only] : ['privacy', 'terms']).filter((k) => !legal || legal[k]);
  if (!client || !links.length) return null;
  return (
    <span style={style}>
      {links.map((k, i) => (
        <span key={k}>{i > 0 && ' · '}
          <button type="button" onClick={() => setOpen(k)} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>{s[k]}</button>
        </span>
      ))}
      {open && (
        <div role="dialog" aria-modal="true" aria-label={s[open]} onClick={() => setOpen(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', color: '#222', borderRadius: 16, maxWidth: 640, width: '100%', maxHeight: '85dvh', display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <div style={{ overflowY: 'auto', padding: 20, whiteSpace: 'pre-wrap', fontSize: '0.92rem', lineHeight: 1.5 }}>{legal ? legal[open] : '…'}</div>
            <button type="button" onClick={() => setOpen(null)} style={{ margin: 12, padding: 12, border: 'none', borderRadius: 10, background: '#222', color: 'white', fontWeight: 800, cursor: 'pointer' }}>{s.close}</button>
          </div>
        </div>
      )}
    </span>
  );
}
