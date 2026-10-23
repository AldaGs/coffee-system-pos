import { Icon } from '@iconify/react';

// Before OAuth: both flows need a Supabase Management token.
export default function AuthorizeStep({ initialMode, isConnecting, onShowGuide }) {
  const startOAuth = () => {
    // App.jsx restores 'connect' vs 'new' from this after the OAuth round trip.
    try { sessionStorage.setItem('tinypos_setup_mode', initialMode); } catch { /* noop */ }
    // /api/auth/start sets the state and PKCE cookies and picks the scopes. The
    // state stops a crafted callback from installing into someone else's project.
    window.location.href = '/api/auth/start?flow=install';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <Icon icon="lucide:shield-check" style={{ color: 'var(--color-success)', fontSize: '1.3rem', marginTop: '2px', flexShrink: 0 }} />
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.5 }}>
          {isConnecting
            ? 'Conexión segura. tinypos sólo leerá las llaves del proyecto que elijas — no modificará tu base de datos.'
            : 'Conexión segura. tinypos sólo solicitará los permisos mínimos para crear las tablas necesarias.'}
        </p>
      </div>

      <button
        type="button"
        onClick={startOAuth}
        className="setup-cta-supabase"
        style={{ padding: '18px', background: 'var(--brand-color)', color: '#fff', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: 700, fontSize: '1.05rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', boxShadow: '0 10px 28px rgba(242, 139, 5, 0.4)', transition: 'box-shadow 0.2s ease' }}
      >
        <Icon icon="mdi:database-sync" width="22" />
        Conectar con Supabase
      </button>

      {onShowGuide && (
        <button type="button" onClick={onShowGuide} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.88rem', textDecoration: 'underline', padding: '4px' }}>
          ¿No tienes una cuenta de Supabase?
        </button>
      )}
    </div>
  );
}
