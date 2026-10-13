import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';
import * as alerts from '../../services/orderAlerts';

// Shop-wide integrations shown in General Settings (cloud mode only): Clip is
// used by the Register's payment links and online checkout alike; alerts cover
// online orders and CFDI requests. Both save on their own buttons.

// Per-business Clip credentials. Write-only: the secret never comes back to the
// browser; clip_status() only says whether one is stored and whether it's on.
// Saves on its own button (not the page-level Save) via set_clip_credentials().
export function ClipCard({ input, showAlert }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = () => supabase.rpc('clip_status').then(({ data }) => { if (data) { setStatus(data); setEnabled(!!data.enabled); } });
  useEffect(() => { load(); }, []);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('set_clip_credentials', { p_key: key, p_secret: secret, p_enabled: enabled });
    setSaving(false);
    if (error) return showAlert(t('common.error'), error.message);
    setKey(''); setSecret(''); load();
    showAlert(t('common.success'), t('oo.clipSaved'));
  };
  return (
    <Card icon="lucide:credit-card" title={t('oo.clip')}>
      <small style={{ color: 'var(--text-muted)' }}>{t('oo.clipHint')}</small>
      {status?.configured && <strong style={{ color: 'var(--brand-color)' }}>{t('oo.clipConfigured')} ✓</strong>}
      <input style={input} autoComplete="off" placeholder={t('oo.clipKey')} value={key} onChange={e => setKey(e.target.value)} />
      <input style={input} type="password" autoComplete="new-password" placeholder={t('oo.clipSecret')} value={secret} onChange={e => setSecret(e.target.value)} />
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        <span>{t('oo.clipEnabled')}</span>
      </label>
      <button type="button" onClick={save} disabled={saving} style={{ ...input, cursor: 'pointer', fontWeight: 800, alignSelf: 'flex-start' }}>{t('common.save')}</button>
    </Card>
  );
}

// New-order alerts that work with no TinyPOS open: Telegram (shop's own bot)
// and Web Push on the devices that opt in. Saves on its own buttons, like Clip.
export function AlertsCard({ input, showAlert }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [pushHere, setPushHere] = useState(false);
  const [busy, setBusy] = useState(null);
  const load = () => alerts.loadAlertStatus().then(setStatus).catch(() => {});
  useEffect(() => { load(); alerts.isPushOnHere().then(setPushHere); }, []);
  const run = async (name, fn) => {
    setBusy(name);
    try { await fn(); } catch (e) { showAlert(t('common.error'), t(`alerts.err_${e.message}`) !== `alerts.err_${e.message}` ? t(`alerts.err_${e.message}`) : e.message); }
    setBusy(null); load();
  };
  const save = (enabled, extra = {}) => alerts.saveAlertSettings({ enabled, ...extra });
  const btn = { ...input, cursor: 'pointer', fontWeight: 800, alignSelf: 'flex-start' };
  if (!status) return null;
  return (
    <Card icon="lucide:bell-ring" title={t('alerts.title')}>
      <small style={{ color: 'var(--text-muted)' }}>{t('alerts.hint')}</small>
      {!status.pg_net && <small style={{ color: '#e74c3c' }}>{t('alerts.noPgNet')}</small>}
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!status.enabled} disabled={!!busy} onChange={e => run('toggle', () => save(e.target.checked))} />
        <span>{t('alerts.enabled')}</span>
      </label>

      <strong style={{ marginTop: 8 }}><Icon icon="logos:telegram" /> Telegram</strong>
      <small style={{ color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>{t('alerts.telegramSteps')}</small>
      {status.telegram && <strong style={{ color: 'var(--brand-color)' }}>{t('alerts.telegramLinked').replace('{n}', status.chats)}</strong>}
      <input style={input} type="password" autoComplete="new-password" placeholder={t('alerts.botToken')} value={token} onChange={e => setToken(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {token && <button type="button" style={btn} disabled={!!busy} onClick={() => run('token', async () => { await save(true, { telegramToken: token }); setToken(''); })}>{t('common.save')}</button>}
        {status.telegram && <button type="button" style={btn} disabled={!!busy} onClick={() => run('detect', async () => {
          const r = await alerts.detectTelegramChats();
          showAlert(t('common.success'), t('alerts.detected').replace('{n}', r.chats).replace('{bot}', r.bot ? '@' + r.bot : ''));
        })}>{busy === 'detect' ? '…' : t('alerts.detect')}</button>}
        {status.chats > 0 && <button type="button" style={btn} disabled={!!busy} onClick={() => run('clear', () => save(status.enabled, { clearChats: true }))}>{t('alerts.unlink')}</button>}
      </div>

      <strong style={{ marginTop: 8 }}><Icon icon="lucide:smartphone" /> {t('alerts.push')}</strong>
      <small style={{ color: 'var(--text-muted)' }}>{t('alerts.pushHint').replace('{n}', status.devices)}</small>
      {!alerts.pushSupported()
        ? <small style={{ color: 'var(--text-muted)' }}>{t('alerts.pushUnsupported')}</small>
        : <button type="button" style={btn} disabled={!!busy} onClick={() => run('push', async () => {
            if (pushHere) { await alerts.disablePushHere(); setPushHere(false); }
            else { await alerts.enablePushHere(status); setPushHere(true); if (!status.enabled) await save(true); }
          })}>{pushHere ? t('alerts.pushOff') : t('alerts.pushOn')}</button>}

      {(status.chats > 0 || status.devices > 0) && (
        <button type="button" style={btn} disabled={!!busy || !status.enabled} onClick={() => run('test', async () => {
          const r = await alerts.sendTestAlert();
          showAlert(t('common.success'), t('alerts.testSent').replace('{t}', r.telegram).replace('{p}', r.push));
        })}>{busy === 'test' ? '…' : t('alerts.test')}</button>
      )}
    </Card>
  );
}

// Same card look as General Settings.
export function Card({ icon, title, children }) {
  return (
    <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, breakInside: 'avoid', marginBottom: 32 }}>
      <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon icon={icon} style={{ color: 'var(--brand-color)' }} />{title}
      </h3>
      {children}
    </div>
  );
}
