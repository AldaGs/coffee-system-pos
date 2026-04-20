import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Register from './Register';
import Admin from './Admin';

import { supabase } from './supabaseClient'; // Make sure this is imported!

function App() {
  const [hasKeys] = useState(!!localStorage.getItem('TINY_POS_URL'));
  const [urlInput, setUrlInput] = useState("");
  const [keyInput, setKeyInput] = useState("");

  // --- NEW: SECURE SESSION STATE ---
  const [session, setSession] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // --- NEW: CHECK SUPABASE AUTH STATUS ---
  useEffect(() => {
    if (hasKeys && supabase) {
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
  }, [hasKeys]);

  const handleSaveKeys = (e) => {
    e.preventDefault();
    if (!urlInput || !keyInput) return alert("Please provide both the URL and the Key.");
    
    localStorage.setItem('TINY_POS_URL', urlInput.trim());
    localStorage.setItem('TINY_POS_KEY', keyInput.trim());
    window.location.reload(); 
  };

  const handleDeviceLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      alert("Device Authorization Failed: " + error.message);
    }
    setIsLoggingIn(false);
  };

  // --- 1. THE API SETUP SCREEN (Only shows if no keys are found) ---
  if (!hasKeys) {
    return (
      <div style={{ display: 'flex', height: '100dvh', backgroundColor: '#2c3e50', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '12px', width: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>TinyPOS Hardware Setup</h2>
          <form onSubmit={handleSaveKeys} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* ... Your existing URL and Key inputs stay exactly the same here ... */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold' }}>Project URL</label>
              <input type="text" placeholder="https://xxxxxx.supabase.co" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold' }}>Anon / Public Key</label>
              <input type="password" placeholder="eyJhbGciOiJIUzI1NiIs..." value={keyInput} onChange={(e) => setKeyInput(e.target.value)} style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }} />
            </div>
            <button type="submit" style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '16px' }}>
              Connect Database
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- 2. NEW: THE DEVICE AUTHORIZATION SCREEN ---
  // If they have keys, but the device isn't logged into the Kiosk account, lock them out!
  if (isCheckingSession) return <div style={{ height: '100dvh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#2c3e50', color: 'white' }}>Checking device authorization...</div>;

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

  // --- 3. THE MAIN APP (Only shows if keys exist AND device is authenticated) ---
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