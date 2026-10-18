// Menu version history with restore. Lists snapshots from menu_versions
// (latest first), shows each row's reason + trigger op + age, and lets the
// owner manually snapshot or restore. Restores are themselves reversible
// (the server snapshots current state before wiping).

import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { listVersions, manualSnapshot, restoreVersion, getVersion } from '../../api/menuVersions';
import { useDialog } from '../../hooks/useDialog';
import { useTranslation } from '../../hooks/useTranslation';

function relTime(iso, t) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const ago = (n) => t('menuHistory.ago').replace('{n}', n);
  if (diff < 60)        return ago(`${Math.floor(diff)}s`);
  if (diff < 3600)      return ago(`${Math.floor(diff / 60)} min`);
  if (diff < 86400)     return ago(`${Math.floor(diff / 3600)} h`);
  if (diff < 86400 * 7) return ago(`${Math.floor(diff / 86400)} d`);
  return new Date(iso).toLocaleString();
}

const REASON_COPY = {
  'auto':            { labelKey: 'menuHistory.reasonAuto',          color: '#888' },
  'manual':          { labelKey: 'menuHistory.reasonManual',        color: '#27ae60' },
  'pre-jsonb-strip': { labelKey: 'menuHistory.reasonPreMigration',  color: '#e67e22' },
  'restore-target':  { labelKey: 'menuHistory.reasonRestoreTarget', color: '#9b59b6' }
};

function MenuHistoryPanel({ onAfterRestore }) {
  const { showAlert, showConfirm } = useDialog();
  const { t } = useTranslation();
  const [versions, setVersions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const reload = async () => {
    try {
      setVersions(await listVersions(100));
    } catch (err) {
      showAlert?.('Error', t('menuHistory.loadError') + err.message);
    }
  };

  // Load once on mount; reload is also called imperatively after mutations.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const handleManual = async () => {
    setBusy(true);
    try {
      await manualSnapshot('manual-from-admin');
      await reload();
    } catch (err) {
      showAlert?.('Error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = (row) => {
    const when = new Date(row.created_at).toLocaleString();
    showConfirm?.(
      t('menuHistory.restoreTitle'),
      t('menuHistory.restoreDesc').replace('{when}', when),
      async () => {
        setBusy(true);
        try {
          await restoreVersion(row.id);
          await reload();
          showAlert?.(t('menuHistory.done'), t('menuHistory.restoreDone'));
          if (onAfterRestore) onAfterRestore();
          else setTimeout(() => window.location.reload(), 600);
        } catch (err) {
          showAlert?.('Error', err.message);
        } finally {
          setBusy(false);
        }
      }
    );
  };

  const handlePreview = async (row) => {
    try {
      const full = await getVersion(row.id);
      setPreview(full);
    } catch (err) {
      showAlert?.('Error', err.message);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>
          <Icon icon="lucide:history" style={{ color: 'var(--brand-color)' }} />
          {t('menuHistory.title')}
        </h3>
        <button
          onClick={handleManual}
          disabled={busy}
          style={{ ...btnStyle, background: 'var(--brand-color)', color: 'white' }}
          title={t('menuHistory.titleSnapshot')}
        >
          <Icon icon="lucide:bookmark-plus" />
          {t('menuHistory.btnSnapshot')}
        </button>
      </div>
      <p style={descStyle}>
        {t('menuHistory.desc')}
      </p>

      {versions.length === 0 ? (
        <p style={emptyStyle}>{t('menuHistory.empty')}</p>
      ) : (
        <ul style={listStyle}>
          {versions.map(v => {
            const meta = REASON_COPY[v.reason] || { color: '#888' };
            const label = meta.labelKey ? t(meta.labelKey) : v.reason;
            return (
              <li key={v.id} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ ...badgeStyle, background: meta.color }}>{label}</span>
                    <span style={timeStyle}>{relTime(v.created_at, t)}</span>
                  </div>
                  {v.trigger_op && (
                    <div style={triggerStyle}>{v.trigger_op}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => handlePreview(v)}
                    style={{ ...btnStyle, background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                    title={t('menuHistory.titlePreview')}
                  >
                    <Icon icon="lucide:eye" />
                  </button>
                  <button
                    onClick={() => handleRestore(v)}
                    disabled={busy}
                    style={{ ...btnStyle, background: 'transparent', color: 'var(--brand-color)', border: '1px solid var(--brand-color)' }}
                  >
                    <Icon icon="lucide:rotate-ccw" />
                    {t('menuHistory.btnRestore')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <div style={previewOverlay} onClick={() => setPreview(null)}>
          <div style={previewBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong>{t('menuHistory.version')} #{preview.id} — {new Date(preview.created_at).toLocaleString()}</strong>
              <button onClick={() => setPreview(null)} style={closeBtn}><Icon icon="lucide:x" /></button>
            </div>
            <pre style={preStyle}>{JSON.stringify(preview.snapshot, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = {
  background: 'var(--bg-surface)',
  padding: 'var(--admin-padding, 24px)',
  borderRadius: 'var(--admin-card-radius, 16px)',
  border: '1px solid var(--border)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
  marginTop: 24
};
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' };
const titleStyle = { margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.2rem', fontWeight: 800 };
const descStyle = { margin: '8px 0 16px', color: 'var(--text-muted)', fontSize: '0.9rem' };
const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' };
const rowStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  padding: 12, background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 12
};
const badgeStyle = { color: 'white', padding: '2px 10px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' };
const timeStyle = { color: 'var(--text-muted)', fontSize: '0.85rem' };
const triggerStyle = { color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'ui-monospace, monospace', marginTop: 4 };
const btnStyle = { padding: '8px 12px', borderRadius: 10, border: 'none', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' };
const emptyStyle = { color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: 16 };
const previewOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const previewBox = { background: 'var(--bg-surface)', borderRadius: 12, padding: 20, maxWidth: 720, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' };
const preStyle = { background: '#111', color: '#0f0', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: '0.7rem', whiteSpace: 'pre-wrap', flex: 1 };
const closeBtn = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem' };

export default MenuHistoryPanel;
