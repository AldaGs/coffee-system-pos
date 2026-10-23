import { Icon } from '@iconify/react';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';

export function WorkflowCard({ generalSettings, handleAdvancedModeToggle, isAdvancedOn, setGeneralSettings }) {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useDialog();
  return (
    <>
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
          <Icon icon="lucide:monitor-play" style={{ color: 'var(--brand-color)' }} />
          {t('settings.kdsTitle')}
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {t('settings.kdsEnable')}
          </label>
          <select
            value={generalSettings.kdsEnabled === true}
            onChange={(e) => setGeneralSettings({ ...generalSettings, kdsEnabled: e.target.value === 'true' })}
            style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
          >
            <option value={false}>{t('settings.kdsOff')}</option>
            <option value={true}>{t('settings.kdsOn')}</option>
          </select>
          <small style={{ color: 'var(--text-muted)' }}>{t('settings.kdsEnableHint')}</small>

          {generalSettings.kdsEnabled && (
            <>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem', marginTop: '12px' }}>{t('settings.kdsMode')}</label>
              <select
                value={generalSettings.kdsMode || 'immediate'}
                onChange={(e) => setGeneralSettings({ ...generalSettings, kdsMode: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
              >
                <option value="immediate">{t('settings.kdsImmediate')}</option>
                <option value="manual">{t('settings.kdsManual')}</option>
              </select>
              <small style={{ color: 'var(--text-muted)' }}>{t('settings.kdsModeHint')}</small>
            </>
          )}
        </div>
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
                async () => {
                  const { db } = await import('../../../db');
                  await db.shift_state.put({ key: 'nextOrderNum', value: 1 });
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
    </>
  );
}
