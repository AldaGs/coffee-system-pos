function BootScreen({ logo, posSettings }) {

  const brandName = posSettings?.name || "Main Register";
  const backgroundColor = posSettings?.backgroundColor || "#274563";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', backgroundColor: backgroundColor, justifyContent: 'center', alignItems: 'center', color: 'white', fontFamily: 'system-ui' }}>
      
      {/* 1. Show the Custom Logo if it exists, otherwise show the Coffee Emoji */}
      {logo ? (
        <img src={logo} alt="App Logo" style={{ width: '120px', height: '120px', objectFit: 'contain', marginBottom: '24px', borderRadius: '20px' }} />
      ) : (
        <div style={{ fontSize: '5rem', marginBottom: '16px' }}>☕</div>
      )}

      {/* 2. Show the Custom Register Name */}
      <h1 style={{ letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 16px 0' }}>
        {brandName}
      </h1>

      <div className="spinner" style={{ borderTopColor: 'white' }}></div>
    </div>
  );
}

export default BootScreen;