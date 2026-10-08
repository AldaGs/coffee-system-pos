import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';
import { CALLING_CODES } from '../utils/callingCodes';

const PINNED = ['MX', 'US'];

// Country calling-code picker: flag images (emoji flags don't render on Windows),
// localized names via Intl.DisplayNames, searchable by name or code.
export default function CountryPicker({ value = 'MX', onChange, lang = 'es', label }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    let names;
    try { names = new Intl.DisplayNames([lang === 'en' ? 'en' : 'es'], { type: 'region' }); } catch { names = null; }
    const all = Object.keys(CALLING_CODES).map((iso) => ({ iso, code: CALLING_CODES[iso], name: names?.of(iso) || iso }));
    const rest = all.filter((c) => !PINNED.includes(c.iso)).sort((a, b) => a.name.localeCompare(b.name, lang));
    return [...PINNED.map((iso) => all.find((c) => c.iso === iso)), ...rest];
  }, [lang]);
  const needle = q.trim().toLowerCase().replace(/^\+/, '');
  const shown = needle
    ? list.filter((c) => c.name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(needle.normalize('NFD').replace(/\p{M}/gu, '')) || c.code.startsWith(needle))
    : list;
  const flag = (iso) => <Icon icon={`circle-flags:${iso.toLowerCase()}`} width="22" height="22" style={{ flexShrink: 0 }} />;
  const pick = (iso) => { onChange(iso); setOpen(false); setQ(''); };

  return (
    <>
      <button type="button" aria-label={label} onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '0 10px', borderRadius: 10, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '1rem' }}>
        {flag(value)}<span>+{CALLING_CODES[value]}</span><Icon icon="lucide:chevron-down" />
      </button>
      {open && createPortal(
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', color: '#222', borderRadius: 16, width: '100%', maxWidth: 420, maxHeight: '80dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === 'en' ? 'Search country or code' : 'Buscar país o código'}
              style={{ margin: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd', fontSize: '1rem' }} />
            <div style={{ overflowY: 'auto' }}>
              {shown.map((c) => (
                <button key={c.iso} type="button" onClick={() => pick(c.iso)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', border: 'none', borderTop: '1px solid #f0f0f0', cursor: 'pointer', textAlign: 'left', fontSize: '0.95rem',
                    background: c.iso === value ? '#f5f5f5' : 'white', fontWeight: c.iso === value ? 800 : 400 }}>
                  {flag(c.iso)}<span style={{ flex: 1 }}>{c.name}</span><span style={{ color: '#777' }}>+{c.code}</span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
