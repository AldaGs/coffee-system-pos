import { Icon } from '@iconify/react';

// Resend settings, message template, preview and test send for emailed CFDIs.
export default function EmailPanel({ email, t }) {
  const { emailStatus, emailForm, setEmailForm, emailBusy, emailPreview, handleSaveEmail, handlePreviewEmail, handleTestEmail } = email;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon icon="lucide:mail" style={{ color: 'var(--brand-color)' }} />
        {t('cfdiTab.emailTitle')}
      </h3>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        {t('cfdiTab.emailDescBefore')} <a href="https://resend.com" target="_blank" rel="noreferrer" style={{ color: 'var(--brand-color)' }}>Resend</a> {t('cfdiTab.emailDescAfter')}
      </p>
      {emailStatus.configured && <strong style={{ color: 'var(--brand-color)' }}>{t('cfdiTab.apiKeySaved')}</strong>}
      <input
        type="password"
        autoComplete="new-password"
        placeholder={emailStatus.configured ? t('cfdiTab.apiKeyNew') : t('cfdiTab.apiKeyPlaceholder')}
        value={emailForm.apiKey}
        onChange={e => setEmailForm(prev => ({ ...prev, apiKey: e.target.value }))}
        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
      />
      <input
        type="text"
        placeholder={t('cfdiTab.fromPlaceholder')}
        value={emailForm.from}
        onChange={e => setEmailForm(prev => ({ ...prev, from: e.target.value }))}
        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
      />
      <input
        type="email"
        placeholder={t('cfdiTab.replyToPlaceholder')}
        value={emailForm.replyTo}
        onChange={e => setEmailForm(prev => ({ ...prev, replyTo: e.target.value }))}
        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
      />
      <strong style={{ color: 'var(--text-main)', marginTop: '4px' }}>{t('cfdiTab.messageTitle')}</strong>
      <small style={{ color: 'var(--text-muted)' }}>
        {t('cfdiTab.use')} {['{cliente}', '{negocio}', '{folio}', '{rfc}', '{ticket}'].map((p, i) => (
          <span key={p}>{i > 0 && ', '}<code style={{ background: 'var(--bg-main)', padding: '1px 5px', borderRadius: 4 }}>{p}</code></span>
        ))}. {t('cfdiTab.messageHint')}
      </small>
      <textarea
        value={emailForm.message}
        onChange={e => setEmailForm(prev => ({ ...prev, message: e.target.value }))}
        placeholder={t('cfdiTab.messagePlaceholder')}
        maxLength={2000}
        rows={4}
        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', resize: 'vertical', fontFamily: 'inherit' }}
      />
      <textarea
        value={emailForm.footer}
        onChange={e => setEmailForm(prev => ({ ...prev, footer: e.target.value }))}
        placeholder={t('cfdiTab.footerPlaceholder')}
        maxLength={500}
        rows={2}
        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', resize: 'vertical', fontFamily: 'inherit' }}
      />
      {emailPreview && (
        <iframe
          title={t('cfdiTab.emailPreviewTitle')}
          sandbox=""
          // Links would navigate the iframe itself, wiping the preview.
          srcDoc={`<style>a{pointer-events:none}</style>${emailPreview}`}
          style={{ width: '100%', height: '360px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }}
        />
      )}
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', color: 'var(--text-main)' }}>
        <input type="checkbox" className="switch" checked={emailForm.enabled} onChange={e => setEmailForm(prev => ({ ...prev, enabled: e.target.checked }))} />
        <span>{t('cfdiTab.autoSend')}</span>
      </label>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleSaveEmail}
          disabled={!!emailBusy || !emailForm.from.trim() || (!emailStatus.configured && !emailForm.apiKey.trim())}
          style={{ background: 'var(--brand-color)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', opacity: emailBusy ? 0.5 : 1 }}
        >
          <Icon icon="lucide:save" /> {t('common.save')}
        </button>
        {emailStatus.configured && (
          <button
            type="button"
            onClick={handlePreviewEmail}
            disabled={!!emailBusy}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Icon icon={emailBusy === 'preview' ? 'lucide:loader' : 'lucide:eye'} className={emailBusy === 'preview' ? 'spin' : ''} /> {t('cfdiTab.preview')}
          </button>
        )}
        {emailStatus.configured && (
          <button
            type="button"
            onClick={handleTestEmail}
            disabled={!!emailBusy}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Icon icon={emailBusy === 'test' ? 'lucide:loader' : 'lucide:send'} className={emailBusy === 'test' ? 'spin' : ''} /> {t('cfdiTab.sendTest')}
          </button>
        )}
      </div>
    </div>
  );
}
