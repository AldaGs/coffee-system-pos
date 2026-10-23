import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { isLocalMode } from '../../../utils/appMode';
import { APP_SCHEMA_VERSION } from '../../../utils/schemaVersion';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';

// "Update Schema" goes through a Supabase OAuth round trip. App.jsx sets the
// `done` flag on return; the Management token itself stays in an HttpOnly cookie.
const SS_SCHEMA_OAUTH_FLAG = 'tinypos_schema_oauth_pending';
const SS_SCHEMA_OAUTH_DONE = 'tinypos_schema_oauth_done';

function clearMgmtToken() {
  try { fetch('/api/supabase?op=clear', { method: 'POST' }).catch(() => {}); } catch { /* noop */ }
}

function projectRefFromUrl(url) {
  try { return new URL(url).hostname.split('.')[0] || null; } catch { return null; }
}

const isResumingOAuth = () => {
  try { return sessionStorage.getItem(SS_SCHEMA_OAUTH_DONE) === '1'; } catch { return false; }
};

// dbVersion: null while loading, 'local' without a cloud, 'unknown' when the
// install predates schema_meta.
async function readSchemaVersion() {
  try {
    const { data, error } = await supabase.from('schema_meta').select('value').eq('key', 'schema_version').maybeSingle();
    if (error) {
      // 42P01: the table doesn't exist yet.
      if (error.code !== '42P01') console.warn('schema_meta read failed:', error);
      return 'unknown';
    }
    return data?.value || 'unknown';
  } catch (e) {
    console.warn('schema_meta read threw:', e);
    return 'unknown';
  }
}

export function useSchemaUpdate() {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useDialog();
  const [dbVersion, setDbVersion] = useState(() => (isLocalMode() ? 'local' : null));
  const [resuming] = useState(isResumingOAuth);
  const projectRef = projectRefFromUrl(localStorage.getItem('tinypos_supabase_url'));
  const [schemaUpdating, setSchemaUpdating] = useState(() => resuming && !!projectRef);
  const [schemaUpdateError, setSchemaUpdateError] = useState(() => (resuming && !projectRef ? t('settings.schemaUpdateMissingProject') : ''));
  const schemaBtnRef = useRef(null);
  const resumedRef = useRef(false);

  useEffect(() => {
    if (isLocalMode()) return;
    let alive = true;
    readSchemaVersion().then((v) => { if (alive) setDbVersion(v); });
    return () => { alive = false; };
  }, []);

  // Back from OAuth: /api/install reads the token from the cookie and runs the pending migrations.
  useEffect(() => {
    if (!resuming || resumedRef.current) return;
    resumedRef.current = true;
    const cleanup = () => {
      try { sessionStorage.removeItem(SS_SCHEMA_OAUTH_DONE); } catch { /* noop */ }
      clearMgmtToken();
    };
    if (!projectRef) { cleanup(); return; }
    schemaBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (async () => {
      try {
        const res = await fetch('/api/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectRef }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) throw new Error(data?.error || t('settings.schemaUpdateFailed'));
        setDbVersion(await readSchemaVersion());
        showAlert(t('common.success'), t('settings.schemaUpdateOk') +
          (data?.clipFailed?.length ? `\n\nClip: no se pudieron instalar ${data.clipFailed.join(', ')}` : ''));
      } catch (err) {
        setSchemaUpdateError(err.message);
      } finally {
        cleanup();
        setSchemaUpdating(false);
      }
    })();
  }, [resuming, projectRef, showAlert, t]);

  const startSchemaUpdate = () => {
    if (!localStorage.getItem('tinypos_supabase_url')) {
      showAlert(t('common.error'), t('settings.schemaUpdateMissingProject'));
      return;
    }
    showConfirm(t('settings.schemaUpdateConfirmTitle'), t('settings.schemaUpdateConfirmDesc'), () => {
      try { sessionStorage.setItem(SS_SCHEMA_OAUTH_FLAG, '1'); } catch { /* noop */ }
      // /api/auth/start sets the state and PKCE cookies and picks this flow's scopes.
      window.location.href = '/api/auth/start?flow=schema';
    });
  };

  return {
    dbVersion, schemaUpdating, schemaUpdateError, schemaBtnRef, startSchemaUpdate,
    isUpToDate: !!dbVersion && dbVersion !== 'unknown' && dbVersion === APP_SCHEMA_VERSION,
    isUnknown: dbVersion === 'unknown',
  };
}
