import { Icon } from '@iconify/react';
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Register from './Register';
import Admin from './Admin';
import SetupScreen from './components/SetupScreen';
import LandingPage from './components/LandingPage';
import SupabaseGuide from './components/SupabaseGuide';
import RecipeCostCalculator from './components/RecipeCostCalculator';
import { supabase } from './supabaseClient';
import UpdateNotification from './components/shared/UpdateNotification';

function App() {

  // --- 1. NEW: CHECK FOR INSTALLATION ---
  // We now check for the specific keys that SetupScreen saves.
  const [isInstalled, setIsInstalled] = useState(
    !!localStorage.getItem('tinypos_supabase_url') && !!localStorage.getItem('tinypos_supabase_anon_key')
  );

  const [showGuide, setShowGuide] = useState(false);

  // --- 2. SECURE SESSION STATE ---
  const [session, setSession] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState("");

  // Automatically jump to the Setup Screen if returning from Supabase OAuth.
  // The original mode ('new' | 'connect') was stashed in sessionStorage before
  // redirecting to Supabase, so we restore it on return and clear it afterwards.
  //
  // Devices-OAuth round-trip: the Admin "Dispositivos" tab sets a separate
  // flag (`tinypos_devices_oauth_pending`) before redirecting. When we see
  // that flag on return we route the token into sessionStorage for the
  // DevicesTab to consume — never into setup mode — and never to disk.
  const [setupMode, setSetupMode] = useState(() => {
    // One-time scrubbing for users upgrading from the prior version where
    // the service_role key was cached on disk. We're moving to a strict
    // burn-after-reading model, so any leftover key is wiped.
    try { localStorage.removeItem('tinypos_supabase_service_role'); } catch { /* noop */ }

    const params = new URLSearchParams(window.location.search);
    const token = params.get('setup_token');
    if (!token) return null;

    const devicesFlow = sessionStorage.getItem('tinypos_devices_oauth_pending') === '1';
    if (devicesFlow) {
      try {
        sessionStorage.setItem('tinypos_devices_pat', token);
        sessionStorage.removeItem('tinypos_devices_oauth_pending');
      } catch { /* noop */ }
      // Strip the token from the URL and route the user back to the Devices
      // tab so the post-OAuth resume effect there fires immediately and the
      // success modal appears without a manual click. BrowserRouter reads
      // window.location on its first paint, so replaceState is enough — no
      // hard reload needed.
      window.history.replaceState({}, document.title, '/admin?tab=devices');
      return null;
    }

    const schemaFlow = sessionStorage.getItem('tinypos_schema_oauth_pending') === '1';
    if (schemaFlow) {
      try {
        sessionStorage.setItem('tinypos_schema_pat', token);
        sessionStorage.removeItem('tinypos_schema_oauth_pending');
      } catch { /* noop */ }
      // Land on General Settings, with a hint to kick off the install POST.
      window.history.replaceState({}, document.title, '/admin?tab=settings&action=update-schema');
      return null;
    }

    const stashed = sessionStorage.getItem('tinypos_setup_mode');
    sessionStorage.removeItem('tinypos_setup_mode');
    return stashed === 'connect' ? 'connect' : 'new';
  });

  // --- 3. CHECK SUPABASE AUTH STATUS ---
  //
  // After any successful sign-in we enforce the unified app_users allowlist:
  //   1. Try to claim a pending row (auth_user_id IS NULL) matching the email
  //      — RLS lets the user UPDATE only that row, only to set their auth.uid().
  //   2. Verify a non-disabled row now exists for this auth.uid(). If not, sign
  //      out immediately. Devices and the first human are seeded by the
  //      bootstrap_app_user trigger so they pass this check transparently.
  useEffect(() => {
    if (!isInstalled || !supabase) {
      setTimeout(() => setIsCheckingSession(false), 0);
      return;
    }

    const verifyAllowlist = async (sess) => {
      if (!sess?.user?.email) return false;
      const emailLower = sess.user.email.toLowerCase();
      // Best-effort claim of a pending row. If there's nothing to claim,
      // either this user is already claimed or they aren't on the allowlist
      // — the SELECT below is the source of truth.
      await supabase
        .from('app_users')
        .update({ auth_user_id: sess.user.id })
        .is('auth_user_id', null)
        .eq('email', emailLower)
        .is('disabled_at', null);

      const { data: row } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_user_id', sess.user.id)
        .is('disabled_at', null)
        .maybeSingle();
      return !!row;
    };

    supabase.auth.getSession().then(async ({ data: { session: sess }, error }) => {
      if (error) {
        console.error("Auth session check error:", error.message);
        if (error.message.includes('Refresh Token Not Found') || error.status === 400) {
          await supabase.auth.signOut();
          setSession(null);
          setIsCheckingSession(false);
          return;
        }
      }
      if (sess) {
        const ok = await verifyAllowlist(sess);
        if (!ok) {
          await supabase.auth.signOut();
          setSession(null);
          setAuthError('Esta cuenta no está autorizada. Pide al administrador que la agregue.');
          setIsCheckingSession(false);
          return;
        }
      }
      setSession(sess);
      setIsCheckingSession(false);
    });

    // Listen for background logouts/logins
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      console.log("Auth State Change:", event);
      if (event === 'SIGNED_OUT') {
        setSession(null);
        return;
      }
      if (event === 'SIGNED_IN' && sess) {
        const ok = await verifyAllowlist(sess);
        if (!ok) {
          await supabase.auth.signOut();
          setSession(null);
          setAuthError('Esta cuenta no está autorizada. Pide al administrador que la agregue.');
          return;
        }
        setAuthError("");
      }
      if (sess) setSession(sess);
    });

    return () => subscription.unsubscribe();
  }, [isInstalled]);

  const handleDeviceLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    setIsLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      window.alert("Device Authorization Failed: " + error.message);
    }

    setIsLoggingIn(false);
  };

  // ==========================================
  // --- RENDER PIPELINE ---
  // ==========================================

  if (window.location.pathname === '/calculator') {
    return <RecipeCostCalculator />;
  }

  // --- NEW GATE: THE GUIDE ---
  if (showGuide) {
    return <SupabaseGuide onBack={() => setShowGuide(false)} />;
  }

  // --- GATE 0: THE LANDING PAGE ---
  if (!isInstalled && !setupMode) {
    return <LandingPage 
      onSelectMode={(mode) => setSetupMode(mode)} 
      onShowGuide={() => setShowGuide(true)}
    />;
  }

  // --- GATE 1: THE INSTALLATION SCREEN ---
  if (!isInstalled && setupMode) {
    return (
      <SetupScreen
        initialMode={setupMode}
        onBack={() => setSetupMode(null)}
        onComplete={(newUrl, newAnonKey) => {
          // 1. Save the keys EXACTLY where App.jsx looks for them
          localStorage.setItem('tinypos_supabase_url', newUrl);
          localStorage.setItem('tinypos_supabase_anon_key', newAnonKey);
          
          // 2. Update state
          setIsInstalled(true);
          
          // 3. Hard redirect to the root to clear the URL and reboot the main client
          window.location.href = '/';
        }}
        onShowGuide={() => setShowGuide(true)}
      />
    );
  }

  // --- GATE 2: THE DEVICE AUTHORIZATION SCREEN ---
  // If they have keys, but the device isn't logged into the Kiosk account, lock them out!
  if (isCheckingSession) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <h2 style={{ marginTop: '20px', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: '600' }}>
          Checking device authorization...
        </h2>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', height: '100dvh', backgroundColor: "var(--bg-app)", justifyContent: 'center', alignItems: 'center', fontFamily: 'var(--font-main, system-ui)', padding: '20px' }}>
        <div className="fade-in" style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', border: '1px solid var(--border)' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ width: '80px', height: '80px', background: 'rgba(52, 152, 219, 0.1)', color: 'var(--brand-color)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 15px' }}>
              <Icon icon="lucide:lock" />
            </div>
            <h2 style={{ margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '1.8rem', fontWeight: '800' }}>Dispositivo Bloqueado</h2>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>Autoriza este dispositivo para conectarlo a la red de la tienda.</p>
          </div>

          <form onSubmit={handleDeviceLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>Correo del Hardware</label>
              <div style={{ position: 'relative' }}>
                <Icon icon="lucide:mail" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="email" placeholder="register@tinycoffee.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '12px 12px 12px 38px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>Contraseña del Hardware</label>
              <div style={{ position: 'relative' }}>
                <Icon icon="lucide:key" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '12px 12px 12px 38px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', boxSizing: 'border-box' }} />
              </div>
            </div>
            <button type="submit" disabled={isLoggingIn} style={{ padding: '18px', background: '#f28b05', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px', fontSize: '1.1rem', opacity: isLoggingIn ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 4px 15px rgba(52, 152, 219, 0.3)' }}>
              {isLoggingIn ? (
                <>
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <Icon icon="lucide:shield-check" />
                  <span>Autorizar Dispositivo</span>
                </>
              )}
            </button>

            {authError && (
              <div style={{ background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)', color: '#c0392b', padding: '10px 14px', borderRadius: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon icon="lucide:alert-circle" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{authError}</span>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  // --- GATE 3: THE MAIN APP ---
  // Only shows if keys exist AND device is authenticated.
  return (
    <BrowserRouter>
    <UpdateNotification />
      <Routes>
        <Route path="/" element={<Register />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;