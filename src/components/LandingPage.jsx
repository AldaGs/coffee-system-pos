import React from 'react';
import { Icon } from '@iconify/react';

export default function LandingPage({ onSelectMode, onShowGuide }) {
  return (
    <div style={{
      height: '100dvh',
      backgroundColor: '#fdfdfd',
      fontFamily: 'var(--font-main, system-ui)',
      display: 'flex',
      flexDirection: 'column',
      color: '#0d3a66',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch'
    }}>

      {/* NAVIGATION BAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 5%', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '46px', height: '46px', background: 'linear-gradient(210deg, #0d3a66, #4770d6)', color: 'white', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
            <img
              src="/icon.svg"
              alt="tinypos"
              style={{ width: '50px', height: '50px', borderRadius: '10px', top: "-5px" }}
            />
          </div>
          <h1 style={{ fontSize: '1.4rem', margin: 0, color: '#0d3a66', fontWeight: '900', letterSpacing: '-0.5px' }}>tinypos</h1>
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
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 'clamp(40px, 8vw, 80px) 5%', textAlign: 'center' }}>
        <div className="fade-in" style={{ maxWidth: '900px' }}>
          <h2 style={{ fontSize: 'clamp(2.4rem, 8vw, 4rem)', color: '#0d3a66', marginBottom: '24px', lineHeight: '1.05', fontWeight: '900', letterSpacing: '-1px' }}>
            El punto de venta autónomo para <span style={{ color: 'var(--brand-color, #f28b05)' }}>pequeños negocios.</span>
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 3vw, 1.35rem)', color: '#546e7a', marginBottom: '48px', maxWidth: '700px', margin: '0 auto 48px', lineHeight: '1.5' }}>
            Sin mensualidades. Sin suscripciones en la nube. Sé dueño de tus datos, conecta tu hardware y gestiona tu negocio a tu manera.
          </p>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => onSelectMode('new')}
              style={{ padding: '18px 40px', backgroundColor: '#099b46', color: 'white', border: 'none', borderRadius: '14px', fontSize: '1.15rem', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 12px rgba(5, 78, 35, 0.25)', transition: 'transform 0.2s ease' }}
              onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
            >
              Crear tu tienda
            </button>

            <button
              onClick={() => onSelectMode('connect')}
              style={{ padding: '18px 40px', backgroundColor: 'white', color: '#0d3a66', border: '2px solid #e2e8f0', borderRadius: '14px', fontSize: '1.15rem', fontWeight: '900', cursor: 'pointer', transition: 'all 0.2s ease' }}
              onMouseEnter={(e) => { e.target.style.borderColor = '#0d3a66'; e.target.style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = 'white'; }}
            >
              Conectar dispositivo existente
            </button>
          </div>

          {/* --- ADD THIS SECONDARY LINK --- */}
          <button
            onClick={onShowGuide}
            style={{
              background: 'none', border: 'none', color: '#546e7a',
              fontSize: '1.05rem', fontWeight: '600', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              textDecoration: 'underline', textUnderlineOffset: '4px',
              paddingTop: "20px", flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', flexDirection: "row", alignItems: 'center', gap: '8px', fontSize: '1.05rem', fontWeight: '600' }}>
              <Icon icon="lucide:book-open" />
              <span style={{ textDecoration: 'underline', textUnderlineOffset: '4px' }}>
                ¿Cómo funciona la base de datos gratuita?
              </span>
            </div>
            <span style={{ fontSize: '0.95rem', color: '#94a3b8', fontWeight: '500' }}>
              Lee la guía.
            </span>
          </button>
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
          <FeatureCard
            icon="lucide:calculator"
            color="#099b46"
            title="Calculadora de recetas"
            desc="Calcula el costo real de tus recetas antes de fijar precios. Sin cuenta, sin registros."
            href="/calculator"
            linkLabel="Probar ahora →"
          />
        </div>
      </main>

      <footer style={{ padding: '30px', textAlign: 'center', borderTop: '1px solid #f0f0f0', color: '#94a3b8', fontSize: '0.9rem' }}>
        &copy; {new Date().getFullYear()} tinypos. Diseñado por Aldair Gonzalez Sanchez.
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc, color, href, linkLabel }) {
  return (
    <div style={{ flex: '1 1 300px', textAlign: 'center', padding: '32px', background: 'white', borderRadius: '24px', border: '1px solid #f0f0f0', transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
      <h3 style={{ fontSize: '1.25rem', color: '#0d3a66', marginBottom: '12px', fontWeight: '800' }}>{title}</h3>
      <p style={{ color: '#546e7a', fontSize: '1rem', lineHeight: '1.6', margin: 0, flex: 1 }}>{desc}</p>
      {href && (
        <a
          href={href}
          style={{ marginTop: '20px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 22px', background: color, color: 'white', borderRadius: '10px', textDecoration: 'none', fontWeight: '800', fontSize: '0.95rem' }}
        >
          {linkLabel}
        </a>
      )}
    </div>
  );
}
