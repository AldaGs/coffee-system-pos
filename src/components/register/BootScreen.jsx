import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';

function BootScreen({ logo, posSettings, loadingText }) {
  const { t } = useTranslation();
  const brandName = posSettings?.name || "Registro Principal";
  const backgroundColor = posSettings?.backgroundColor || "var(--bg-main)";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', backgroundColor: backgroundColor, justifyContent: 'center', alignItems: 'center', color: 'var(--text-main)', fontFamily: 'var(--font-main, system-ui)' }}>

      {/* 1. Show the Custom Logo if it exists, otherwise show the Coffee Icon */}
      {logo ? (
        <img src={logo} alt="App Logo" style={{ width: '120px', height: '120px', objectFit: 'contain', marginBottom: '24px', borderRadius: '24px'}} />
      ) : (
        <div style={{ width: '100px', height: '100px', background: 'var(--brand-color, #3498db)', color: 'white', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem', marginBottom: '24px', boxShadow: '0 8px 25px rgba(52, 152, 219, 0.3)' }}>
          <Icon icon="lucide:coffee" />
        </div>
      )}

      {/* 2. Show the Custom Register Name */}
      <h1 style={{ letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 16px 0', color: 'var(--brand-color)', fontWeight: '900', fontSize: '1.5rem' }}>
        {brandName}
      </h1>

      <div className="spinner"></div>

      {/* 3. The Dynamic Loading Text */}
      <p style={{ marginTop: '24px', fontSize: '1.1rem', fontWeight: '600', opacity: 0.7, color: 'var(--text-main)' }}>
        {loadingText || "Iniciando sistema..."}
      </p>
    </div>
  );
}

export default BootScreen;