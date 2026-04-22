import { useState, useRef } from 'react';
import { Icon } from '@iconify/react';

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

        if (!url || !key) throw new Error("El archivo no contiene los datos requeridos.");

        localStorage.setItem('tinypos_supabase_url', url.trim());
        localStorage.setItem('tinypos_supabase_anon_key', key.trim());

        showAlert("¡Llaves cargadas con éxito!", "success");
        setTimeout(() => onComplete(), 1500);
      } catch (err) {
        showAlert("¡Archivo keys.tiny inválido!", "error");
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

        showAlert("¡TinyPOS Instalado! Descargando llaves...", "success");
        exportKeysToFile(formData.supabaseUrl.trim(), formData.anonKey.trim());
      } else {
        // MODE 2: Manual Connect
        showAlert("¡Dispositivo Conectado a la Base de Datos!", "success");
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
    <div style={{
      display: 'flex',
      height: '100dvh',
      backgroundColor: "var(--bg-app, #f8fafc)",
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'var(--font-main, system-ui)',
      position: 'relative',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch'
    }}>

      {/* Alert Banner */}
      {customAlert.show && (
        <div className="fade-in" style={{
          position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)',
          background: customAlert.type === 'success' ? '#27ae60' : '#e74c3c',
          color: 'white', padding: '16px 24px', borderRadius: '12px', fontWeight: 'bold',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <Icon icon={customAlert.type === 'success' ? 'lucide:check-circle' : 'lucide:alert-circle'} />
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
          background: 'white',
          border: '1px solid #e2e8f0',
          color: '#1a2a3a',
          fontSize: '0.95rem',
          fontWeight: '700',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          borderRadius: '30px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(-3px)'; e.currentTarget.style.background = '#f8fafc'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.background = 'white'; }}
      >
        <Icon icon="lucide:arrow-left" strokeWidth={3} />
        Regresar
      </button>

      <div className="fade-in" style={{ background: 'white', padding: '48px', borderRadius: '24px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 60px rgba(0,0,0,0.1)', border: '1px solid #f1f5f9' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '80px', height: '80px', background: 'var(--brand-color, #f28b05)', color: 'white', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 16px', boxShadow: '0 8px 20px rgba(52, 152, 219, 0.2)' }}>
            <Icon icon="lucide:coffee" />
          </div>
          <h2 style={{ margin: '0', color: '#1a2a3a', fontSize: '1.8rem', fontWeight: '900' }}>{isConnectingExisting ? "Conectar Dispositivo" : "Bienvenido a TinyPOS"}</h2>
          <p style={{ color: '#64748b', marginTop: '8px' }}>Configura tu terminal para comenzar.</p>
        </div>

        {/* KEYS.TINY UPLOAD BUTTON (Only in Connect Mode) */}
        {isConnectingExisting && (
          <div style={{ marginBottom: '32px' }}>
            <input type="file" accept=".tiny" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
            <button
              type="button"
              onClick={() => fileInputRef.current.click()}
              style={{ width: '100%', padding: '18px', backgroundColor: '#f1f5f9', color: '#1a2a3a', border: '2px dashed #cbd5e1', borderRadius: '14px', fontWeight: '800', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', transition: 'all 0.2s ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand-color, #3498db)'; e.currentTarget.style.backgroundColor = '#eff6ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
            >
              <Icon icon="lucide:folder-open" />
              Cargar archivo keys.tiny
            </button>
            <div style={{ textAlign: 'center', margin: '20px 0', color: '#94a3b8', fontSize: '0.85rem', fontWeight: '700', letterSpacing: '1px' }}>— O INGRESA MANUALMENTE —</div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '800', color: '#334155', fontSize: '0.9rem' }}>URL del Proyecto Supabase</label>
            <input placeholder="https://xxxxxx.supabase.co" value={formData.supabaseUrl} onChange={e => setFormData({ ...formData, supabaseUrl: e.target.value })} required style={{ padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outlineColor: 'var(--brand-color, #3498db)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '800', color: '#334155', fontSize: '0.9rem' }}>Clave Anon de Supabase</label>
            <input placeholder="sb_publishable_xxx..." type="password" value={formData.anonKey} onChange={e => setFormData({ ...formData, anonKey: e.target.value })} required style={{ padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outlineColor: 'var(--brand-color, #3498db)' }} />
          </div>

          {!isConnectingExisting && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '800', color: '#334155', fontSize: '0.9rem' }}>Cadena de Conexión (Postgres)</label>
              <input type="password" placeholder="postgresql://postgres..." value={formData.connectionString} onChange={e => setFormData({ ...formData, connectionString: e.target.value })} required style={{ padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outlineColor: 'var(--brand-color, #3498db)' }} />
            </div>
          )}

          <button type="submit" disabled={loading} style={{ padding: '18px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: '800', marginTop: '12px', opacity: loading ? 0.7 : 1, fontSize: '1.15rem', boxShadow: '0 8px 20px rgba(39, 174, 96, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            {loading ? (
              <>
                <Icon icon="lucide:loader-2" className="spin" />
                <span>Procesando...</span>
              </>
            ) : (
              <>
                <Icon icon={isConnectingExisting ? "lucide:link" : "lucide:rocket"} />
                <span>{isConnectingExisting ? "Conectar Manualmente" : "Inicializar TinyPOS"}</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}