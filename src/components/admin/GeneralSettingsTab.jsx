import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { useDialog } from '../../hooks/useDialog';
import SharedPinPad from '../shared/SharedPinPad';
import { isLocalMode } from '../../utils/appMode';
import { getBusinessProfile } from '../../utils/businessProfile';
import { ClipCard, AlertsCard } from './PaymentAlertCards';
import InfoTip from '../shared/InfoTip';
import { useSchemaUpdate } from './settings/useSchemaUpdate';
import { useAdvancedModeToggle } from './settings/useAdvancedModeToggle';
import { parseColorToHex } from './settings/parseColor';
import { StoreIdentitySection, BrandingSection, AccessSection } from './settings/CoreSections';
import { SchemaSection } from './settings/SchemaSection';
import { WorkflowCard } from './settings/WorkflowCard';
import { DeviceCard, AccountCard } from './settings/DeviceSections';

const LAYOUT_MODE_KEY = 'tinypos_layout_mode';
const integrationInput = { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' };

function GeneralSettingsTab({
  generalSettings,
  setGeneralSettings,
  handleAppLogoUpload,
  handleSaveGeneralSettings,
  menuData,
  saveSettingsToCloud,
  setLoyaltyForm,
}) {
  const { t } = useTranslation();
  const { showAlert } = useDialog();
  const { dbVersion, schemaUpdating, schemaUpdateError, schemaBtnRef, startSchemaUpdate, isUpToDate, isUnknown } = useSchemaUpdate();
  const {
    pinChallenge, pinAttempt, setPinAttempt, pinError, setPinError, closePinChallenge, handlePinSubmit, handleAdvancedModeToggle,
  } = useAdvancedModeToggle({ generalSettings, setGeneralSettings, menuData, saveSettingsToCloud, setLoyaltyForm });

  const [brandColorInput, setBrandColorInput] = useState(generalSettings.brandColor || '#000000');
  const [brandColorInvalid, setBrandColorInvalid] = useState(false);
  const commitBrandColor = (raw) => {
    const hex = parseColorToHex(raw);
    if (!hex) { setBrandColorInvalid(true); return; }
    setGeneralSettings({ ...generalSettings, brandColor: hex });
    setBrandColorInput(hex);
    setBrandColorInvalid(false);
  };

  // The register layout is per device (counter vs. floor), so it lives only in
  // localStorage and never in the synced settings. It starts from the business type.
  const [layoutMode, setLayoutMode] = useState(() =>
    localStorage.getItem(LAYOUT_MODE_KEY) || getBusinessProfile(generalSettings.businessType).defaultLayout);
  const handleLayoutModeChange = (mode) => {
    setLayoutMode(mode);
    try { localStorage.setItem(LAYOUT_MODE_KEY, mode); } catch { /* storage unavailable: keep it in memory */ }
  };

  const isAdvancedOn = generalSettings.isAdvancedMode === true;

  // overflowX visible overrides .admin-section's `overflow-x: auto`, which would
  // otherwise make this element its own scroll container and stop the sticky
  // header from ever sticking to .admin-main's scrollport.
  return (
    <div className="admin-section fade-in" style={{ overflowX: 'visible' }}>
      {/* Sticky so Save stays reachable without scrolling back down — this page
          is long. Negative margins + matching padding let the background span
          .admin-main's 40px padding, so content scrolls under it cleanly. */}
      <div
        className="admin-section-header settings-sticky-header"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ color: 'var(--text-main)', fontSize: '2rem', marginBottom: '8px', fontWeight: '800' }}>{t('settings.title')}{' '}<InfoTip text={t('pageInfo.settings')} section="settings" /></h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{t('settings.subtitle')}</p>
        </div>
        <button onClick={handleSaveGeneralSettings} style={{ flexShrink: 0, padding: '14px 28px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>
          <Icon icon="lucide:save" />
          {t('settings.btnSave')}
        </button>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'start' }}>

        {/* --- LEFT COLUMN: CORE SETTINGS --- */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          <StoreIdentitySection brandColorInput={brandColorInput} brandColorInvalid={brandColorInvalid} commitBrandColor={commitBrandColor} generalSettings={generalSettings} setBrandColorInput={setBrandColorInput} setBrandColorInvalid={setBrandColorInvalid} setGeneralSettings={setGeneralSettings} />

          <BrandingSection generalSettings={generalSettings} handleAppLogoUpload={handleAppLogoUpload} setGeneralSettings={setGeneralSettings} />

          <AccessSection generalSettings={generalSettings} setGeneralSettings={setGeneralSettings} />

          <SchemaSection dbVersion={dbVersion} isUnknown={isUnknown} isUpToDate={isUpToDate} schemaBtnRef={schemaBtnRef} schemaUpdateError={schemaUpdateError} schemaUpdating={schemaUpdating} startSchemaUpdate={startSchemaUpdate} />
        </div>

        {/* --- RIGHT COLUMN: WORKFLOW & HARDWARE --- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

          <WorkflowCard generalSettings={generalSettings} handleAdvancedModeToggle={handleAdvancedModeToggle} isAdvancedOn={isAdvancedOn} setGeneralSettings={setGeneralSettings} />

          <DeviceCard handleLayoutModeChange={handleLayoutModeChange} layoutMode={layoutMode} />

          <AccountCard />
        </div>

      </div>

      {!isLocalMode() && (
        <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'start', marginTop: '32px' }}>
          <ClipCard input={integrationInput} showAlert={showAlert} />
          <AlertsCard input={integrationInput} showAlert={showAlert} />
        </div>
      )}

      {pinChallenge.isOpen && (
        <SharedPinPad
          variant="modal"
          icon="lucide:shield-alert"
          title={t('settings.advancedPinTitle')}
          subtitle={t('pin.managerReq')}
          pin={pinAttempt}
          setPin={setPinAttempt}
          error={pinError}
          setError={setPinError}
          onSubmit={handlePinSubmit}
          onCancel={closePinChallenge}
          submitText={t('pin.btnVerify')}
          submitIcon="lucide:check-circle"
        />
      )}

    </div>
  );
}

export default GeneralSettingsTab;