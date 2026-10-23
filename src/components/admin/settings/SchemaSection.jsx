import { APP_SCHEMA_VERSION } from '../../../utils/schemaVersion';
import { Icon } from '@iconify/react';
import { isLocalMode } from '../../../utils/appMode';
import { useTranslation } from '../../../hooks/useTranslation';

export function SchemaSection({ dbVersion, isUnknown, isUpToDate, schemaBtnRef, schemaUpdateError, schemaUpdating, startSchemaUpdate }) {
  const { t } = useTranslation();
  return (
    <>
    {/* --- SCHEMA MAINTENANCE: brings the tenant's Supabase project up to
        the schema version this build of the app expects. Idempotent and
        safe to re-run. Cloud-only — hidden in local ('guest') mode. --- */}
    {!isLocalMode() && (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon icon="lucide:database-zap" style={{ color: 'var(--brand-color)' }} />
        {t('settings.schemaUpdateTitle')}
      </h3>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '12px 14px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-surface)', color: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon icon={isUpToDate ? 'lucide:check-circle-2' : 'lucide:arrow-up-circle'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.95rem' }}>
            {dbVersion === null
              ? t('settings.schemaUpdateChecking')
              : isUnknown
                ? t('settings.schemaUpdateUnknown')
                : isUpToDate
                  ? t('settings.schemaUpdateUpToDate')
                  : t('settings.schemaUpdateAvailable')}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '2px', lineHeight: 1.4 }}>
            {t('settings.schemaUpdateVersions')
              .replace('{installed}', dbVersion === null ? '…' : dbVersion)
              .replace('{latest}', APP_SCHEMA_VERSION)}
          </div>
          {schemaUpdateError && (
            <div style={{ marginTop: '8px', color: '#c0392b', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon icon="lucide:alert-circle" />
              <span>{schemaUpdateError}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          ref={schemaBtnRef}
          onClick={startSchemaUpdate}
          disabled={schemaUpdating || dbVersion === null}
          style={{
            flexShrink: 0,
            padding: '10px 14px',
            background: 'var(--brand-color)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: (schemaUpdating || dbVersion === null) ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: (schemaUpdating || dbVersion === null) ? 0.6 : 1,
          }}
        >
          <Icon
            icon={schemaUpdating ? 'lucide:loader-2' : 'lucide:database-zap'}
            style={{ animation: schemaUpdating ? 'spin 1s linear infinite' : 'none' }}
          />
          {schemaUpdating ? t('settings.schemaUpdating') : t('settings.schemaUpdateBtn')}
        </button>
      </div>
    </div>
    )}
    </>
  );
}
