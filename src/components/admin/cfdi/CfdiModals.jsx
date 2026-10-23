import { Icon } from '@iconify/react';
import { REOPEN_FIELDS, ZIP_DAYS } from './cfdiShared';

export function ReopenModal({ requests, t }) {
  const { reopenModal, setReopenModal, handleReopen, isSubmitting } = requests;
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '400px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '1.4rem', color: 'var(--text-main)' }}>{t('cfdiTab.reopenRequest')}</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '0.9rem' }}>
          {t('cfdiTab.reopenDesc')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {REOPEN_FIELDS.map(([key, label]) => {
            const on = reopenModal.fields.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setReopenModal(prev => ({ ...prev, fields: on ? prev.fields.filter(k => k !== key) : [...prev.fields, key] }))}
                style={{ padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', background: on ? 'rgba(231, 76, 60, 0.1)' : 'var(--bg-main)', color: on ? '#c0392b' : 'var(--text-muted)', border: `1px solid ${on ? '#e74c3c' : 'var(--border)'}` }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <textarea
          value={reopenModal.note}
          onChange={(e) => setReopenModal(prev => ({ ...prev, note: e.target.value }))}
          placeholder={t('cfdiTab.notePlaceholder')}
          maxLength={500}
          rows={3}
          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.95rem', outline: 'none', resize: 'vertical', marginBottom: '20px', fontFamily: 'inherit' }}
        />
        <div className="modal-actions">
          <button onClick={() => setReopenModal(null)} className="btn-cancel" style={{ flex: 1 }}>{t('common.cancel')}</button>
          <button onClick={handleReopen} className="btn-confirm" disabled={isSubmitting} style={{ flex: 1 }}>
            {isSubmitting ? t('cfdiTab.saving') : t('cfdiTab.reopen')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FolioModal({ requests, showAlert, t }) {
  const { folioModal, setFolioModal, closeFolio, handleMarkIssued, isSubmitting } = requests;
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '400px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '1.4rem', color: 'var(--text-main)' }}>{t('cfdiTab.issueTitle')}</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
          {t('cfdiTab.issueDesc').replace('{rfc}', folioModal.item?.fiscal_profiles?.rfc || t('cfdiTab.thisTicket'))}
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-main)' }}>Folio Fiscal / UUID CFDI</label>
          <input
            type="text"
            autoFocus
            value={folioModal.folio}
            onChange={(e) => setFolioModal(prev => ({ ...prev, folio: e.target.value }))}
            placeholder={t('cfdiTab.folioPlaceholder')}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: '2px solid var(--border)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '1.1rem',
              outline: 'none'
            }}
          />
        </div>

        {folioModal.item?.sourceTable === 'sales' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-main)' }}>{t('cfdiTab.zipLabel')}</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: '2px dashed var(--border)', background: 'var(--bg-main)', cursor: 'pointer', minWidth: 0 }}>
              <Icon icon="lucide:upload" style={{ color: 'var(--brand-color)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: folioModal.zip ? 'var(--text-main)' : 'var(--text-muted)' }}>
                {folioModal.zip ? folioModal.zip.name : t('cfdiTab.selectZip')}
              </span>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f && f.size > 5 * 1024 * 1024) { e.target.value = ''; showAlert(t('common.error'), t('cfdiTab.zipTooBig')); return; }
                  setFolioModal(prev => ({ ...prev, zip: f }));
                }}
                style={{ display: 'none' }}
              />
            </label>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '6px 0 0' }}>
              {t('cfdiTab.zipHint').replace('{days}', ZIP_DAYS)}
            </p>
          </div>
        )}

        <div className="modal-actions">
          <button onClick={() => closeFolio()} className="btn-cancel" style={{ flex: 1 }}>{t('common.cancel')}</button>
          <button onClick={handleMarkIssued} className="btn-confirm" disabled={!folioModal.folio.trim() || isSubmitting} style={{ flex: 1, background: folioModal.folio.trim() ? '#2980b9' : 'var(--bg-main)', color: folioModal.folio.trim() ? 'white' : 'var(--text-muted)' }}>
            {isSubmitting ? t('cfdiTab.saving') : t('cfdiTab.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
