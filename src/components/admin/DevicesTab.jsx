import { Icon } from '@iconify/react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

const DEVICE_EMAIL_DOMAIN = 'device.tinypos.com';

// Session-scoped keys for the burn-after-reading OAuth round-trip.
// `pat` holds the short-lived Supabase Management API token; `pending` holds
// the form values the user typed before being sent to Supabase to authorize.
// Both are cleared as soon as the device has been provisioned (or on failure).
const SS_PAT = 'tinypos_devices_pat';
const SS_PENDING = 'tinypos_pending_device';
const SS_OAUTH_FLAG = 'tinypos_devices_oauth_pending';

// Scope: only what's needed to read the project's api keys. Compare with the
// install flow which additionally needs database read/write.
const DEVICES_OAUTH_SCOPES = 'api_keys_read';

function slugifyDeviceName(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 32);
}

function projectRefFromUrl(url) {
  // Supabase project URLs are `https://<ref>.supabase.co`.
  try {
    const host = new URL(url).hostname;
    return host.split('.')[0] || null;
  } catch {
    return null;
  }
}

function DevicesTab() {
  const { t } = useTranslation();
  const [deviceName, setDeviceName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState(''); // 'authorizing' | 'provisioning' | ''
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(null);

  const slug = useMemo(() => slugifyDeviceName(deviceName), [deviceName]);
  const previewEmail = slug ? `${slug}@${DEVICE_EMAIL_DOMAIN}` : '';

  const supabaseUrl = typeof window !== 'undefined' ? localStorage.getItem('tinypos_supabase_url') : null;

  // Guards against running the post-OAuth resume more than once if React
  // re-runs effects (StrictMode dev double-invoke, fast refresh, etc.).
  const resumedRef = useRef(false);

  // ---- Core: trade PAT → service_role → user, then burn -------------------
  const provisionDevice = async (pat, pending) => {
    setError('');
    setSubmitting(true);
    setSubmitStep('provisioning');

    const cleanup = () => {
      try {
        sessionStorage.removeItem(SS_PAT);
        sessionStorage.removeItem(SS_PENDING);
      } catch { /* noop */ }
    };

    try {
      const url = pending.supabaseUrl || supabaseUrl;
      const projectRef = projectRefFromUrl(url);
      if (!projectRef) {
        throw new Error(t('devices.errorMissingProject'));
      }

      // 1. Fetch the project's API keys with the short-lived PAT.
      const keysRes = await fetch(`/api/get-keys?projectRef=${encodeURIComponent(projectRef)}`, {
        headers: { Authorization: `Bearer ${pat}` },
      });
      if (keysRes.status === 401 || keysRes.status === 403) {
        throw new Error(t('devices.errorAuthExpired'));
      }
      const keysData = await keysRes.json().catch(() => ({}));
      if (!keysRes.ok) {
        throw new Error(keysData?.message || keysData?.error || t('devices.errorFetchKeys'));
      }
      const serviceRoleObj = Array.isArray(keysData)
        ? keysData.find((k) => k.name === 'service_role')
        : null;
      if (!serviceRoleObj?.api_key) {
        throw new Error(t('devices.errorFetchKeys'));
      }

      // 2. Hand the in-memory key to the proxy. It's never written to disk.
      const addRes = await fetch('/api/add-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: url,
          serviceRoleKey: serviceRoleObj.api_key,
          email: pending.email,
          password: pending.password,
        }),
      });
      const addData = await addRes.json().catch(() => ({}));
      if (!addRes.ok || !addData.success) {
        throw new Error(addData.error || t('devices.errorCreateFailed'));
      }

      setCreated({
        deviceName: pending.deviceName,
        email: pending.email,
        password: pending.password,
      });
      setDeviceName('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      // Burn: regardless of success or failure, the elevated credential
      // and the pending payload are removed.
      cleanup();
      setSubmitting(false);
      setSubmitStep('');
    }
  };

  // ---- Post-OAuth resume ---------------------------------------------------
  // If the user just came back from Supabase OAuth, App.jsx has already moved
  // the token into sessionStorage and stripped it from the URL. Here we
  // detect the pending state, fetch the service_role, mint the device, and
  // wipe everything.
  useEffect(() => {
    if (resumedRef.current) return;
    const pat = typeof window !== 'undefined' ? sessionStorage.getItem(SS_PAT) : null;
    const pendingRaw = typeof window !== 'undefined' ? sessionStorage.getItem(SS_PENDING) : null;
    if (!pat || !pendingRaw) return;
    resumedRef.current = true;

    let pending;
    try {
      pending = JSON.parse(pendingRaw);
    } catch {
      sessionStorage.removeItem(SS_PAT);
      sessionStorage.removeItem(SS_PENDING);
      return;
    }

    // Intentional: we want provisioning to begin as soon as the tab mounts
    // post-OAuth. The cascading-render warning is acceptable here because the
    // state updates only happen once per round-trip. `provisionDevice` is a
    // stable closure on this render — running on mount is exactly what we want.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    provisionDevice(pat, pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Submit: validate, stash, redirect to Supabase OAuth ---------------
  const handleSubmit = (e) => {
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
    if (!supabaseUrl) {
      setError(t('devices.errorMissingCreds'));
      return;
    }

    const email = `${slug}@${DEVICE_EMAIL_DOMAIN}`;

    // Stash the form values so we can resume after the OAuth round-trip.
    // sessionStorage is tab-scoped and cleared on close — acceptable for a
    // short-lived hand-off. The PAT itself only lands in sessionStorage on
    // return and is wiped the moment provisioning completes.
    try {
      sessionStorage.setItem(SS_PENDING, JSON.stringify({
        deviceName: deviceName.trim(),
        email,
        password,
        supabaseUrl,
      }));
      sessionStorage.setItem(SS_OAUTH_FLAG, '1');
    } catch { /* noop */ }

    setSubmitting(true);
    setSubmitStep('authorizing');

    const clientId = import.meta.env.VITE_SUPABASE_MANAGEMENT_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/auth/callback`;
    window.location.href = `https://api.supabase.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=devices&scope=${encodeURIComponent(DEVICES_OAUTH_SCOPES)}`;
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

      {/* Burn-after-reading explainer — always shown above the form. */}
      <div style={{
        background: 'rgba(52, 152, 219, 0.06)',
        border: '1px solid rgba(52, 152, 219, 0.25)',
        color: 'var(--text-main)',
        padding: '14px 18px',
        borderRadius: '12px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        fontSize: '0.92rem',
      }}>
        <Icon icon="lucide:shield-check" style={{ fontSize: '1.2rem', flexShrink: 0, marginTop: '2px', color: '#3498db' }} />
        <div>{t('devices.authBanner')}</div>
      </div>

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
              disabled={submitting}
              style={{ padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '16px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: '900', fontSize: '1.05rem', marginTop: '8px', boxShadow: '0 8px 20px rgba(52, 152, 219, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', opacity: submitting ? 0.7 : 1 }}
            >
              <Icon
                icon={submitting ? 'lucide:loader-2' : 'lucide:shield-check'}
                style={{ animation: submitting ? 'spin 1s linear infinite' : 'none' }}
              />
              {submitting
                ? (submitStep === 'provisioning' ? t('devices.provisioning') : t('devices.authorizing'))
                : t('devices.authorize')}
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
