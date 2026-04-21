import { useState } from 'react';

export default function SetupScreen({ onComplete }) {
  const [formData, setFormData] = useState({
    supabaseUrl: '',
    anonKey: '',
    connectionString: ''
  });
  const [loading, setLoading] = useState(false);

  const handleInstall = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: formData.connectionString })
      });

      const result = await response.json();

      if (!result.success) throw new Error(result.error);

      localStorage.setItem('tinypos_supabase_url', formData.supabaseUrl);
      localStorage.setItem('tinypos_supabase_anon_key', formData.anonKey);

      alert("TinyPOS Installed Successfully!");
      onComplete(); 

    } catch (err) {
      alert("Installation Failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100dvh', backgroundColor: '#2c3e50', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui' }}>
      <div style={{ background: 'white', padding: '40px', borderRadius: '12px', width: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>Welcome to TinyPOS ☕</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '24px' }}>Let's set up your secure, self-hosted database.</p>
        
        <form onSubmit={handleInstall} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold' }}>Supabase Project URL</label>
            <input 
              placeholder="https://xxxxxx.supabase.co" 
              value={formData.supabaseUrl}
              onChange={e => setFormData({...formData, supabaseUrl: e.target.value})}
              required
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold' }}>Supabase Anon Key</label>
            <input 
              placeholder="eyJhbGciOiJIUzI1NiIs..." 
              value={formData.anonKey}
              onChange={e => setFormData({...formData, anonKey: e.target.value})}
              required
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}
            />
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '10px 0' }} />
          <p style={{ fontSize: '0.85rem', color: '#888', lineHeight: '1.4' }}>
            *Your Transaction Pooler Connection String is used ONCE to build the database tables and is never stored.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold' }}>Connection String</label>
            <input 
              type="password"
              placeholder="postgresql://postgres.xxx:password@..." 
              value={formData.connectionString}
              onChange={e => setFormData({...formData, connectionString: e.target.value})}
              required
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}
            />
          </div>
          <button type="submit" disabled={loading} style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '16px', opacity: loading ? 0.7 : 1 }}>
            {loading ? "Building Database..." : "Initialize TinyPOS"}
          </button>
        </form>
      </div>
    </div>
  );
}