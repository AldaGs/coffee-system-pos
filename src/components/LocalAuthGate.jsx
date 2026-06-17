import { Icon } from '@iconify/react';
import { useState, useEffect } from 'react';
import {
  hasLocalCredential,
  getLocalEmail,
  createLocalCredential,
  verifyLocalCredential,
  setLocalPin,
} from '../utils/localAuth';
import { useMenuStore } from '../store/useMenuStore';

// Local ('guest') mode replacement for App.jsx's Supabase device-login gate.
// Self-detects whether this device already has an owner credential:
//   - none yet  → "create" intent: set email + password (the device lock).
//   - exists    → "unlock" intent: verify to enter the app.
// On success it calls onAuthed(), which lets App render the main app.
export default function LocalAuthGate({ onAuthed }) {
  const [intent, setIntent] = useState(null); // 'create' | 'unlock'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const exists = await hasLocalCredential();
      if (!alive) return;
      if (exists) {
        const savedEmail = await getLocalEmail();
        if (alive && savedEmail) setEmail(savedEmail);
      }
      if (alive) setIntent(exists ? 'unlock' : 'create');
    })();
    return () => { alive = false; };
  }, []);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      setError('Ingresa un correo válido.');
      return;
    }
    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (intent === 'create' && password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (intent === 'create' && !/^\d{4}$/.test(pin)) {
      setError('El PIN de administrador debe ser de 4 dígitos.');
      return;
    }

    setBusy(true);
    try {
      if (intent === 'create') {
        await createLocalCredential(cleanEmail, password);
        // Admin PIN: id 0 is the master PIN, id 1 is the "Admin" cashier. Both
        // are set to the chosen PIN; the owner can add cashiers later in Admin.
        await setLocalPin(0, pin);
        await setLocalPin(1, pin);
        // Seed the Admin cashier so the lock screen + admin gate work (replaces
        // the old hardcoded default cashiers). PINs are NOT stored in the menu
        // cache — they live in app_local.
        const store = useMenuStore.getState();
        const existing = store.menuData || {};
        store.setMenuData({
          ...existing,
          cashiers: existing.cashiers?.length
            ? existing.cashiers
            : [{ id: 1, name: 'Admin', role: 'admin', isAdmin: true }],
        });
        onAuthed();
      } else {
        const ok = await verifyLocalCredential(cleanEmail, password);
        if (!ok) {
          setError('Correo o contraseña incorrectos.');
          setBusy(false);
          return;
        }
        onAuthed();
      }
    } catch (err) {
      console.error('Local auth failed:', err);
      setError('Algo salió mal. Intenta de nuevo.');
      setBusy(false);
    }
  };

  // Brief skeleton while we detect create vs unlock — avoids a flash of the
  // wrong title/fields.
  if (intent === null) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
      </div>
    );
  }

  const isCreate = intent === 'create';

  return (
    <div style={{ display: 'flex', height: '100dvh', backgroundColor: 'var(--bg-app)', justifyContent: 'center', alignItems: 'center', fontFamily: 'var(--font-main, system-ui)', padding: '20px' }}>
      <div className="fade-in" style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: '24px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', border: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '80px', height: '80px', background: 'rgba(9, 155, 70, 0.1)', color: '#099b46', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 15px' }}>
            <Icon icon={isCreate ? 'lucide:store' : 'lucide:lock'} />
          </div>
          <h2 style={{ margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '1.6rem', fontWeight: '800' }}>
            {isCreate ? 'Crea tu tienda local' : 'Desbloquea tu tienda'}
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>
            {isCreate
              ? 'Tus datos se guardan solo en este dispositivo. Sin nube, sin cuentas.'
              : 'Ingresa tu correo y contraseña para continuar.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>Correo</label>
            <div style={{ position: 'relative' }}>
              <Icon icon="lucide:mail" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="email" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy || (!isCreate && !!email)} style={{ width: '100%', padding: '12px 12px 12px 38px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <Icon icon="lucide:key" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} disabled={busy} style={{ width: '100%', padding: '12px 44px 12px 38px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', boxSizing: 'border-box' }} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', display: 'flex' }} aria-label={showPassword ? 'Ocultar' : 'Mostrar'}>
                <Icon icon={showPassword ? 'lucide:eye-off' : 'lucide:eye'} />
              </button>
            </div>
          </div>

          {isCreate && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>Confirmar contraseña</label>
              <div style={{ position: 'relative' }}>
                <Icon icon="lucide:key" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} disabled={busy} style={{ width: '100%', padding: '12px 12px 12px 38px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', boxSizing: 'border-box' }} />
              </div>
            </div>
          )}

          {isCreate && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>PIN de administrador (4 dígitos)</label>
              <div style={{ position: 'relative' }}>
                <Icon icon="lucide:shield" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  required
                  disabled={busy}
                  style={{ width: '100%', padding: '12px 12px 12px 38px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.2rem', letterSpacing: '0.4em', boxSizing: 'border-box' }}
                />
              </div>
              <small style={{ color: 'var(--text-muted)' }}>Lo usarás para desbloquear la caja y el panel de administración.</small>
            </div>
          )}

          {isCreate && (
            <div style={{ background: 'rgba(241, 196, 15, 0.08)', border: '1px solid rgba(241, 196, 15, 0.25)', color: '#b8860b', padding: '10px 14px', borderRadius: '12px', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Icon icon="lucide:alert-triangle" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>Guarda bien tu contraseña y PIN: al ser solo locales, no se pueden recuperar si los olvidas o borras los datos del navegador.</span>
            </div>
          )}

          <button type="submit" disabled={busy} style={{ padding: '16px', background: '#099b46', color: 'white', border: 'none', borderRadius: '12px', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 'bold', marginTop: '6px', fontSize: '1.05rem', opacity: busy ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <Icon icon={busy ? 'lucide:loader-2' : (isCreate ? 'lucide:rocket' : 'lucide:unlock')} style={{ animation: busy ? 'spin 1s linear infinite' : 'none' }} />
            <span>{busy ? 'Un momento…' : (isCreate ? 'Empezar' : 'Entrar')}</span>
          </button>

          {error && (
            <div style={{ background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)', color: '#c0392b', padding: '10px 14px', borderRadius: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Icon icon="lucide:alert-circle" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
