import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import InfoTip from '../shared/InfoTip';
import { cachedBusinessName } from './cfdi/cfdiShared';
import { useCfdiRequests } from './cfdi/useCfdiRequests';
import { useCfdiEmail } from './cfdi/useCfdiEmail';
import { useCustomDomain } from './cfdi/useCustomDomain';
import { useGlobalPeriods } from './cfdi/useGlobalPeriods';
import GlobalPeriodsPanel from './cfdi/GlobalPeriodsPanel';
import EmailPanel from './cfdi/EmailPanel';
import DomainPanel from './cfdi/DomainPanel';
import RequestCard from './cfdi/RequestCard';
import { ReopenModal, FolioModal } from './cfdi/CfdiModals';

function CfdiTab({ showAlert, showConfirm }) {
  const { t, lang } = useTranslation();
  const dateLocale = lang === 'en' ? 'en-US' : 'es-MX';
  const [showGlobalConfig, setShowGlobalConfig] = useState(false);
  const [showEmailConfig, setShowEmailConfig] = useState(false);
  const [showDomainConfig, setShowDomainConfig] = useState(false);

  const requestsApi = useCfdiRequests({ showAlert, showConfirm, t });
  const { loading, requests, filteredRequests, filter, setFilter, fetchRequests, reopenModal, folioModal } = requestsApi;
  const email = useCfdiEmail({ showAlert, t, onResent: fetchRequests });
  const { emailStatus } = email;
  const domain = useCustomDomain('cfdi', t);
  const periods = useGlobalPeriods({ open: showGlobalConfig, showAlert, showConfirm, t });

  return (
    <div className="admin-tab">
      <div className="tab-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', margin: '0 0 5px 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon icon="lucide:file-text" style={{ color: 'var(--brand-color)' }} />
            {t('admin.cfdi')}
          <InfoTip text={t('pageInfo.cfdi')} section="cfdi" />
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('cfdiTab.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: '0 1 auto', justifyContent: 'flex-end' }}>
          <button onClick={() => setShowGlobalConfig(!showGlobalConfig)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', whiteSpace: 'nowrap', flex: '1 1 auto' }}>
            <Icon icon="lucide:calendar-check" />
            {t('cfdiTab.btnGlobal')}
          </button>
          {emailStatus && (
            <button onClick={() => setShowEmailConfig(!showEmailConfig)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', whiteSpace: 'nowrap', flex: '1 1 auto' }}>
              <Icon icon="lucide:mail" />
              {t('cfdiTab.btnEmail')}
            </button>
          )}
          <button onClick={() => setShowDomainConfig(!showDomainConfig)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', whiteSpace: 'nowrap', flex: '1 1 auto' }}>
            <Icon icon="lucide:globe" />
            {t('cfdiTab.btnDomain')}
          </button>
          <button onClick={fetchRequests} disabled={loading} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexShrink: 0 }}>
            <Icon icon="lucide:refresh-cw" className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {showGlobalConfig && <GlobalPeriodsPanel periods={periods} businessName={cachedBusinessName()} dateLocale={dateLocale} t={t} />}
      {showEmailConfig && emailStatus && <EmailPanel email={email} t={t} />}
      {showDomainConfig && <DomainPanel domain={domain} t={t} />}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={() => setFilter('pending')}
          style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', background: filter === 'pending' ? 'var(--brand-color)' : 'var(--bg-surface)', color: filter === 'pending' ? 'white' : 'var(--text-muted)', border: filter === 'pending' ? 'none' : '1px solid var(--border)' }}
        >
          {t('cfdiTab.tabPending')}
        </button>
        <button 
          onClick={() => setFilter('issued')}
          style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', background: filter === 'issued' ? 'var(--brand-color)' : 'var(--bg-surface)', color: filter === 'issued' ? 'white' : 'var(--text-muted)', border: filter === 'issued' ? 'none' : '1px solid var(--border)' }}
        >
          {t('cfdiTab.tabIssued')}
        </button>
      </div>

      {loading && requests.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('cfdiTab.loading')}</div>
      ) : filteredRequests.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '12px', color: 'var(--text-muted)' }}>
          <Icon icon="lucide:inbox" style={{ fontSize: '3rem', marginBottom: '10px', opacity: 0.5 }} />
          <p>{t('cfdiTab.empty')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredRequests.map(req => (
            <RequestCard key={`${req.sourceTable}-${req.id}`} req={req} requests={requestsApi} email={email} dateLocale={dateLocale} t={t} />
          ))}
        </div>
      )}

      {reopenModal && <ReopenModal requests={requestsApi} t={t} />}
      {folioModal.isOpen && <FolioModal requests={requestsApi} showAlert={showAlert} t={t} />}
    </div>
  );
}

export default CfdiTab;
