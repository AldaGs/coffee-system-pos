export function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

export function NumInput({ value, onChange, suffix, step }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#22272e', borderRadius: 6, padding: '4px 8px', border: '1px solid #30363d', flex: 1 }}>
      <input
        type="number"
        step={step ?? 1}
        value={value ?? 0}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: '0.85rem' }}
      />
      {suffix && <span style={{ color: '#888', fontSize: '0.7rem' }}>{suffix}</span>}
    </label>
  );
}

// ============================================================================
// Inline styles — dark editor chrome, not themable.
// ============================================================================

