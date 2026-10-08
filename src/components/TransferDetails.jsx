import { useState } from 'react';
import { Icon } from '@iconify/react';

const L = {
  es: { bank: 'Banco', clabe: 'CLABE / cuenta', holder: 'Titular', copy: 'Copiar', copied: 'Copiado' },
  en: { bank: 'Bank', clabe: 'CLABE / account', holder: 'Account holder', copy: 'Copy', copied: 'Copied' },
};

// Transfer details as three copyable boxes (bank, CLABE, holder). Falls back to the
// old free-text transferInfo for shops that haven't filled the new fields.
export default function TransferDetails({ payments, lang = 'es' }) {
  const [copied, setCopied] = useState(null);
  const s = L[lang] || L.es;
  const t = payments?.transfer || {};
  const fields = ['bank', 'clabe', 'holder'].filter((k) => t[k]?.trim());
  if (!fields.length) {
    return payments?.transferInfo
      ? <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: '#f5f5f5', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{payments.transferInfo}</div>
      : null;
  }
  const copy = async (k) => {
    try { await navigator.clipboard.writeText(t[k].trim()); } catch { return; }
    setCopied(k);
    setTimeout(() => setCopied((c) => (c === k ? null : c)), 1500);
  };
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      {fields.map((k) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: '#f5f5f5' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.75rem', color: '#777' }}>{s[k]}</div>
            <div style={{ fontWeight: 700, overflowWrap: 'anywhere', fontVariantNumeric: k === 'clabe' ? 'tabular-nums' : undefined }}>{t[k].trim()}</div>
          </div>
          <button type="button" onClick={() => copy(k)} aria-label={`${s.copy} ${s[k]}`}
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', color: copied === k ? '#27ae60' : '#333' }}>
            <Icon icon={copied === k ? 'lucide:check' : 'lucide:copy'} />{copied === k ? s.copied : s.copy}
          </button>
        </div>
      ))}
    </div>
  );
}
