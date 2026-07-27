import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { supabase } from '../supabaseClient';

// --- Suite SSO hub (tinypos is the login owner for the whole suite) ----------
//
// A consumer app (tinykds / tinybooks / tinylogistics) with no local session
// sends the user here:  https://tinypos.app/authorize?return=<its-url>
//
// If tinypos already has a Supabase session on THIS device we hand it straight
// back; otherwise we show a login form and hand off on success. We hand back
// BOTH the session tokens AND the Supabase connection (project url + anon key)
// so the consumer inherits everything from tinypos and never needs its own
// setup/login — tinypos is the single source of truth. Everything travels in
// the URL *fragment* (never the query string) so it is never sent to a server
// or written to server logs, and the consumer strips it immediately
// (see hubAuth.js). The anon key is a publishable client key, safe to pass.
//
// SECURITY: the `return` origin MUST be on the allowlist below. Without this
// check the endpoint would be an open redirect that leaks a live session to
// any attacker-controlled URL. Add real suite origins via VITE_SUITE_ORIGINS
// (comma-separated) at build time; localhost is allowed for dev.
const ALLOWED_RETURN_ORIGINS = (
  import.meta.env.VITE_SUITE_ORIGINS ||
  'https://tinylogistics.online,https://tinybook.online'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Normalize an origin to protocol + apex host (strip a leading `www.`) so that
// both apex and www. variants of an allowed domain match a single allowlist
// entry — the sites are served from www., but entries are written apex-only.
function originKey(raw) {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.hostname.replace(/^www\./, '')}`;
  } catch {
    return null;
  }
}

const ALLOWED_KEYS = ALLOWED_RETURN_ORIGINS.map(originKey).filter(Boolean);

// The hub's own Supabase connection — the same values the tinypos client reads
// (SetupScreen writes them to localStorage; env is the fallback). Handed to
// consumers so they talk to the exact project tinypos is on.
function hubConnection() {
  const url = localStorage.getItem('tinypos_supabase_url') || import.meta.env.VITE_SUPABASE_URL;
  const anonKey = localStorage.getItem('tinypos_supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

function safeReturnUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !isLocalhost) return null;
    if (!isLocalhost && !ALLOWED_KEYS.includes(originKey(u.origin))) return null;
    return u;
  } catch {
    return null;
  }
}

function handOff(returnUrl, session) {
  // Carry the full standard implicit-flow field set so the consumer's built-in
  // supabase `detectSessionInUrl` can adopt this natively too (belt-and-braces
  // with hubAuth.js:consumeHubCallback). No `type` field → not treated as an
  // invite/recovery link by apps that special-case those (e.g. tinylogistics).
  const conn = hubConnection();
  const frag = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: String(session.expires_in ?? 3600),
    expires_at: String(session.expires_at ?? ''),
    token_type: session.token_type || 'bearer',
    // Connection pair so the consumer inherits tinypos's project (hub wins,
    // overwriting any stale local connection — keeps session + project matched).
    ...(conn ? { supabase_url: conn.url, supabase_anon_key: conn.anonKey } : {}),
  });
  // replace() so the hub page isn't left in the consumer's back-history.
  window.location.replace(`${returnUrl.origin}${returnUrl.pathname}#${frag.toString()}`);
}

export default function AuthorizeHub() {
  // checking → looking for an existing session; login → show form;
  // redirecting → handing off; denied → bad/missing return target.
  const [status, setStatus] = useState('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const returnUrl = safeReturnUrl(
    new URLSearchParams(window.location.search).get('return')
  );

  useEffect(() => {
    if (!returnUrl) {
      setStatus('denied');
      return;
    }
    if (!supabase) {
      // tinypos isn't set up in THIS browser. It's the source of truth for
      // modifying the DB, but a device without tinypos should still be able to
      // connect the app directly. Bounce back with a flag so the consumer falls
      // back to its own setup/login. (returnUrl is already allowlist-checked, so
      // this is not an open redirect.)
      setStatus('redirecting');
      window.location.replace(`${returnUrl.origin}${returnUrl.pathname}#hub_unavailable=1`);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStatus('redirecting');
        handOff(returnUrl, data.session);
      } else {
        setStatus('login');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) {
      setError(err.message || 'No se pudo iniciar sesión');
      return;
    }
    setStatus('redirecting');
    handOff(returnUrl, data.session);
  };

  const shell = (children) => (
    <div style={{ display: 'flex', height: '100dvh', backgroundColor: 'var(--bg-app)', justifyContent: 'center', alignItems: 'center', fontFamily: 'var(--font-main, system-ui)', padding: 20 }}>
      <div className="fade-in" style={{ background: 'var(--bg-surface)', padding: 40, borderRadius: 24, width: '100%', maxWidth: 400, boxShadow: '0 20px 50px rgba(0,0,0,0.1)', border: '1px solid var(--border)' }}>
        {children}
      </div>
    </div>
  );

  if (status === 'denied') {
    return shell(
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🚫</div>
        <h2 style={{ margin: '0 0 8px', color: 'var(--text-main)', fontSize: '1.4rem', fontWeight: 800 }}>Solicitud no válida</h2>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>
          El destino de acceso no está autorizado.
        </p>
      </div>
    );
  }

  if (status === 'checking' || status === 'redirecting') {
    return shell(
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" />
        <p style={{ color: 'var(--text-muted)', marginTop: 16, fontSize: '0.95rem' }}>
          {status === 'redirecting' ? 'Redirigiendo…' : 'Comprobando sesión…'}
        </p>
      </div>
    );
  }

  // status === 'login'
  return shell(
    <>
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <div style={{ width: 80, height: 80, background: 'rgba(52,152,219,0.1)', color: 'var(--brand-color)', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 15px' }}>
          <Icon icon="lucide:log-in" />
        </div>
        <h2 style={{ margin: '0 0 8px', color: 'var(--text-main)', fontSize: '1.8rem', fontWeight: 800 }}>Iniciar sesión</h2>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>
          Accede una vez para toda la suite.
        </p>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>Correo</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
        </div>
        <button type="submit" disabled={busy} style={{ padding: 18, background: '#f28b05', color: 'white', border: 'none', borderRadius: 12, cursor: busy ? 'wait' : 'pointer', fontWeight: 'bold', marginTop: 10, fontSize: '1.1rem', opacity: busy ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Icon icon="lucide:shield-check" />
          <span>{busy ? 'Autenticando…' : 'Entrar'}</span>
        </button>
        {error && (
          <div style={{ background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)', color: '#c0392b', padding: '10px 14px', borderRadius: 12, fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon icon="lucide:alert-circle" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </>
  );
}

const inputStyle = { width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', boxSizing: 'border-box' };
