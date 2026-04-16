import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Register from './Register';
import Admin from './Admin';
import Barista from './Barista';

function App() {
  // Check if keys exist on initial load
  const [hasKeys] = useState(!!localStorage.getItem('TINY_POS_URL'));
  const [urlInput, setUrlInput] = useState("");
  const [keyInput, setKeyInput] = useState("");

  const handleSaveKeys = (e) => {
    e.preventDefault();
    if (!urlInput || !keyInput) return alert("Please provide both the URL and the Key.");
    
    // Save to the iPad/Browser memory
    localStorage.setItem('TINY_POS_URL', urlInput.trim());
    localStorage.setItem('TINY_POS_KEY', keyInput.trim());
    
    // Force a hard reload of the webpage so supabaseClient.js catches the new keys
    window.location.reload(); 
  };

  // --- THE API SETUP SCREEN (Only shows if no keys are found) ---
  if (!hasKeys) {
    return (
      <div style={{ display: 'flex', height: '100vh', backgroundColor: '#2c3e50', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '12px', width: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
          <h2 style={{ marginTop: 0, color: '#2c3e50' }}>TinyPOS Initial Setup</h2>
          <p style={{ color: '#666', marginBottom: '24px' }}>Please connect this device to a Supabase project.</p>
          
          <form onSubmit={handleSaveKeys} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold' }}>Project URL</label>
              <input 
                type="text" 
                placeholder="https://xxxxxx.supabase.co" 
                value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }} 
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold' }}>Anon / Public Key</label>
              <input 
                type="password" 
                placeholder="eyJhbGciOiJIUzI1NiIs..." 
                value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
                style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }} 
              />
            </div>
            <button type="submit" style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '16px' }}>
              Connect Database
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- THE MAIN APP (Only shows if keys exist) ---
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Register />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/barista" element={<Barista />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;