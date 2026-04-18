function BootScreen({ logo, posSettings }) {
  return (
    <div className="boot-screen" style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center', 
      background: 'var(--bg-main)' 
    }}>
      <div className="boot-loader-content" style={{ textAlign: 'center' }}>
        {/* NEW: Use base64 logo if exists, else fallback to emoji */}
        {logo ? (
          <img 
            src={logo} 
            alt="Boot Logo" 
            style={{ width: '120px', height: '120px', objectFit: 'contain', marginBottom: '20px' }} 
            className="pulse" 
          />
        ) : (
          <div style={{ fontSize: '5rem', marginBottom: '20px' }}>☕</div>
        )}
        
        <h2 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.8rem', fontWeight: '800' }}>{posSettings?.name || "Main Register"}</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '8px', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 'bold' }}>Register Loading...</p>
      </div>
    </div>
  );
}

export default BootScreen;
