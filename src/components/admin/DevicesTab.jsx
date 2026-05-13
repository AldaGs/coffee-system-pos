import { Icon } from '@iconify/react';
import { useState, useMemo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

const DEVICE_EMAIL_DOMAIN = 'device.tinypos.com';

function slugifyDeviceName(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 32);
}

function DevicesTab() {
  const { t } = useTranslation();
  const [deviceName, setDeviceName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(null);

  const slug = useMemo(() => slugifyDeviceName(deviceName), [deviceName]);
  const previewEmail = slug ? `${slug}@${DEVICE_EMAIL_DOMAIN}` : '';

  const supabaseUrl = typeof window !== 'undefined' ? localStorage.getItem('tinypos_supabase_url') : null;
  const serviceRoleKey = typeof window !== 'undefined' ? localStorage.getItem('tinypos_supabase_service_role') : null;
  const missingServiceRole = !serviceRoleKey;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!slug) {
      setError(t('devices.errorInvalidName'));
      return;
    }
    if (!password || password.length < 6) {
      setError(t('devices.errorShortPassword'));
      return;
    }
    if (!supabaseUrl || !serviceRoleKey) {
      setError(t('devices.errorMissingCreds'));
      return;
    }

    const email = `${slug}@${DEVICE_EMAIL_DOMAIN}`;

    setSubmitting(true);
    try {
      const response = await fetch('/api/add-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl, serviceRoleKey, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || t('devices.errorCreateFailed'));
      }
      setCreated({ deviceName: deviceName.trim(), email, password });
      setDeviceName('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('devices.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>
          {t('devices.subtitle')}
        </p>
      </div>

      {missingServiceRole && (
        <div style={{
          background: 'rgba(241, 196, 15, 0.08)',
          border: '1px solid rgba(241, 196, 15, 0.3)',
          color: '#b8860b',
          padding: '14px 18px',
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          fontSize: '0.92rem',
        }}>
          <Icon icon="lucide:alert-triangle" style={{ fontSize: '1.2rem', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>{t('devices.reconnectTitle')}</strong> {t('devices.reconnectDesc')}
          </div>
        </div>
      )}

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '32px', alignItems: 'flex-start' }}>

        {/* CREATE DEVICE FORM */}
        <form onSubmit={handleSubmit} style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
            <Icon icon="lucide:tablet-smartphone" style={{ color: 'var(--brand-color)' }} />
            {t('devices.formTitle')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('devices.fieldName')}</label>
              <input
                type="text"
                placeholder={t('devices.fieldNamePlaceholder')}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }}
                disabled={submitting}
                required
              />
              <small style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', minHeight: '1.2em' }}>
                {previewEmail ? (
                  <>
                    <Icon icon="lucide:at-sign" style={{ fontSize: '0.85rem' }} />
                    <span>{t('devices.previewPrefix')} <strong style={{ color: 'var(--text-main)' }}>{previewEmail}</strong></span>
                  </>
                ) : (
                  <span>{t('devices.previewHint')}</span>
                )}
              </small>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('devices.fieldPassword')}</label>
              <div style={{ position: 'relative' }}>
                <Icon icon="lucide:key-round" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('devices.fieldPasswordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '14px 44px 14px 42px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', boxSizing: 'border-box' }}
                  disabled={submitting}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', display: 'flex' }}
                  aria-label={showPassword ? t('devices.hidePassword') : t('devices.showPassword')}
                >
                  <Icon icon={showPassword ? 'lucide:eye-off' : 'lucide:eye'} />
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(231, 76, 60, 0.08)', border: '1px solid rgba(231, 76, 60, 0.25)', color: '#c0392b', padding: '12px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem' }}>
                <Icon icon="lucide:alert-circle" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || missingServiceRole}
              style={{ padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '16px', cursor: submitting || missingServiceRole ? 'not-allowed' : 'pointer', fontWeight: '900', fontSize: '1.1rem', marginTop: '8px', boxShadow: '0 8px 20px rgba(52, 152, 219, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', opacity: submitting || missingServiceRole ? 0.6 : 1 }}
            >
              <Icon icon={submitting ? 'lucide:loader-2' : 'lucide:plus'} style={{ animation: submitting ? 'spin 1s linear infinite' : 'none' }} />
              {submitting ? t('devices.submitting') : t('devices.submit')}
            </button>
          </div>
        </form>

        {/* INFO / INSTRUCTIONS */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
            <Icon icon="lucide:info" style={{ color: 'var(--brand-color)' }} />
            {t('devices.howTitle')}
          </h3>
          <ol style={{ paddingLeft: '20px', margin: 0, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '10px', lineHeight: 1.5 }}>
            <li dangerouslySetInnerHTML={{ __html: t('devices.howStep1') }} />
            <li>
              {t('devices.howStep2Prefix')} <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: '6px' }}>cajafrontal@{DEVICE_EMAIL_DOMAIN}</code>.
            </li>
            <li dangerouslySetInnerHTML={{ __html: t('devices.howStep3') }} />
            <li>{t('devices.howStep4')}</li>
          </ol>
          <p style={{ marginTop: '20px', marginBottom: 0, color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <Icon icon="lucide:shield-check" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{t('devices.securityNote')}</span>
          </p>
        </div>
      </div>

      {/* SUCCESS MODAL */}
      {created && (
        <div
          onClick={() => setCreated(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--admin-card-radius, 20px)',
              padding: '32px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 30px 80px rgba(0,0,0,0.3)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(39, 174, 96, 0.12)', color: '#27ae60', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                <Icon icon="lucide:check-circle-2" />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: 'var(--text-main)' }}>{t('devices.successTitle')}</h2>
                <p style={{ margin: '2px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {t('devices.successSubtitle')}
                </p>
              </div>
            </div>

            {created.deviceName && (
              <div style={{ background: 'var(--bg-main)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>{t('devices.fieldDevice')}</div>
                <div style={{ marginTop: '4px', fontWeight: 800, color: 'var(--text-main)', fontSize: '1.05rem' }}>{created.deviceName}</div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <CredentialRow
                label={t('devices.fieldEmail')}
                value={created.email}
                icon="lucide:at-sign"
                copied={copied === 'email'}
                onCopy={() => copyToClipboard(created.email, 'email')}
                copyLabel={t('devices.copy')}
                copiedLabel={t('devices.copied')}
                ariaLabel={t('devices.copyAria').replace('{label}', t('devices.fieldEmail'))}
              />
              <CredentialRow
                label={t('devices.fieldPassword')}
                value={created.password}
                icon="lucide:key-round"
                mono
                copied={copied === 'password'}
                onCopy={() => copyToClipboard(created.password, 'password')}
                copyLabel={t('devices.copy')}
                copiedLabel={t('devices.copied')}
                ariaLabel={t('devices.copyAria').replace('{label}', t('devices.fieldPassword'))}
              />
            </div>

            <div style={{ background: 'rgba(241, 196, 15, 0.08)', border: '1px solid rgba(241, 196, 15, 0.25)', borderRadius: '12px', padding: '12px 14px', color: '#b8860b', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Icon icon="lucide:alert-triangle" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{t('devices.warnSavePassword')}</span>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={() => copyToClipboard(`${created.email}\n${created.password}`, 'both')}
                style={{ padding: '12px 18px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Icon icon={copied === 'both' ? 'lucide:check' : 'lucide:copy'} />
                {copied === 'both' ? t('devices.copyAllDone') : t('devices.copyAll')}
              </button>
              <button
                onClick={() => setCreated(null)}
                style={{ padding: '12px 22px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Icon icon="lucide:check" />
                {t('devices.done')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CredentialRow({ label, value, icon, mono, copied, onCopy, copyLabel, copiedLabel, ariaLabel }) {
  return (
    <div style={{ background: 'var(--bg-main)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-surface)', color: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon icon={icon} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>{label}</div>
        <div style={{ marginTop: '2px', fontWeight: 800, color: 'var(--text-main)', fontSize: '1rem', fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '8px 10px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}
        aria-label={ariaLabel}
      >
        <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} />
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}

export default DevicesTab;
