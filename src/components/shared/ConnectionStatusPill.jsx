import { Icon } from '@iconify/react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { useTranslation } from '../../hooks/useTranslation';

// Compact, always-available connectivity indicator for the register. It answers
// the cashier's real question on a bad in-store link — "did that sale save?" — so
// they stop retrying (and stop creating duplicates). By default it stays out of
// the way when everything is healthy and synced, and only appears when the link
// is offline/degraded or there's a backlog draining.

const VARIANTS = {
  offline:  { fg: '#e74c3c', bg: 'rgba(231,76,60,0.14)',  border: 'rgba(231,76,60,0.35)',  icon: 'lucide:cloud-off',   spin: false },
  degraded: { fg: '#e67e22', bg: 'rgba(230,126,34,0.14)', border: 'rgba(230,126,34,0.35)', icon: 'lucide:wifi-off',    spin: false },
  syncing:  { fg: '#2980b9', bg: 'rgba(41,128,185,0.14)', border: 'rgba(41,128,185,0.35)', icon: 'lucide:refresh-cw',  spin: true  },
  online:   { fg: '#27ae60', bg: 'rgba(39,174,96,0.12)',  border: 'rgba(39,174,96,0.30)',  icon: 'lucide:cloud',       spin: false },
};

export default function ConnectionStatusPill({ onClick, hideWhenHealthy = true, style }) {
  const { t } = useTranslation();
  const { state, pending } = useConnectionStatus();

  if (hideWhenHealthy && state === 'online') return null;

  const v = VARIANTS[state] || VARIANTS.online;

  let label;
  if (state === 'syncing') {
    label = t('conn.syncing').replace('{count}', pending);
  } else if (state === 'online') {
    label = t('conn.online');
  } else {
    // offline / degraded — append the backlog count when there is one.
    label = t(state === 'offline' ? 'conn.offline' : 'conn.degraded');
    if (pending > 0) label += t('conn.pendingSuffix').replace('{count}', pending);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-live="polite"
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '7px',
        padding: '6px 10px', borderRadius: '999px',
        background: v.bg, color: v.fg, border: `1px solid ${v.border}`,
        font: 'inherit', fontSize: '0.8rem', fontWeight: 700, lineHeight: 1,
        cursor: onClick ? 'pointer' : 'default', maxWidth: '100%',
        ...style,
      }}
    >
      <Icon icon={v.icon} className={v.spin ? 'spin' : ''} style={{ fontSize: '1rem', flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}
