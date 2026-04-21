import React from 'react';

export default function LandingPage({ onSelectMode }) {
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui', display: 'flex', flexDirection: 'column' }}>
      
      {/* NAVIGATION BAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 40px', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/icon-192x192.png" alt="TinyPOS Logo" style={{ width: '32px', height: '32px', borderRadius: '8px' }} onError={(e) => e.target.style.display = 'none'} />
          <h1 style={{ fontSize: '1.2rem', margin: 0, color: '#2c3e50', fontWeight: '800' }}>TinyPOS</h1>
        </div>
        
        {/* GitHub Link added here */}
        <a 
          href="https://github.com/AldaGs/coffee-system-pos" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#2c3e50', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <svg height="24" width="24" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
          </svg>
          View Source
        </a>
      </nav>

      {/* HERO SECTION */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '3.5rem', color: '#2c3e50', marginBottom: '16px', maxWidth: '800px', lineHeight: '1.1', fontWeight: '800' }}>
          The sovereign point of sale for small business.
        </h2>
        <p style={{ fontSize: '1.25rem', color: '#666', marginBottom: '40px', maxWidth: '600px', lineHeight: '1.6' }}>
          No monthly fees. No cloud subscriptions. Own your data, connect your hardware, and run your shop on your terms.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button 
            onClick={() => onSelectMode('new')}
            style={{ padding: '16px 32px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(39, 174, 96, 0.3)' }}
          >
            Create Your Store
          </button>
          
          <button 
            onClick={() => onSelectMode('connect')}
            style={{ padding: '16px 32px', backgroundColor: 'transparent', color: '#2c3e50', border: '2px solid #2c3e50', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Connect Existing Device
          </button>
        </div>

        {/* FEATURE HIGHLIGHTS */}
        <div style={{ display: 'flex', gap: '40px', marginTop: '80px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '900px' }}>
          <FeatureCard icon="🖨️" title="Hardware Ready" desc="Prints directly to your 58mm thermal printers without complex drivers." />
          <FeatureCard icon="☁️" title="Bring Your Database" desc="Connects to your own free Supabase instance for ultimate data ownership." />
          <FeatureCard icon="⚡" title="Offline Capable" desc="Keeps your line moving even when your local internet connection drops." />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={{ flex: '1 1 250px', textAlign: 'center', padding: '20px' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>{icon}</div>
      <h3 style={{ fontSize: '1.2rem', color: '#2c3e50', marginBottom: '8px' }}>{title}</h3>
      <p style={{ color: '#666', fontSize: '0.95rem', lineHeight: '1.5' }}>{desc}</p>
    </div>
  );
}