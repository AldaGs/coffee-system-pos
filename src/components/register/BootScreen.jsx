function BootScreen({ posSettings }) {
  const bootLogo = localStorage.getItem('tinypos_boot_logo');
  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-main)' }}>
      {bootLogo ? (<img src={bootLogo} alt="App Logo" className="pop-in" style={{ width: '140px', height: '140px', objectFit: 'contain', marginBottom: '24px' }} />) : (<div className="spinner" style={{ marginBottom: '24px' }}></div>)}
      <h1 style={{ color: 'var(--text-main)', letterSpacing: '6px', textTransform: 'uppercase', margin: 0, fontSize: '1.5rem' }}>{posSettings.name || "TinyPOS"}</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>Starting system...</p>
    </div>
  );
}
export default BootScreen;
