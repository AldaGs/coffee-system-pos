import { Icon } from '@iconify/react';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';

const ROLE_OPTIONS = ['admin', 'manager', 'employee'];

function AllowlistSection({ showAlert, showConfirm }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('employee');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('app_users')
      .select('id, email, role, auth_user_id, provider, created_at, disabled_at')
      .neq('role', 'device')
      .order('created_at', { ascending: true });
    if (err) setError(err.message);
    else setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    const cleaned = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setError(t('allowlist.errorInvalidEmail'));
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase
      .from('app_users')
      .insert({ email: cleaned, role });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setEmail('');
    setRole('employee');
    load();
  };

  const toggleDisabled = (row) => {
    const title = row.disabled_at ? t('allowlist.confirmEnableTitle') : t('allowlist.confirmDisableTitle');
    const msg = (row.disabled_at ? t('allowlist.confirmEnableDesc') : t('allowlist.confirmDisableDesc'))
      .replace('{email}', row.email);
    showConfirm(title, msg, async () => {
      const { error: err } = await supabase
        .from('app_users')
        .update({ disabled_at: row.disabled_at ? null : new Date().toISOString() })
        .eq('id', row.id);
      if (err) showAlert(t('common.error'), err.message);
      load();
    });
  };

  const remove = (row) => {
    showConfirm(
      t('allowlist.confirmDeleteTitle'),
      t('allowlist.confirmDeleteDesc').replace('{email}', row.email),
      async () => {
        const { error: err } = await supabase.from('app_users').delete().eq('id', row.id);
        if (err) showAlert(t('common.error'), err.message);
        load();
      }
    );
  };

  const changeRole = async (row, newRole) => {
    if (newRole === row.role) return;
    const { error: err } = await supabase
      .from('app_users')
      .update({ role: newRole })
      .eq('id', row.id);
    if (err) showAlert(t('common.error'), err.message);
    load();
  };

  return (
    <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', marginTop: '32px' }}>
      <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
        <Icon icon="lucide:users" style={{ color: 'var(--brand-color)' }} />
        {t('allowlist.title')}
      </h3>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 20px', fontSize: '0.92rem' }}>
        {t('allowlist.subtitle')}
      </p>

      <form onSubmit={add} style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="email"
          placeholder={t('allowlist.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          required
          style={{ flex: '1 1 240px', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 600 }}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={submitting}
          style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 700 }}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{t(`allowlist.role.${r}`)}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={submitting}
          style={{ padding: '12px 18px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Icon
            icon={submitting ? 'lucide:loader-2' : 'lucide:plus'}
            style={{ animation: submitting ? 'spin 1s linear infinite' : 'none' }}
          />
          {t('allowlist.add')}
        </button>
      </form>

      {error && (
        <div style={{ background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)', color: '#c0392b', padding: '10px 14px', borderRadius: 12, marginBottom: 16, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon icon="lucide:alert-circle" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('allowlist.loading')}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('allowlist.empty')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 12, opacity: row.disabled_at ? 0.55 : 1 }}
            >
              <Icon
                icon={row.auth_user_id ? 'lucide:user-check' : 'lucide:user-plus'}
                style={{ color: row.auth_user_id ? '#27ae60' : 'var(--text-muted)', flexShrink: 0 }}
                title={row.auth_user_id ? t('allowlist.claimed') : t('allowlist.pending')}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.email}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {row.provider || '—'} · {new Date(row.created_at).toLocaleDateString()}
                </div>
              </div>
              <select
                value={row.role}
                onChange={(e) => changeRole(row, e.target.value)}
                disabled={!!row.disabled_at}
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem' }}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{t(`allowlist.role.${r}`)}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => toggleDisabled(row)}
                title={row.disabled_at ? t('allowlist.enable') : t('allowlist.disable')}
                style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'var(--text-main)', display: 'flex' }}
              >
                <Icon icon={row.disabled_at ? 'lucide:user-check' : 'lucide:user-x'} />
              </button>
              <button
                type="button"
                onClick={() => remove(row)}
                title={t('allowlist.delete')}
                style={{ background: 'transparent', border: '1px solid rgba(231,76,60,0.4)', color: '#c0392b', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex' }}
              >
                <Icon icon="lucide:trash-2" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AllowlistSection;
