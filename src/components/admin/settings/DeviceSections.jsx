import DisconnectButton from '../../DisconnectButton';
import { Icon } from '@iconify/react';
import { beginCloudUpgrade, isLocalMode } from '../../../utils/appMode';
import { useTranslation } from '../../../hooks/useTranslation';

export function DeviceCard({ handleLayoutModeChange, layoutMode }) {
  const { t } = useTranslation();
  return (
    <>
    {/* --- DEVICE SETTINGS (LOCAL-ONLY, NOT SYNCED) --- */}
    <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon icon="lucide:smartphone" style={{ color: 'var(--brand-color)' }} />
          {t('settings.deviceTitle')}
        </h3>
        <small style={{ color: 'var(--text-muted)', display: 'block', lineHeight: 1.4 }}>
          {t('settings.deviceDesc')}
        </small>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.layoutMode')}</label>
        <small style={{ color: 'var(--text-muted)', marginTop: '-4px' }}>{t('settings.layoutModeDesc')}</small>

        <div role="radiogroup" aria-label={t('settings.layoutMode')} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          {[
            { value: 'cafe', icon: 'lucide:zap', label: t('settings.layoutCafe'), desc: t('settings.layoutCafeDesc') },
            { value: 'orders', icon: 'lucide:layout-list', label: t('settings.layoutOrders'), desc: t('settings.layoutOrdersDesc') },
            { value: 'tables', icon: 'lucide:armchair', label: t('settings.layoutTables'), desc: t('settings.layoutTablesDesc') },
          ].map(opt => {
            const selected = layoutMode === opt.value;
            return (
              <label
                key={opt.value}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '14px',
                  padding: '14px', borderRadius: '12px', cursor: 'pointer',
                  background: 'var(--bg-main)',
                  border: selected ? '2px solid var(--brand-color)' : '1px solid var(--border)',
                  boxShadow: selected ? '0 0 0 1px var(--brand-color)' : 'none',
                  transition: 'border 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="layoutMode"
                  value={opt.value}
                  checked={selected}
                  onChange={() => handleLayoutModeChange(opt.value)}
                  style={{ width: '20px', height: '20px', accentColor: 'var(--brand-color)', flexShrink: 0, marginTop: '2px' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon icon={opt.icon} style={{ color: 'var(--brand-color)' }} />
                    {opt.label}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '2px', lineHeight: 1.4 }}>{opt.desc}</div>
                </div>
              </label>
            );
          })}
        </div>

        <small style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
          <Icon icon="lucide:hard-drive" style={{ fontSize: '0.95rem' }} />
          {t('settings.layoutLocalNote')}
        </small>
      </div>
    </div>
    </>
  );
}

export function AccountCard() {
  const { t } = useTranslation();
  return (
    <>
    {/* --- BOTTOM ACTIONS --- (Save moved to the sticky header above) */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {isLocalMode() ? (
        /* Local mode: no cloud connection to disconnect. Offer the upgrade
           to a free cloud backup instead. */
        <div style={{
          border: '2px solid rgba(52, 152, 219, 0.25)',
          padding: '24px',
          borderRadius: '24px',
          backgroundColor: 'rgba(52, 152, 219, 0.06)'
        }}>
          <h3 style={{ marginTop: 0, color: 'var(--text-main)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:cloud-upload" style={{ color: '#3498db' }} />
            {t('settings.cloudBackupTitle')}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.4' }}>
            {t('settings.cloudBackupDesc')}
          </p>
          <button
            onClick={beginCloudUpgrade}
            style={{ width: '100%', padding: '14px', background: '#099b46', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Icon icon="lucide:cloud-upload" />
            {t('settings.cloudBackupBtn')}
          </button>
          <button
            onClick={() => { window.location.href = '/upgrade-guide'; }}
            style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            {t('settings.cloudBackupHow')}
          </button>
        </div>
      ) : (
        <div style={{
          border: '2px solid rgba(231, 76, 60, 0.2)',
          padding: '24px',
          borderRadius: '24px',
          backgroundColor: 'rgba(231, 76, 60, 0.05)'
        }}>
          <h3 style={{ marginTop: 0, color: '#d63031', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:alert-triangle" />
            {t('settings.dangerZone')}
          </h3>
          <p style={{ color: '#d63031', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.4' }}>
            {t('settings.disconnectDesc')}
          </p>

          <DisconnectButton />
        </div>
      )}
    </div>
    </>
  );
}
