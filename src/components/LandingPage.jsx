import React from 'react';
import { Icon } from '@iconify/react';

export default function LandingPage({ onSelectMode }) {
  return (
    <div style={{
      height: '100dvh',
      backgroundColor: '#fdfdfd',
      fontFamily: 'var(--font-main, system-ui)',
      display: 'flex',
      flexDirection: 'column',
      color: '#2c3e50',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch'
    }}>

      {/* NAVIGATION BAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 5%', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', background: 'var(--brand-color, #f28b05)', color: 'white', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', boxShadow: '0 4px 10px rgba(52, 152, 219, 0.2)' }}>
            <Icon icon="lucide:coffee" />
          </div>
          <h1 style={{ fontSize: '1.4rem', margin: 0, color: '#1a2a3a', fontWeight: '900', letterSpacing: '-0.5px' }}>tinypos</h1>
        </div>

        <a
          href="https://github.com/AldaGs/coffee-system-pos"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#546e7a', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}
        >
          <Icon icon="mdi:github" fontSize="1.4rem" />
          <span>Ver Fuente  </span>
        </a>
      </nav>

      {/* HERO SECTION */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '80px 5%', textAlign: 'center' }}>
        <div className="fade-in" style={{ maxWidth: '900px' }}>
          <h2 style={{ fontSize: '4rem', color: '#1a2a3a', marginBottom: '24px', lineHeight: '1.05', fontWeight: '900', letterSpacing: '-1px' }}>
            El punto de venta autónomo para <span style={{ color: 'var(--brand-color, #f28b05)' }}>pequeños negocios.</span>
          </h2>
          <p style={{ fontSize: '1.35rem', color: '#546e7a', marginBottom: '48px', maxWidth: '700px', margin: '0 auto 48px', lineHeight: '1.5' }}>
            Sin mensualidades. Sin suscripciones en la nube. Sé dueño de tus datos, conecta tu hardware y gestiona tu negocio a tu manera.
          </p>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => onSelectMode('new')}
              style={{ padding: '18px 40px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '14px', fontSize: '1.15rem', fontWeight: '800', cursor: 'pointer', boxShadow: '0 8px 20px rgba(39, 174, 96, 0.25)', transition: 'transform 0.2s ease' }}
              onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
            >
              Crear tu tienda
            </button>

            <button
              onClick={() => onSelectMode('connect')}
              style={{ padding: '18px 40px', backgroundColor: 'white', color: '#1a2a3a', border: '2px solid #e2e8f0', borderRadius: '14px', fontSize: '1.15rem', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s ease' }}
              onMouseEnter={(e) => { e.target.style.borderColor = '#1a2a3a'; e.target.style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = 'white'; }}
            >
              Conectar dispositivo existente
            </button>
          </div>
        </div>

        {/* FEATURE HIGHLIGHTS */}
        <div style={{ display: 'flex', gap: '30px', marginTop: '100px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '1100px' }}>
          <FeatureCard
            icon="lucide:printer"
            color="#3498db"
            title="Hardware listo"
            desc="Imprime directamente en impresoras térmicas de 58mm sin controladores complejos."
          />
          <FeatureCard
            icon="lucide:database"
            color="#9b59b6"
            title="Propiedad de los datos"
            desc={
              <>
                Se conecta a tu propia instancia gratuita de <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: '#f28b05', fontWeight: 'bold', textDecoration: 'none' }}>Supabase</a> para un control total de tus datos.
              </>
            }
          />
          <FeatureCard
            icon="lucide:zap"
            color="#f1c40f"
            title="Funciona sin internet"
            desc="Mantén tu fila avanzando incluso si se cae tu conexión a internet."
          />
        </div>
      </main>

      <footer style={{ padding: '30px', textAlign: 'center', borderTop: '1px solid #f0f0f0', color: '#94a3b8', fontSize: '0.9rem' }}>
        &copy; {new Date().getFullYear()} tinypos. Diseñado para comunidades de café artesanal.
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc, color }) {
  return (
    <div style={{ flex: '1 1 300px', textAlign: 'center', padding: '32px', background: 'white', borderRadius: '24px', border: '1px solid #f0f0f0', transition: 'all 0.3s ease' }}>
      <div style={{
        width: '64px',
        height: '64px',
        background: `${color}15`,
        color: color,
        borderRadius: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2rem',
        margin: '0 auto 20px'
      }}>
        <Icon icon={icon} />
      </div>
      <h3 style={{ fontSize: '1.25rem', color: '#1a2a3a', marginBottom: '12px', fontWeight: '800' }}>{title}</h3>
      <p style={{ color: '#546e7a', fontSize: '1rem', lineHeight: '1.6', margin: 0 }}>{desc}</p>
    </div>
  );
}
