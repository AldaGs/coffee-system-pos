import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Register from './Register';
import Admin from './Admin';
import SetupScreen from './components/SetupScreen'; // Make sure this path matches where you saved it!

import { supabase } from './supabaseClient'; 

function App() {
  // --- 1. NEW: CHECK FOR INSTALLATION ---
  // We now check for the specific keys that SetupScreen saves.
  const [isInstalled, setIsInstalled] = useState(
    !!localStorage.getItem('tinypos_supabase_url') && !!localStorage.getItem('tinypos_supabase_anon_key')
  );

  // --- 2. SECURE SESSION STATE ---
  const [session, setSession] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // --- 3. CHECK SUPABASE AUTH STATUS ---
  useEffect(() => {
    // ONLY check session if the database is actually installed and the client exists
    if (isInstalled && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setIsCheckingSession(false);
      });

      // Listen for background logouts/logins
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
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
      alert("Device Authorization Failed: " + error.message);
    }
    setIsLoggingIn(false);
  };

  // ==========================================
  // --- RENDER PIPELINE ---
  // ==========================================

  // --- GATE 1: THE INSTALLATION SCREEN ---
  // If no keys are found, trap them in the Database Setup flow.
  if (!isInstalled) {
    return (
      <SetupScreen onComplete={() => {
        setIsInstalled(true);
        // Force a hard reload so the Supabase client initializes with the new keys!
        window.location.reload(); 
      }} />
    );
  }

  // --- GATE 2: THE DEVICE AUTHORIZATION SCREEN ---
  // If they have keys, but the device isn't logged into the Kiosk account, lock them out!
  if (isCheckingSession) {
    return <div style={{ height: '100dvh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#2c3e50', color: 'white' }}>Checking device authorization...</div>;
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', height: '100dvh', backgroundColor: '#2c3e50', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
          <div style={{ textAlign: 'center', fontSize: '3rem', marginBottom: '10px' }}>🔒</div>
          <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>Device Locked</h2>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '24px' }}>Authorize this device to connect to the store network.</p>
          
          <form onSubmit={handleDeviceLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: '#333' }}>Hardware Email</label>
              <input type="email" placeholder="register@tinycoffee.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: '#333' }}>Hardware Password</label>
              <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }} />
            </div>
            <button type="submit" disabled={isLoggingIn} style={{ padding: '16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '16px', fontSize: '1.1rem', opacity: isLoggingIn ? 0.7 : 1 }}>
              {isLoggingIn ? 'Authenticating...' : 'Authorize Device'}
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
      <Routes>
        <Route path="/" element={<Register />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;