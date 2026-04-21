import { useState, useRef } from 'react';

export default function SetupScreen({ initialMode, onBack, onComplete }) {
  const [isConnectingExisting, setIsConnectingExisting] = useState(initialMode === 'connect');
  const [formData, setFormData] = useState({ supabaseUrl: '', anonKey: '', connectionString: '' });
  const [loading, setLoading] = useState(false);
  const [customAlert, setCustomAlert] = useState({ show: false, message: '', type: '' });
  
  const fileInputRef = useRef(null);

  const showAlert = (message, type = 'error') => {
    setCustomAlert({ show: true, message, type });
    setTimeout(() => setCustomAlert({ show: false, message: '', type: '' }), 4000);
  };

  // --- THE EXPORTER ---
  const exportKeysToFile = (url, key) => {
    const data = JSON.stringify({ url, key });
    const encoded = btoa(data); // Base64 encode
    const blob = new Blob([encoded], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "keys.tiny";
    link.click();
  };

  // --- THE IMPORTER ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const decoded = atob(event.target.result); // Base64 decode
        const { url, key } = JSON.parse(decoded);
        
        if (!url || !key) throw new Error("File missing required data.");

        localStorage.setItem('tinypos_supabase_url', url.trim());
        localStorage.setItem('tinypos_supabase_anon_key', key.trim());
        
        showAlert("Store keys loaded successfully!", "success");
        setTimeout(() => onComplete(), 1500);
      } catch (err) {
        showAlert("Invalid keys.tiny file!", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset input
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!isConnectingExisting) {
        // MODE 1: Fresh Installation
        const response = await fetch('/api/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionString: formData.connectionString })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        
        showAlert("TinyPOS Installed! Downloading keys...", "success");
        exportKeysToFile(formData.supabaseUrl.trim(), formData.anonKey.trim());
      } else {
        // MODE 2: Manual Connect
        showAlert("Device Connected to Database!", "success");
      }

      localStorage.setItem('tinypos_supabase_url', formData.supabaseUrl.trim());
      localStorage.setItem('tinypos_supabase_anon_key', formData.anonKey.trim());
      
      setTimeout(() => onComplete(), 1500);
    } catch (err) {
      showAlert(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100dvh', backgroundColor: "var(--bg-app)", justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui', position: 'relative' }}>
      
      {/* Alert Banner */}
      {customAlert.show && (
        <div style={{
          position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)',
          background: customAlert.type === 'success' ? '#27ae60' : '#e74c3c',
          color: 'white', padding: '16px 24px', borderRadius: '8px', fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000
        }}>
          {customAlert.message}
        </div>
      )}

      {/* Back Button */}
      <button 
        onClick={onBack} 
        style={{ 
          position: 'absolute', 
          top: '20px', 
          left: '20px', 
          background: 'rgba(255, 255, 255, 0.1)', 
          border: '1px solid rgba(255, 255, 255, 0.2)', 
          color: 'white', 
          fontSize: '0.95rem', 
          fontWeight: 'bold',
          cursor: 'pointer', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '20px',
          backdropFilter: 'blur(4px)',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back
      </button>

      <div style={{ background: 'white', padding: '40px', borderRadius: '12px', width: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img src="/icon-192x192.png" alt="Logo" style={{ width: '80px', height: '80px', borderRadius: '16px', marginBottom: '10px' }} onError={(e) => e.target.style.display = 'none'} />
          <h2 style={{ margin: '0', color: '#2c3e50' }}>{isConnectingExisting ? "Connect Device" : "Welcome to TinyPOS"}</h2>
        </div>

        {/* KEYS.TINY UPLOAD BUTTON (Only in Connect Mode) */}
        {isConnectingExisting && (
          <div style={{ marginBottom: '24px' }}>
            <input type="file" accept=".tiny" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
            <button 
              type="button" 
              onClick={() => fileInputRef.current.click()}
              style={{ width: '100%', padding: '16px', backgroundColor: '#f18407', color: '#2c3e50', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
            >
              📁 Load keys.tiny File
            </button>
            <div style={{ textAlign: 'center', margin: '16px 0', color: '#888', fontSize: '0.9rem' }}>— OR ENTER MANUALLY —</div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: '#333' }}>Supabase Project URL</label>
            <input placeholder="https://xxxxxx.supabase.co" value={formData.supabaseUrl} onChange={e => setFormData({...formData, supabaseUrl: e.target.value})} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: '#333' }}>Supabase Anon Key</label>
            <input type="password" value={formData.anonKey} onChange={e => setFormData({...formData, anonKey: e.target.value})} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }} />
          </div>

          {!isConnectingExisting && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: '#333' }}>Database Connection String</label>
              <input type="password" value={formData.connectionString} onChange={e => setFormData({...formData, connectionString: e.target.value})} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }} />
            </div>
          )}

          <button type="submit" disabled={loading} style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '8px', opacity: loading ? 0.7 : 1, fontSize: '1.1rem' }}>
            {loading ? "Processing..." : (isConnectingExisting ? "Connect Manually" : "Initialize TinyPOS")}
          </button>
        </form>

      </div>
    </div>
  );
}