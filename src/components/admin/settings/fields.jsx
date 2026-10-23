import { Icon } from '@iconify/react';

// Reusable toggle row for boolean settings. Used by the access-restrictions
// group; lifting it to a shared component is fine if other tabs need it.
export function SettingToggle({ icon, label, desc, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '12px 14px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '10px' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-surface)', color: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon icon={icon} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.95rem' }}>{label}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '2px', lineHeight: 1.4 }}>{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: '44px',
          height: '26px',
          // Off-state is a softened var(--text-muted) so the track adapts to
          // light/dark mode automatically. color-mix at 55% gives a clearly
          // gray-but-not-harsh track in both themes; brand color stays solid
          // when on.
          background: checked
            ? 'var(--brand-color)'
            : 'color-mix(in srgb, var(--text-muted) 55%, transparent)',
          borderRadius: '999px',
          border: 'none',
          position: 'relative',     // ← critical: anchor for the thumb
          padding: 0,                // some browsers add default button padding
          cursor: 'pointer',
          transition: 'background 0.2s ease',
          marginTop: '4px',
          boxSizing: 'border-box',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '20px' : '2px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
            display: 'block',
          }}
        />
      </button>
    </div>
  );
}

// Native datalist-backed combo. Lists IANA zones from Intl.supportedValuesOf
// where available (Node 18+/modern browsers), with a small fallback for older
// runtimes. Free typing is allowed so unusual zones still work.
export function TimezonePicker({ value, onChange }) {
  const zones = (typeof Intl.supportedValuesOf === 'function')
    ? Intl.supportedValuesOf('timeZone')
    : ['UTC','America/Mexico_City','America/Tijuana','America/Cancun','America/Monterrey','America/Chicago','America/New_York','America/Los_Angeles','America/Bogota','America/Lima','America/Santiago','America/Argentina/Buenos_Aires','Europe/Madrid','Europe/London'];
  return (
    <>
      <input
        list="tinypos-tz-list"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="America/Mexico_City"
        style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }}
      />
      <datalist id="tinypos-tz-list">
        {zones.map(z => <option key={z} value={z} />)}
      </datalist>
    </>
  );
}
