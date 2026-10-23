import { Icon } from '@iconify/react';
import InfoTip from '../../shared/InfoTip';
import { SettingToggle, TimezonePicker } from './fields';
import { parseColorToHex } from './parseColor';
import { useTranslation } from '../../../hooks/useTranslation';

export function StoreIdentitySection({ brandColorInput, brandColorInvalid, commitBrandColor, generalSettings, setBrandColorInput, setBrandColorInvalid, setGeneralSettings }) {
  const { t } = useTranslation();
  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon icon="lucide:terminal" style={{ color: 'var(--brand-color)' }} />
        {t('settings.registerName')}
      </label>
      <input type="text" value={generalSettings.name} onChange={(e) => setGeneralSettings({ ...generalSettings, name: e.target.value })} placeholder="e.g., Front Counter iPad" style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
    </div>

    {/* Store-wide business type. Synced (lives in generalSettings →
        shop_settings), unlike the per-device layout mode below. Sets
        defaults + vocabulary across the app and is read by sibling apps. */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon icon="lucide:store" style={{ color: 'var(--brand-color)' }} />
        {t('settings.businessType')}
      </label>
      <small style={{ color: 'var(--text-muted)', marginTop: '-2px' }}>{t('settings.businessTypeDesc')}</small>
      <select
        value={generalSettings.businessType || 'restaurant'}
        onChange={(e) => setGeneralSettings({ ...generalSettings, businessType: e.target.value })}
        style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
      >
        <option value="restaurant">{t('settings.bizRestaurant')}</option>
        <option value="quickservice">{t('settings.bizQuickService')}</option>
        <option value="store">{t('settings.bizStore')}</option>
        <option value="ecommerce">{t('settings.bizEcommerce')}</option>
      </select>
    </div>

    {/* FIX: Changed from Grid to Flex + mobile-flex-stack class */}
    <div className="mobile-flex-stack" style={{ display: 'flex', gap: '20px' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="lucide:palette" style={{ color: 'var(--brand-color)' }} />
          {t('settings.brandColor')}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-main)', padding: '8px', borderRadius: '12px', border: `1px solid ${brandColorInvalid ? 'var(--danger, #e53935)' : 'var(--border)'}`, width: '100%', boxSizing: 'border-box' }}>
          <input
            type="color"
            value={generalSettings.brandColor}
            onChange={(e) => {
              setGeneralSettings({ ...generalSettings, brandColor: e.target.value });
              setBrandColorInput(e.target.value);
              setBrandColorInvalid(false);
            }}
            style={{ width: '40px', height: '40px', border: 'none', cursor: 'pointer', padding: 0, borderRadius: '8px', overflow: 'hidden', background: 'none', flexShrink: 0 }}
          />
          <input
            type="text"
            value={brandColorInput}
            onChange={(e) => {
              setBrandColorInput(e.target.value);
              const hex = parseColorToHex(e.target.value);
              if (hex) {
                setGeneralSettings({ ...generalSettings, brandColor: hex });
                setBrandColorInvalid(false);
              } else {
                setBrandColorInvalid(true);
              }
            }}
            onBlur={(e) => commitBrandColor(e.target.value)}
            placeholder="#RRGGBB or rgb(r,g,b)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            style={{ fontFamily: 'monospace', color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 'bold', flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', padding: '4px 0' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="lucide:languages" style={{ color: 'var(--brand-color)' }} />
          {t('settings.language')}
        </label>
        <select
          value={generalSettings.language || 'en'}
          onChange={(e) => setGeneralSettings({ ...generalSettings, language: e.target.value })}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', cursor: 'pointer', outline: 'none' }}
        >
          <option value="en">English (US)</option>
          <option value="es">Español (MX)</option>
        </select>
      </div>
    </div>

    {/* Timezone — used by the menu scheduler (migration 015) to resolve
        brunch/winter/etc. windows in the shop's wall clock instead of UTC. */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon icon="lucide:clock" style={{ color: 'var(--brand-color)' }} />
        {t('settings.timezone')}
        <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {t('settings.timezoneHint')}
        </span>
      </label>
      <TimezonePicker
        value={generalSettings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
        onChange={tz => setGeneralSettings({ ...generalSettings, timezone: tz })}
      />
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon icon="lucide:monitor" style={{ color: 'var(--brand-color)' }} />
        {t('settings.colorTheme')}
      </label>
      <select value={generalSettings.isDarkMode} onChange={(e) => setGeneralSettings({ ...generalSettings, isDarkMode: e.target.value === 'true' })} style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', cursor: 'pointer', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }}>
        <option value={false}>☀️ {t('settings.lightMode')}</option>
        <option value={true}>🌙 {t('settings.darkMode')}</option>
      </select>
    </div>
    </>
  );
}

export function BrandingSection({ generalSettings, handleAppLogoUpload, setGeneralSettings }) {
  const { t } = useTranslation();
  return (
    <>
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon icon="lucide:image" style={{ color: 'var(--brand-color)' }} />
        {t('settings.appBranding')}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.appLogo')}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <label style={{ padding: '10px 20px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:upload" />
            {t('common.upload')}
            <input type="file" accept="image/*" onChange={handleAppLogoUpload} style={{ display: 'none' }} />
          </label>
          {generalSettings.appBootLogo && (
            <button
              onClick={() => setGeneralSettings({ ...generalSettings, appBootLogo: null })}
              style={{ background: 'rgba(231, 76, 60, 0.1)', border: 'none', color: '#e74c3c', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Icon icon="lucide:trash-2" />
              {t('settings.removeLogo')}
            </button>
          )}
        </div>

        {generalSettings.appBootLogo ? (
          <div style={{ padding: '15px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px dashed var(--border)', textAlign: 'center' }}>
            <img
              src={generalSettings.appBootLogo}
              alt="App Boot Logo"
              style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' }}
            />
          </div>
        ) : (
          <div style={{ padding: '30px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px dashed var(--border)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <Icon icon="lucide:image-plus" style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.3 }} />
            <div>No logo uploaded</div>
          </div>
        )}
        <small style={{ color: 'var(--text-muted)', lineHeight: '1.4' }}>{t('settings.appLogoDesc')}</small>
      </div>
    </div>

    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon icon="lucide:shield" style={{ color: 'var(--brand-color)' }} />
        {t('settings.security')}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.autoLock')}</label>
        <div style={{ position: 'relative' }}>
          <Icon icon="lucide:clock" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="number" min="0" value={generalSettings.autoLockMinutes} onChange={(e) => setGeneralSettings({ ...generalSettings, autoLockMinutes: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '12px 12px 12px 38px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <small style={{ color: 'var(--text-muted)' }}>{t('settings.autoLockDesc')}</small>
      </div>
    </div>
    </>
  );
}

export function AccessSection({ generalSettings, setGeneralSettings }) {
  const { t } = useTranslation();
  return (
    <>
    {/* --- ACCESS RESTRICTIONS: opt-in RBAC. Off by default so existing
        shops that share PINs keep working unchanged. --- */}
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon icon="lucide:lock-keyhole" style={{ color: 'var(--brand-color)' }} />
        {t('settings.accessGroupTitle')}
      </h3>
      <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '14px' }}>
        {t('settings.accessGroupDesc')}{' '}<InfoTip text={t('settings.accessGroupInfo')} section="settings" />
      </small>

      <SettingToggle
        icon="lucide:user-cog"
        label={t('settings.strictAdminAccess')}
        desc={t('settings.strictAdminAccessDesc')}
        checked={!!generalSettings.strictAdminAccess}
        onChange={(v) => setGeneralSettings({ ...generalSettings, strictAdminAccess: v })}
      />

      <SettingToggle
        icon="lucide:receipt-text"
        label={t('settings.strictRegisterOverrides')}
        desc={t('settings.strictRegisterOverridesDesc')}
        checked={!!generalSettings.strictRegisterOverrides}
        onChange={(v) => setGeneralSettings({ ...generalSettings, strictRegisterOverrides: v })}
      />
    </div>
    </>
  );
}
