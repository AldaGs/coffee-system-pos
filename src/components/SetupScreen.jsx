import { useState } from 'react';

export default function SetupScreen({ onComplete }) {
  const [isConnectingExisting, setIsConnectingExisting] = useState(false);
  const [formData, setFormData] = useState({
    supabaseUrl: '',
    anonKey: '',
    connectionString: ''
  });
  const [loading, setLoading] = useState(false);

  // --- CUSTOM ALERT STATE ---
  const [customAlert, setCustomAlert] = useState({ show: false, message: '', type: '' });

  // If you have a global showAlert imported from a file, you can delete this function!
  const showAlert = (message, type = 'error') => {
    setCustomAlert({ show: true, message, type });
    setTimeout(() => setCustomAlert({ show: false, message: '', type: '' }), 4000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // MODE 1: Fresh Installation
      if (!isConnectingExisting) {
        const response = await fetch('/api/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionString: formData.connectionString })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        
        showAlert("TinyPOS Installed Successfully!", "success");
      } else {
        // MODE 2: Existing Device
        showAlert("Device Connected to Database!", "success");
      }

      // Save keys to memory
      localStorage.setItem('tinypos_supabase_url', formData.supabaseUrl.trim());
      localStorage.setItem('tinypos_supabase_anon_key', formData.anonKey.trim());
      
      // Delay the unlock slightly so they can actually read the success message!
      setTimeout(() => {
        onComplete(); 
      }, 1500);

    } catch (err) {
      showAlert(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100dvh', backgroundColor: 'var(--bg-app)', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui', position: 'relative' }}>
      
      {/* --- CUSTOM ALERT BANNER --- */}
      {customAlert.show && (
        <div style={{
          position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)',
          background: customAlert.type === 'success' ? '#27ae60' : '#e74c3c',
          color: 'white', padding: '16px 24px', borderRadius: '8px', fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000,
          animation: 'fadeInDown 0.3s ease-out'
        }}>
          {customAlert.message}
        </div>
      )}

      <div style={{ background: 'white', padding: '40px', borderRadius: '12px', width: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        
        {/* --- BRANDING / LOGO --- */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          {/* Change "/logo.png" to match whatever your actual image file is named in your public folder */}
          <img 
            src="/icon.svg" 
            alt="TinyPOS Logo" 
            style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '16px', marginBottom: '10px' }} 
            onError={(e) => e.target.style.display = 'none'} // Hides the broken image icon if the file isn't found
          />
          <h2 style={{ margin: '0', color: '#2c3e50' }}>
            {isConnectingExisting ? "Connect Device" : "Welcome to TinyPOS"}
          </h2>
          <p style={{ color: '#666', marginTop: '8px', marginBottom: '0' }}>
            {isConnectingExisting 
              ? "Link this hardware to your existing store." 
              : "Let's set up your secure, self-hosted database."}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: '#333' }}>Supabase Project URL</label>
            <input 
              placeholder="https://xxxxxx.supabase.co" 
              value={formData.supabaseUrl}
              onChange={e => setFormData({...formData, supabaseUrl: e.target.value})}
              required
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: '#333' }}>Supabase Anon Key</label>
            <input 
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIs..." 
              value={formData.anonKey}
              onChange={e => setFormData({...formData, anonKey: e.target.value})}
              required
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }}
            />
          </div>

          {!isConnectingExisting && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '10px 0' }} />
              <p style={{ fontSize: '0.85rem', color: '#888', lineHeight: '1.4' }}>
                *Your Transaction Pooler Connection String is used ONCE to build the database tables and is never stored.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: '#333' }}>Database Connection String</label>
                <input 
                  type="password"
                  placeholder="postgresql://postgres.xxx:password@..." 
                  value={formData.connectionString}
                  onChange={e => setFormData({...formData, connectionString: e.target.value})}
                  required={!isConnectingExisting}
                  style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }}
                />
              </div>
            </>
          )}

          <button type="submit" disabled={loading} style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '16px', opacity: loading ? 0.7 : 1, fontSize: '1.1rem', transition: '0.2s' }}>
            {loading ? "Processing..." : (isConnectingExisting ? "Connect Device" : "Initialize TinyPOS")}
          </button>
        </form>

        <button 
          type="button"
          onClick={() => setIsConnectingExisting(!isConnectingExisting)}
          style={{ width: '100%', background: 'none', border: 'none', color: '#3498db', marginTop: '20px', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.95rem' }}
        >
          {isConnectingExisting ? "Wait, I need to build the database first" : "Already have a database? Connect this device"}
        </button>

      </div>
    </div>
  );
}