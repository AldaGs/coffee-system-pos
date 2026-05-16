import { Icon } from '@iconify/react';
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Register from './Register';
import Admin from './Admin';
import SetupScreen from './components/SetupScreen';
import LandingPage from './components/LandingPage';
import SupabaseGuide from './components/SupabaseGuide';
import RecipeCostCalculator from './components/RecipeCostCalculator';
import StreetDirectionChecker from './components/StreetDirectionChecker';
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
      // Strip the token from the visible URL so it can't leak.
      window.history.replaceState({}, document.title, window.location.pathname);
      return null;
    }

    const stashed = sessionStorage.getItem('tinypos_setup_mode');
    sessionStorage.removeItem('tinypos_setup_mode');
    return stashed === 'connect' ? 'connect' : 'new';
  });

  // --- 3. CHECK SUPABASE AUTH STATUS ---
  useEffect(() => {
    // ONLY check session if the database is actually installed and the client exists
    if (isInstalled && supabase) {
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          console.error("Auth session check error:", error.message);
          // If the token is invalid/not found, we must clear the local session 
          // so the user can re-authorize.
          if (error.message.includes('Refresh Token Not Found') || error.status === 400) {
            supabase.auth.signOut().then(() => {
              setSession(null);
              setIsCheckingSession(false);
            });
            return;
          }
        }
        setSession(session);
        setIsCheckingSession(false);
      });

      // Listen for background logouts/logins
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log("Auth State Change:", event);
        if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
          setSession(session);
        } else if (session) {
          setSession(session);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      setTimeout(() => setIsCheckingSession(false), 0);
    }
  }, [isInstalled]);

  const handleDeviceLogin = async (e) => {
    e.preventDefault();
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

  if (window.location.pathname === '/street-checker') {
    return <StreetDirectionChecker />;
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