import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { useDialog } from '../../contexts/DialogContext';
import ExportKeysButton from '../ExportKeysButton';
import DisconnectButton from '../DisconnectButton';
import SharedPinPad from '../shared/SharedPinPad';

function GeneralSettingsTab({ generalSettings, setGeneralSettings, handleAppLogoUpload, handleSaveGeneralSettings, menuData, saveMenuToCloud, setLoyaltyForm }) {

  const { t } = useTranslation();
  const { showAlert, showConfirm } = useDialog();

  const [pinChallenge, setPinChallenge] = useState({ isOpen: false, onAuthorized: null });
  const [pinAttempt, setPinAttempt] = useState('');
  const [pinError, setPinError] = useState(false);

  const closePinChallenge = () => {
    setPinChallenge({ isOpen: false, onAuthorized: null });
    setPinAttempt('');
    setPinError(false);
  };

  const handlePinSubmit = () => {
    const isMasterPin = pinAttempt === generalSettings.pinCode;
    const isStaffAdmin = (menuData?.cashiers || []).some(
      c => c.isAdmin === true && c.pin === pinAttempt
    );
    if (isMasterPin || isStaffAdmin) {
      const action = pinChallenge.onAuthorized;
      closePinChallenge();
      if (action) action();
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 500);
      setPinAttempt('');
    }
  };

  const handleAdvancedModeToggle = () => {
    const next = !generalSettings.isAdvancedMode;

    const applyChange = (alsoDeactivate) => {
      setPinChallenge({
        isOpen: true,
        onAuthorized: () => {
          setGeneralSettings({ ...generalSettings, isAdvancedMode: next });
          if (alsoDeactivate && menuData) {
            const updatedMenu = {
              ...menuData,
              loyaltySettings: { ...(menuData.loyaltySettings || {}), isActive: false },
              discountRules: (menuData.discountRules || []).map(r => ({ ...r, isActive: false })),
            };
            saveMenuToCloud(updatedMenu);
            if (setLoyaltyForm) setLoyaltyForm(prev => ({ ...prev, isActive: false }));
          }
        },
      });
    };

    if (next === false) {
      const loyaltyOn = !!menuData?.loyaltySettings?.isActive;
      const activeRules = (menuData?.discountRules || []).filter(r => r.isActive);
      if (loyaltyOn || activeRules.length > 0) {
        const lines = [];
        if (loyaltyOn) lines.push('• ' + t('settings.willDisableLoyalty'));
        if (activeRules.length > 0) lines.push('• ' + t('settings.willDisableRules').replace('{{n}}', activeRules.length));
        showConfirm(
          t('settings.liteWarnTitle'),
          t('settings.liteWarnDesc') + '\n\n' + lines.join('\n'),
          () => applyChange(true)
        );
        return;
      }
    }
    applyChange(false);
  };

  const isAdvancedOn = generalSettings.isAdvancedMode === true;

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '32px' }}>
        <h1 style={{ color: 'var(--text-main)', fontSize: '2rem', marginBottom: '8px', fontWeight: '800' }}>{t('settings.title')}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{t('settings.subtitle')}</p>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'start' }}>
        
        {/* --- LEFT COLUMN: CORE SETTINGS --- */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:terminal" style={{ color: 'var(--brand-color)' }} />
              {t('settings.registerName')}
            </label>
            <input type="text" value={generalSettings.name} onChange={(e) => setGeneralSettings({ ...generalSettings, name: e.target.value })} placeholder="e.g., Front Counter iPad" style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
          </div>

          {/* FIX: Changed from Grid to Flex + mobile-flex-stack class */}
          <div className="mobile-flex-stack" style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:palette" style={{ color: 'var(--brand-color)' }} />
                {t('settings.brandColor')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-main)', padding: '8px', borderRadius: '12px', border: '1px solid var(--border)', width: '100%', boxSizing: 'border-box' }}>
                <input type="color" value={generalSettings.brandColor} onChange={(e) => setGeneralSettings({ ...generalSettings, brandColor: e.target.value })} style={{ width: '40px', height: '40px', border: 'none', cursor: 'pointer', padding: 0, borderRadius: '8px', overflow: 'hidden', background: 'none' }} />
                <span style={{ fontFamily: 'monospace', color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 'bold' }}>{generalSettings.brandColor.toUpperCase()}</span>
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
        </div>

        {/* --- RIGHT COLUMN: WORKFLOW & HARDWARE --- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h3 style={{ margin: '0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon icon="lucide:users" style={{ color: 'var(--brand-color)' }} />
              {t('settings.workflow')}
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.visibility')}</label>
              <select
                value={generalSettings.ticketVisibility || 'open'}
                onChange={(e) => setGeneralSettings({ ...generalSettings, ticketVisibility: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
              >
                <option value="open">{t('settings.visibilityOpen')}</option>
                <option value="isolated">{t('settings.visibilityIsolated')}</option>
              </select>
              <small style={{ color: 'var(--text-muted)' }}>{t('settings.visibilityDesc')}</small>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:zap" style={{ color: 'var(--brand-color)' }} />
                {t('settings.advancedMode')}
              </label>
              <button
                type="button"
                onClick={handleAdvancedModeToggle}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  color: 'var(--text-main)',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                }}
              >
                <span>{isAdvancedOn ? 'ON' : 'OFF'}</span>
                <span
                  aria-hidden
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '12px',
                    background: isAdvancedOn ? 'var(--brand-color)' : 'var(--border)',
                    position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: isAdvancedOn ? '22px' : '2px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: 'white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      transition: 'left 0.2s',
                    }}
                  />
                </span>
              </button>
              <small style={{ color: 'var(--text-muted)' }}>{t('settings.advancedModeDesc')}</small>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:hash" style={{ color: 'var(--brand-color)' }} />
                {t('settings.orderNums')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.resetPolicy')}</label>
                <select
                  value={generalSettings.orderResetPolicy || 'daily'}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, orderResetPolicy: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="never">{t('settings.resetNever')}</option>
                  <option value="daily">{t('settings.resetDaily')}</option>
                  <option value="weekly">{t('settings.resetWeekly')}</option>
                  <option value="monthly">{t('settings.resetMonthly')}</option>
                  <option value="yearly">{t('settings.resetYearly')}</option>
                </select>
                <small style={{ color: 'var(--text-muted)' }}>{t('settings.resetFreqDesc')}</small>
                
                <button
                  onClick={() => {
                    showConfirm(
                      t('settings.resetTitle'), 
                      t('settings.resetConfirm'), 
                      () => {
                        localStorage.setItem('tinypos_nextOrderNum', 1);
                        showAlert(t('settings.resetSuccess'), t('settings.resetSuccessDesc'));
                      }
                    );
                  }}
                  style={{ 
                    padding: '12px 20px', 
                    background: 'transparent', 
                    color: '#e74c3c', 
                    border: '2px solid rgba(231, 76, 60, 0.3)', 
                    borderRadius: '12px', 
                    cursor: 'pointer', 
                    fontWeight: 'bold', 
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: 'fit-content',
                    marginTop: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(231, 76, 60, 0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Icon icon="lucide:rotate-ccw" />
                  {t('settings.btnReset')}
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:clipboard-check" style={{ color: 'var(--brand-color)' }} />
                {t('settings.shiftMgmt')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.enableCorte')}</label>
                <select
                  value={generalSettings.enableCorte !== false}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, enableCorte: e.target.value === 'true' })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                >
                  <option value={true}>{t('settings.corteYes')}</option>
                  <option value={false}>{t('settings.corteNo')}</option>
                </select>
                <small style={{ color: 'var(--text-muted)' }}>{t('settings.corteDesc')}</small>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:alert-circle" style={{ color: 'var(--brand-color)' }} />
                {t('settings.lowStockThreshold')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.lowStockThreshold')}</label>
                <input
                  type="number"
                  min="0"
                  value={generalSettings.lowStockThreshold !== undefined ? generalSettings.lowStockThreshold : 0}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, lowStockThreshold: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }}
                />
                <small style={{ color: 'var(--text-muted)' }}>{t('settings.lowStockThresholdDesc')}</small>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:printer" style={{ color: 'var(--brand-color)' }} />
                {t('settings.hardware')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.printerSize')}</label>
                <select
                  value={generalSettings.printerSize || '80mm'}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, printerSize: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="80mm">{t('settings.printer80')}</option>
                  <option value="58mm">{t('settings.printer58')}</option>
                </select>
                <small style={{ color: 'var(--text-muted)' }}>{t('settings.printerDesc')}</small>
              </div>
            </div>
          </div>

          {/* --- BOTTOM ACTIONS --- */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <button onClick={handleSaveGeneralSettings} style={{ width: '100%', boxSizing: 'border-box', padding: '18px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>
              <Icon icon="lucide:save" />
              {t('settings.btnSave')}
            </button>
            
            <ExportKeysButton />

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
          </div>
        </div>

      </div>

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