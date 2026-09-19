import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { beginCloudUpgrade } from '../../utils/appMode';

// Public Menus needs a Supabase project to serve /menu, so a local install
// can't use it. Show the tab anyway, locked, with the same upgrade entry point
// as General Settings: this is the moment the owner actually wants the cloud.
export default function PublicMenusLocked() {
  const { t } = useTranslation();
  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '32px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('admin.publicMenus')}</h1>
      </div>
      <div style={{ maxWidth: '560px', border: '2px solid rgba(52, 152, 219, 0.25)', padding: '28px', borderRadius: '24px', backgroundColor: 'rgba(52, 152, 219, 0.06)' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="lucide:lock" style={{ color: '#3498db' }} />
          {t('publicMenusLocked.title')}
        </h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
          {t('publicMenusLocked.body')}
        </p>
        <button
          onClick={beginCloudUpgrade}
          style={{ width: '100%', padding: '14px', background: '#099b46', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <Icon icon="lucide:globe" />
          {t('publicMenusLocked.cta')}
        </button>
      </div>
    </div>
  );
}
