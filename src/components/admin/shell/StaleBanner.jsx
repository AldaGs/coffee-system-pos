import { Icon } from '@iconify/react';
import { useTranslation } from '../../../hooks/useTranslation';

// Shown while the cached dashboard is being checked against the server, or when
// that check failed: the numbers are last-known and edits are queued, not lost.
export default function StaleBanner({ cloudSync, lastSyncedAt, onRetry }) {
  const { t } = useTranslation();
  const checking = cloudSync === 'checking';
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', marginBottom: '20px', borderRadius: '12px',
        background: 'rgba(230,126,34,0.12)', border: '1px solid rgba(230,126,34,0.35)',
        color: 'var(--text-main)',
      }}
    >
      <Icon
        icon={checking ? 'lucide:refresh-cw' : 'lucide:cloud-off'}
        className={checking ? 'spin' : ''}
        style={{ fontSize: '1.4rem', color: '#e67e22', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800 }}>{checking ? t('admin.staleChecking') : t('admin.staleTitle')}</div>
        {!checking && (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {t('admin.staleDesc').replace('{time}', lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : t('admin.staleNever'))}
          </div>
        )}
      </div>
      <button
        onClick={onRetry}
        disabled={checking}
        style={{
          flexShrink: 0, padding: '8px 14px', borderRadius: '9999px',
          border: '1px solid rgba(230,126,34,0.5)', background: 'transparent',
          color: '#e67e22', fontWeight: 700, cursor: checking ? 'default' : 'pointer',
          opacity: checking ? 0.6 : 1,
        }}
      >
        {checking ? t('admin.staleChecking') : t('admin.staleRetry')}
      </button>
    </div>
  );
}
