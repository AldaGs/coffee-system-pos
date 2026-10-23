import { useState } from 'react';
import { Icon } from '@iconify/react';
import { projectRef } from './cfdiShared';

// Custom portal domain plus the DNS records to point it here.
export default function DomainPanel({ domain, t }) {
  const { customDomain, setCustomDomain, linkedDomain, domainStatus, isAddingDomain, isRemovingDomain, handleAddDomain, handleRemoveDomain } = domain;
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const ref = projectRef();
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon icon="lucide:globe" style={{ color: 'var(--brand-color)' }} />
        {t('cfdiTab.domainTitle')}
      </h3>
      <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted)' }}>
        {t('cfdiTab.domainDesc')}
      </p>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder={t('cfdiTab.domainPlaceholder')}
          value={customDomain}
          onChange={e => setCustomDomain(e.target.value)}
          readOnly={!!linkedDomain}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', opacity: linkedDomain ? 0.7 : 1 }}
        />
        {linkedDomain ? (
          <button
            type="button"
            onClick={handleRemoveDomain}
            disabled={isRemovingDomain}
            style={{ background: '#e74c3c', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: isRemovingDomain ? 0.5 : 1, fontWeight: 'bold' }}
          >
            {isRemovingDomain ? <Icon icon="lucide:loader" style={{ animation: 'spin 1s linear infinite' }} /> : <Icon icon="lucide:trash" />}
            {t('cfdiTab.unlink')}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleAddDomain}
            disabled={isAddingDomain || !customDomain}
            style={{ background: 'var(--brand-color)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: (isAddingDomain || !customDomain) ? 0.5 : 1, fontWeight: 'bold' }}
          >
            {isAddingDomain ? <Icon icon="lucide:loader" style={{ animation: 'spin 1s linear infinite' }} /> : <Icon icon="lucide:plus" />}
            {t('cfdiTab.link')}
          </button>
        )}
      </div>
      {domainStatus && (
        <p style={{ marginTop: '12px', fontSize: '0.9rem', color: domainStatus.success ? '#27ae60' : '#e74c3c' }}>
          {domainStatus.message}
        </p>
      )}

      <button 
         type="button" 
         onClick={() => setIsHelpOpen(!isHelpOpen)}
         style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, marginTop: 16, fontSize: '0.9rem' }}
      >
        <Icon icon={isHelpOpen ? "lucide:chevron-up" : "lucide:chevron-down"} />
        {isHelpOpen ? t('cfdiTab.hideDns') : t('cfdiTab.showDns')}
      </button>

      {isHelpOpen && (
        <div style={{ marginTop: 12, padding: 16, background: 'var(--bg-main)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)' }}>{t('cfdiTab.dnsTitle')}</p>
          <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {t('cfdiTab.dnsDesc')}
          </p>

          <div style={{ marginBottom: 16 }}>
            <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)', display: 'block', marginBottom: 6 }}>{t('cfdiTab.dnsOptionA')}</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '6px 12px', fontSize: '0.8rem', alignItems: 'center', background: 'var(--bg-surface)', padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--text-muted)' }}>{t('cfdiTab.dnsType')}</strong>
              <strong style={{ color: 'var(--text-muted)' }}>{t('cfdiTab.dnsName')}</strong>
              <strong style={{ color: 'var(--text-muted)' }}>{t('cfdiTab.dnsValue')}</strong>
              
              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>CNAME</code>
              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>facturacion</code>
              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>cname.vercel-dns.com.</code>

              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>TXT</code>
              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>_tinypos.facturacion</code>
              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>tinypos-ref={ref}</code>
            </div>
          </div>

          <div>
            <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)', display: 'block', marginBottom: 6 }}>{t('cfdiTab.dnsOptionB')}</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '6px 12px', fontSize: '0.8rem', alignItems: 'center', background: 'var(--bg-surface)', padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--text-muted)' }}>{t('cfdiTab.dnsType')}</strong>
              <strong style={{ color: 'var(--text-muted)' }}>{t('cfdiTab.dnsName')}</strong>
              <strong style={{ color: 'var(--text-muted)' }}>{t('cfdiTab.dnsValue')}</strong>
              
              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>A</code>
              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>@</code>
              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>76.76.21.21</code>

              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>TXT</code>
              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>_tinypos</code>
              <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>tinypos-ref={ref}</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
