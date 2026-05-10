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
  if (window.location.pathname === '/calculator') {
    return <RecipeCostCalculator />;
  }

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
  const [setupMode, setSetupMode] = useState(null); // Will be 'new' or 'connect'

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
      setIsCheckingSession(false);
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
        onComplete={() => {
          setIsInstalled(true);
          window.location.reload();
        }}
        onShowGuide={() => setShowGuide(true)}
      />
    );
  }

  // --- GATE 2: THE DEVICE AUTHORIZATION SCREEN ---
  // If they have keys, but the device isn't logged into the Kiosk account, lock them out!
  if (isCheckingSession) {
    return <div style={{ height: '100dvh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: "var(--bg-main)", color: 'var(--text-main)' }}>Checking device authorization...</div>;
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