import { Icon } from '@iconify/react';
import { REOPEN_FIELDS, fmtCents, reopenFieldLabel } from './cfdiShared';

// Same fields, labels and order as the reopen chips.
const FISCAL_FIELDS = REOPEN_FIELDS;

export default function RequestCard({ req, requests, email, dateLocale, t }) {
  const { isSubmitting, handleCopy, handleShareCFDI, handleCancel, setReopenModal, setFolioModal } = requests;
  const { emailStatus, emailBusy, handleResendEmail } = email;
  return (
    <div key={`${req.sourceTable}-${req.id}`} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 5px 0', color: 'var(--text-main)', fontSize: '1.2rem' }}>
            {req.order_name || req.name || `Ticket #${req.ticket_id || req.id}`}
          </h3>
          <div style={{ display: 'flex', gap: '6px 15px', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Icon icon="lucide:calendar" /> {new Date(req.created_at).toLocaleString()}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: req.isPaid ? '#27ae60' : '#e74c3c' }}>
              <Icon icon="lucide:dollar-sign" /> {fmtCents(req.total_amount)} ({req.isPaid ? t('cfdiTab.paid') : t('cfdiTab.unpaid')})
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, maxWidth: '100%' }}>
          {req.cfdi_status === 'requested' && <span style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#2980b9', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>{t('cfdiTab.statusRequested')}</span>}
          {req.cfdi_status === 'reopened' && <span style={{ background: 'rgba(243, 156, 18, 0.1)', color: '#d68910', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>{t('cfdiTab.statusReopened')}</span>}
          {req.cfdi_status === 'issued' && (
            <span style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#27ae60', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0, overflowWrap: 'anywhere' }}>
              {t('cfdiTab.statusIssued').replace('{folio}', req.cfdi_folio || '')}
              <button onClick={(e) => { e.stopPropagation(); handleCopy(req.cfdi_folio, 'Folio Fiscal'); }} style={{ background: 'none', border: 'none', color: '#27ae60', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <Icon icon="lucide:copy" />
              </button>
            </span>
          )}
          {req.cfdi_status === 'canceled' && <span style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#c0392b', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>{t('cfdiTab.statusCanceled')}</span>}
          
          <button onClick={() => handleShareCFDI(req)} title={t('cfdiTab.copyLink')} style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '6px', borderRadius: '50%', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
            <Icon icon="lucide:link" />
          </button>
        </div>
      </div>

      {/* Fiscal Profile Data */}
      {req.fiscal_profiles && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          
        {FISCAL_FIELDS.map(([key, label]) => (
          <div key={key} className="fiscal-field" style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ color: 'var(--text-main)', minWidth: 0, overflowWrap: 'anywhere' }}>{req.fiscal_profiles[key]}</strong>
              <button onClick={() => handleCopy(req.fiscal_profiles[key], label)} style={{ background: 'none', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', padding: '2px' }}><Icon icon="lucide:copy" /></button>
            </div>
          </div>
        ))}

        </div>
      )}

      {req.cfdi_status === 'reopened' && req.cfdi_reopen_note && (
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#d68910', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
          <Icon icon="lucide:message-square-warning" style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            {req.cfdi_reopen_note.fields?.length > 0 && <strong>{t('cfdiTab.review').replace('{fields}', req.cfdi_reopen_note.fields.map(reopenFieldLabel).join(', '))} </strong>}
            {req.cfdi_reopen_note.note}
          </span>
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap', marginTop: '10px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        {(req.cfdi_status === 'requested' || req.cfdi_status === 'reopened' || req.cfdi_status === 'canceled') && (
          <button 
            disabled={isSubmitting}
            onClick={() => setReopenModal({ item: req, fields: [], note: '' })}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {req.cfdi_status === 'canceled' ? t('cfdiTab.newRequest') : t('cfdiTab.reopenRequest')}
          </button>
        )}

        {(req.cfdi_status === 'requested' || req.cfdi_status === 'reopened') && (
            <button 
              disabled={isSubmitting || !req.isPaid}
              title={!req.isPaid ? t('cfdiTab.mustBePaid') : ''}
              onClick={() => setFolioModal({ isOpen: true, item: req, folio: '' })} 
              style={{ background: req.isPaid ? 'var(--brand-color)' : 'var(--bg-main)', color: req.isPaid ? 'white' : 'var(--text-muted)', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: req.isPaid ? 'pointer' : 'not-allowed', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Icon icon="lucide:check" /> {t('cfdiTab.markIssued')}
            </button>
        )}
        
        {req.cfdi_status === 'issued' && req.sourceTable === 'sales' && (
          <button
            disabled={isSubmitting}
            onClick={() => setFolioModal({ isOpen: true, item: req, folio: req.cfdi_folio || '' })}
            style={{ background: 'rgba(52, 152, 219, 0.1)', border: '1px solid #3498db', color: '#2980b9', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Icon icon="lucide:paperclip" /> {req.cfdi_zip_path ? t('cfdiTab.replaceZip') : t('cfdiTab.attachZip')}
          </button>
        )}
        {req.cfdi_status === 'issued' && req.sourceTable === 'sales' && emailStatus?.configured && req.fiscal_profiles?.email && (
          <button
            disabled={isSubmitting || !!emailBusy}
            onClick={() => handleResendEmail(req)}
            title={req.cfdi_email_error ? t('cfdiTab.lastFailed').replace('{err}', req.cfdi_email_error) : req.cfdi_emailed_at ? t('cfdiTab.sentOn').replace('{date}', new Date(req.cfdi_emailed_at).toLocaleString(dateLocale)) : t('cfdiTab.notSent')}
            style={{ background: 'transparent', border: `1px solid ${req.cfdi_email_error ? '#e74c3c' : 'var(--border)'}`, color: req.cfdi_email_error ? '#c0392b' : 'var(--text-main)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Icon icon={emailBusy === `resend-${req.id}` ? 'lucide:loader' : 'lucide:mail'} className={emailBusy === `resend-${req.id}` ? 'spin' : ''} />
            {req.cfdi_emailed_at || req.cfdi_email_error ? t('cfdiTab.resend') : t('cfdiTab.send')}
          </button>
        )}
        {req.cfdi_status === 'issued' && (
          <button
            disabled={isSubmitting}
            onClick={() => handleCancel(req)}
            style={{ background: 'rgba(231, 76, 60, 0.1)', border: '1px solid #e74c3c', color: '#c0392b', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Icon icon="lucide:x-circle" /> {t('cfdiTab.cancelTitle')}
          </button>
        )}
      </div>

    </div>
  );
}
