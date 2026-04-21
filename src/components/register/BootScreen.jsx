import { useTranslation } from '../../hooks/useTranslation';

function BootScreen({ logo, posSettings, loadingText }) {
  const { t } = useTranslation();
  const brandName = posSettings?.name || "Main Register";
  const backgroundColor = posSettings?.backgroundColor || "var(--bg-main)";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', backgroundColor: backgroundColor, justifyContent: 'center', alignItems: 'center', color: 'white', fontFamily: 'system-ui' }}>
      
      {/* 1. Show the Custom Logo if it exists, otherwise show the Coffee Emoji */}
      {logo ? (
        <img src={logo} alt="App Logo" style={{ width: '120px', height: '120px', objectFit: 'contain', marginBottom: '24px', borderRadius: '20px' }} />
      ) : (
        <div style={{ fontSize: '5rem', marginBottom: '16px' }}>☕</div>
      )}

      {/* 2. Show the Custom Register Name */}
      <h1 style={{ letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 16px 0', color:'var(--text-main)'}}>
        {brandName}
      </h1>

      {/* Made the spinner inherit the brand color so it matches the rest of the app! */}
      <div className="spinner" style={{ borderTopColor: 'var(--brand-color)' }}></div>
      
      {/* 3. The Dynamic Loading Text */}
      <p style={{ marginTop: '20px', fontSize: '1.2rem', opacity: 0.8 ,color:'var(--text-main)'}}>
        {loadingText || t('boot.loading')}
      </p>
    </div>
  );
}

export default BootScreen;