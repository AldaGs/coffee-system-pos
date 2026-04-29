import { useState } from 'react';
import { Icon } from '@iconify/react';

// ─── Design tokens matching tinypos LandingPage ───────────────────────────────
const C = {
  brand:      '#f28b05',
  brandLight: '#fff7ed',
  green:      '#27ae60',
  greenLight: '#f0faf4',
  blue:       '#2980b9',
  blueLight:  '#eff6ff',
  red:        '#e74c3c',
  text:       '#1a2a3a',
  muted:      '#546e7a',
  border:     '#e2e8f0',
  bg:         '#fdfdfd',
  surface:    '#ffffff',
  warn:       '#d97706',
  warnLight:  '#fffbeb',
};

const styles = {
  page: {
    backgroundColor: '#fdfdfd', // Matches LandingPage
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#1a2a3a',
    height: '100dvh',   // <-- THE SCROLL FIX!
    overflowY: 'auto',  // <-- THE SCROLL FIX!
    WebkitOverflowScrolling: 'touch',
    userSelect: 'text',
  },

  // ── Nav ──
  nav: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 5%', backgroundColor: 'white', borderBottom: '1px solid #f0f0f0',
    position: 'sticky', top: 0, zIndex: 100,
  },
  navLogo: {
    display: 'flex', alignItems: 'center', gap: '10px',
    textDecoration: 'none', color: C.text,
  },
  navLogoIcon: {
    width: 34, height: 34,
    background: C.brand, color: 'white',
    borderRadius: 9, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontSize: '1.2rem',
  },
  navLogoText: { fontSize: '1.2rem', fontWeight: 900, letterSpacing: '-0.5px' },
  navBack: {
    display: 'flex', alignItems: 'center', gap: 6,
    color: C.muted, fontSize: '0.9rem', fontWeight: 600,
    textDecoration: 'none', cursor: 'pointer',
    padding: '8px 14px', borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.surface,
    transition: 'all 0.15s',
  },

  // ── Hero ──
  hero: {
    backgroundColor: '#fdfdfd', // Removed dark gradient
    padding: '72px 5% 40px',
    textAlign: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  heroBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'rgba(242,139,5,0.1)',
    border: '1px solid rgba(242,139,5,0.2)',
    color: '#f28b05', // Brand Orange
    padding: '6px 14px', borderRadius: 20,
    fontSize: '0.75rem', fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 'clamp(2rem, 5vw, 3rem)', color: '#1a2a3a', // Dark text
    fontWeight: 900, lineHeight: 1.1,
    marginBottom: 16, letterSpacing: '-1px',
  },
  heroSubtitle: {
    fontSize: '1.1rem', color: '#546e7a', // Muted slate text
    maxWidth: 560, margin: '0 auto 40px',
    lineHeight: 1.6,
  },

  // ── Progress indicator ──
  progressRow: {
    display: 'flex', justifyContent: 'center',
    gap: 0, flexWrap: 'wrap',
    maxWidth: 720, margin: '0 auto',
  },

  // ── Main content ──
  main: { maxWidth: 780, margin: '0 auto', padding: '56px 5% 80px' },

  // ── Section ──
  sectionLabel: {
    fontSize: '0.68rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.16em',
    color: C.brand, marginBottom: 8,
  },
  sectionTitle: {
    fontSize: '1.7rem', fontWeight: 900,
    color: C.text, marginBottom: 10, letterSpacing: '-0.5px',
  },
  sectionDesc: {
    fontSize: '0.95rem', color: C.muted,
    lineHeight: 1.7, marginBottom: 32,
    maxWidth: 600,
  },

  // ── Step card ──
  stepCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    transition: 'box-shadow 0.2s',
  },
  stepHeader: {
    display: 'flex', alignItems: 'center',
    gap: 16, padding: '20px 24px',
    cursor: 'pointer', userSelect: 'none',
  },
  stepNum: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: '0.9rem', flexShrink: 0,
  },
  stepTitle: { fontSize: '1rem', fontWeight: 800, flex: 1, color: C.text },
  stepBody: { padding: '0 24px 24px', borderTop: `1px solid ${C.border}` },
  stepDesc: {
    fontSize: '0.875rem', color: C.muted,
    lineHeight: 1.75, marginTop: 16, marginBottom: 20,
  },

  // ── Screenshot placeholder ──
  screenshotBox: {
    background: '#f1f5f9',
    border: `2px dashed ${C.border}`,
    borderRadius: 12,
    padding: '28px 20px',
    textAlign: 'center',
    marginBottom: 16,
    color: C.muted,
    fontSize: '0.82rem',
  },
  screenshotIcon: { fontSize: '2rem', marginBottom: 8, display: 'block' },

  // ── Callout ──
  callout: (type) => ({
    display: 'flex', gap: 12,
    padding: '14px 18px', borderRadius: 10,
    marginBottom: 14,
    background: type === 'warn' ? C.warnLight : type === 'tip' ? C.blueLight : C.greenLight,
    border: `1px solid ${type === 'warn' ? '#fde68a' : type === 'tip' ? '#bfdbfe' : '#bbf7d0'}`,
  }),
  calloutIcon: (type) => ({
    fontSize: '1.1rem', flexShrink: 0, marginTop: 1,
    color: type === 'warn' ? C.warn : type === 'tip' ? C.blue : C.green,
  }),
  calloutText: {
    fontSize: '0.83rem', lineHeight: 1.7, color: C.text,
  },

  // ── Code snippet ──
  codeBox: {
    background: '#1a2a3a',
    color: '#e2e8f0',
    borderRadius: 10,
    padding: '14px 18px',
    fontFamily: 'monospace',
    fontSize: '0.82rem',
    lineHeight: 1.7,
    marginBottom: 14,
    overflowX: 'auto',
    position: 'relative',
  },
  codeLabel: {
    position: 'absolute', top: 10, right: 12,
    fontSize: '0.6rem', textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)',
  },

  // ── Warning banner ──
  warnBanner: {
    background: C.warnLight,
    border: `1px solid #fde68a`,
    borderLeft: `4px solid ${C.warn}`,
    borderRadius: 10, padding: '16px 20px',
    marginBottom: 24,
    display: 'flex', gap: 12, alignItems: 'flex-start',
  },

  // ── CTA (Bottom Box) ──
  ctaBox: {
    background: 'white', // Removed dark gradient
    border: '1px solid #e2e8f0',
    boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
    borderRadius: 24, padding: '48px',
    textAlign: 'center', color: '#1a2a3a',
    marginTop: 56,
  },
  ctaTitle: {
    fontSize: '1.6rem', fontWeight: 900,
    marginBottom: 10, letterSpacing: '-0.5px',
  },
  ctaDesc: {
    color: '#546e7a',
    fontSize: '0.95rem', marginBottom: 28,
    lineHeight: 1.6,
  },
  btnPrimary: {
    padding: '16px 36px',
    background: C.green, color: 'white',
    border: 'none', borderRadius: 12,
    fontWeight: 800, fontSize: '1rem',
    cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(39,174,96,0.3)',
    display: 'inline-flex', alignItems: 'center', gap: 8,
    transition: 'transform 0.15s',
  },
  divider: {
    border: 'none', borderTop: `1px solid ${C.border}`,
    margin: '48px 0',
  },
};

// ─── Step data ────────────────────────────────────────────────────────────────
const STEPS = [
  {
    num: 1,
    title: 'Crea tu cuenta gratuita en Supabase',
    color: '#3498db',
    icon: 'lucide:user-plus',
    content: () => (
      <>
        <p style={styles.stepDesc}>
          Supabase es como contratar a un experto en bases de datos — pero gratis. 
          Ellos guardan toda la información de tu negocio (ventas, inventario, clientes) 
          de forma segura en la nube.
        </p>

        <div style={styles.screenshotBox}>
            <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
        <img 
            src="/step-1.jpg" 
            alt="Paso 1 Supabase" 
            style={{ width: '100%', height: 'auto', display: 'block' }} 
        />
            </div>
        </div>
        <p style={{ fontSize: '0.85rem', color: C.muted, textAlign: 'center', marginBottom: '24px' }}>
        Ve a <strong>supabase.com</strong> y haz clic en <em>"Start your project"</em>
        </p>

        <Callout type="tip" icon="lucide:info">
          Puedes registrarte con tu cuenta de Google o GitHub — no necesitas crear una contraseña nueva.
        </Callout>

        <div style={styles.screenshotBox}>
          <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
        <img 
            src="/step-2.jpg" 
            alt="Paso 2 Supabase" 
            style={{ width: '100%', height: 'auto', display: 'block' }} 
        />
        </div>
          <br />Supabase te enviará un correo de confirmación. <strong>Ábrelo y haz clic en el enlace</strong> antes de continuar.
        </div>

        <Callout type="warn" icon="lucide:alert-triangle">
          Si no ves el correo en 2 minutos, revisa tu carpeta de <strong>Spam</strong>. 
          A veces termina ahí.
        </Callout>
      </>
    ),
  },
  {
    num: 2,
    title: 'Crea tu proyecto',
    color: '#9b59b6',
    icon: 'lucide:folder-plus',
    content: () => (
      <>
        <p style={styles.stepDesc}>
          Un "proyecto" en Supabase es simplemente tu base de datos. 
          Tendrás uno por negocio.
        </p>

        <div style={styles.screenshotBox}>
            <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <img 
                    src="/step-3.jpg" 
                    alt="Paso 3 Supabase" 
                    style={{ width: '100%', height: 'auto', display: 'block' }} 
                />
            </div>
            <br />En el panel principal, haz clic en <em>"New project"</em>
        </div>

        <p style={{ ...styles.stepDesc, marginBottom: 12 }}>Llena el formulario así:</p>

        <div style={{ ...styles.codeBox, marginBottom: 14 }}>
          <span style={styles.codeLabel}>Ejemplo</span>
          <span style={{ color: '#94a3b8' }}>Nombre del proyecto:</span>  <span style={{ color: '#f9c74f' }}>mi-cafeteria</span>{'\n'}
          <span style={{ color: '#94a3b8' }}>Contraseña de base de datos:</span> <span style={{ color: '#f9c74f' }}>algo seguro — guárdala</span>{'\n'}
          <span style={{ color: '#94a3b8' }}>Región:</span>  <span style={{ color: '#f9c74f' }}>East US (Ohio)</span> <span style={{ color: '#64748b' }}>(la más cercana a México)</span>
        </div>

        <Callout type="warn" icon="lucide:key">
          <strong>Guarda la contraseña de base de datos en un lugar seguro.</strong>{' '}
          Supabase no te la mostrará de nuevo. La necesitarás en el paso siguiente.
        </Callout>

        <div style={styles.screenshotBox}>
          <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <img 
                    src="/step-4.jpg" 
                    alt="Paso 4 Supabase" 
                    style={{ width: '100%', height: 'auto', display: 'block' }} 
                />
            </div>
          <br />El proyecto tarda ~1 minuto en crearse. Espera a que la que termine la configuración.
        </div>
      </>
    ),
  },
  {
    num: 3,
    title: 'Crea tu usuario administrador',
    color: '#27ae60',
    icon: 'lucide:shield-check',
    content: () => (
      <>
        <p style={styles.stepDesc}>
          Este usuario es la "llave maestra" de tu tinypos. Solo necesitas uno. 
          Úsalo para acceder al panel de administración desde cualquier dispositivo.
        </p>

        <div style={styles.screenshotBox}>
          <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <img 
                    src="/step-5.jpg" 
                    alt="Paso 5 Supabase" 
                    style={{ width: '100%', height: 'auto', display: 'block' }} 
                />
            </div>
          <br />En el menú izquierdo: <strong>Authentication → Users → Add user</strong>
        </div>

        <div style={{ ...styles.codeBox }}>
          <span style={styles.codeLabel}>Ejemplo</span>
          <span style={{ color: '#94a3b8' }}>Email:</span>  <span style={{ color: '#f9c74f' }}>admin@micafeteria.com</span>{'\n'}
          <span style={{ color: '#94a3b8' }}>Contraseña:</span> <span style={{ color: '#f9c74f' }}>min. 8 caracteres</span>
        </div>

        <Callout type="tip" icon="lucide:lightbulb">
          No importa si el correo no existe — es solo un identificador. 
          Puedes usar <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 4 }}>register@tunegocio.com</code> o lo que quieras.
        </Callout>

        <Callout type="warn" icon="lucide:alert-triangle">
          <strong>Anota este correo y contraseña.</strong> Los necesitarás cada vez que 
          quieras acceder al panel de administración de tinypos.
        </Callout>
      </>
    ),
  },
  {
    num: 4,
    title: 'Copia tus llaves de acceso',
    color: '#f28b05',
    icon: 'lucide:key',
    content: () => (
      <>
        <p style={styles.stepDesc}>
          Las "llaves" son dos códigos que le dicen a tinypos dónde está tu base de datos 
          y cómo conectarse. Son como la dirección y la contraseña de tu casa.
        </p>

        <div style={styles.screenshotBox}>
          <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <img 
                    src="/step-6.jpg" 
                    alt="Paso 6 Supabase" 
                    style={{ width: '100%', height: 'auto', display: 'block' }} 
                />
            </div>
          <br />Regresa a la página principal <strong>Da clik en COPY para acceder a tus llaves</strong>
        </div>

        <p style={{ ...styles.stepDesc, marginBottom: 10 }}>Necesitas copiar <strong>tres valores</strong>:</p>

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, overflow: 'hidden', marginBottom: 14,
        }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.3rem', marginTop: 2 }}>1️⃣</span>
            <div>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Project URL</div>
              <div style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.6 }}>
                Empieza con <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>https://</code> y termina en <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>.supabase.co</code>
              </div>
            </div>
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.3rem', marginTop: 2 }}>2️⃣</span>
            <div>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Publishable key</div>
              <div style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.6 }}>
                <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>sb_publishable_xxx...</code> 
                Es segura compartirla — tinypos la necesita para conectarse.
              </div>
            </div>
          </div>
        </div>
        <Callout type="tip" icon="lucide:info">
          La <strong>service_role key</strong> que aparece abajo NO la necesitas aquí. 
          Ignórala — esa tiene permisos totales y no debe usarse en el frontend.
        </Callout>

        <div style={styles.screenshotBox}>
          <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <img 
                    src="/step-7.jpg" 
                    alt="Paso 7 Supabase" 
                    style={{ width: '100%', height: 'auto', display: 'block' }} 
                />
            </div>
          <br />Click en CONNECT (1). Direct (2). <em>TRANSATION POOLER</em> (3) y copia la llave que aparece (4). 
          <br/>Sustituye <em>[YOUR-PASSWORD]</em> por la contraseña de tu cuenta de Supabase.
        </div>
      </>
    ),
  },
  {
    num: 5,
    title: 'Conecta tinypos a tu base de datos',
    color: '#27ae60',
    icon: 'lucide:link',
    content: () => (
      <>
        <p style={styles.stepDesc}>
          Ya tienes todo. Ahora solo pegas tus llaves en tinypos y el sistema 
          crea todas las tablas necesarias automáticamente — sin tocar código.
        </p>

        <div style={styles.screenshotBox}>
          <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <img 
                    src="/step-8.jpg" 
                    alt="Paso 8 Supabase" 
                    style={{ width: '100%', height: 'auto', display: 'block' }} 
                />
            </div>
          <br />En tinypos, selecciona <em>"Crear tu tienda"</em> y pega los valores.
        </div>

        <div style={{
          background: C.greenLight, border: `1px solid #bbf7d0`,
          borderRadius: 10, padding: '16px 20px', marginBottom: 14,
        }}>
          <div style={{ fontWeight: 800, marginBottom: 10, color: C.green, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon icon="lucide:check-circle" />
            ¿Qué hace tinypos automáticamente?
          </div>
          <ul style={{ paddingLeft: 18, fontSize: '0.84rem', lineHeight: 2, color: C.text }}>
            <li>Crea todas las tablas (ventas, menú, inventario, clientes…)</li>
            <li>Configura las reglas de seguridad (RLS policies)</li>
            <li>Inserta los datos iniciales de tu tienda</li>
            <li>Descarga el archivo <strong>keys.tiny</strong> para clonar en otros dispositivos</li>
          </ul>
        </div>

        <Callout type="tip" icon="lucide:smartphone">
          <strong>¿Tienes más de una tablet o computadora?</strong> Guarda el archivo{' '}
          <strong>keys.tiny</strong> que se descarga. En cada dispositivo extra, 
          elige "Conectar dispositivo" y sube ese archivo — listo.
        </Callout>
      </>
    ),
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Callout({ type, icon, children }) {
  return (
    <div style={styles.callout(type)}>
      <Icon icon={icon} style={styles.calloutIcon(type)} />
      <p style={styles.calloutText}>{children}</p>
    </div>
  );
}

function StepCard({ step, index }) {
  const [open, setOpen] = useState(index === 0);
  const Content = step.content;

  return (
    <div style={{
      ...styles.stepCard,
      boxShadow: open ? '0 4px 20px rgba(0,0,0,0.07)' : 'none',
    }}>
      <div style={styles.stepHeader} onClick={() => setOpen(o => !o)}>
        <div style={{
          ...styles.stepNum,
          background: open ? step.color : '#f1f5f9',
          color: open ? 'white' : C.muted,
        }}>
          {open
            ? <Icon icon="lucide:check" style={{ fontSize: '1rem' }} />
            : step.num}
        </div>
        <div style={styles.stepTitle}>{step.title}</div>
        <Icon
          icon={open ? 'lucide:chevron-up' : 'lucide:chevron-down'}
          style={{ color: C.muted, fontSize: '1.1rem', transition: 'transform 0.2s' }}
        />
      </div>
      {open && (
        <div style={styles.stepBody}>
          <Content />
        </div>
      )}
    </div>
  );
}

function ProgressStep({ num, label, active, done }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      flex: 1, minWidth: 80, gap: 6,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: done ? C.green : active ? C.brand : '#f1f5f9',
        color: done || active ? 'white' : '#94a3b8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: '0.85rem',
        border: active ? `2px solid ${C.brandLight}` : 'none',
        transition: 'all 0.2s',
      }}>
        {done ? <Icon icon="lucide:check" /> : num}
      </div>
      <span style={{
        fontSize: '0.7rem', 
        color: active ? '#1a2a3a' : '#94a3b8',
        textAlign: 'center', lineHeight: 1.3, maxWidth: 70, 
        fontWeight: active ? 700 : 500
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SupabaseGuide({ onBack }) {
  const progressLabels = ['Cuenta', 'Proyecto', 'Usuario', 'Llaves', 'Conectar'];

  return (
    <div style={styles.page}>

      {/* Nav */}
      <nav style={styles.nav}>
        <a href="/" style={styles.navLogo}>
          <div style={{background:"#ffffff"}}>
            <img 
              src="/icon.svg" 
              alt="tinypos" 
              style={{width: '54px', height: '54px', borderRadius: '10px'}} 
            />
          </div>
          <span style={styles.navLogoText}>tinypos</span>
        </a>
        <button
          onClick={onBack}
          style={styles.navBack}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.text}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
        >
          <Icon icon="lucide:arrow-left" />
          Regresar
        </button>
      </nav>

      {/* Hero */}
      <div style={styles.hero}>
        <div style={styles.heroGlow} />
        <div style={styles.heroBadge}>
          <Icon icon="lucide:book-open" />
          Guía de instalación
        </div>
        <h1 style={styles.heroTitle}>
          Configura tu base de datos<br />
          <span style={{ color: C.brand }}>en 15 minutos</span>
        </h1>
        <p style={styles.heroSubtitle}>
          Sin conocimientos técnicos. Sin tarjeta de crédito. 
          Supabase es completamente gratis para negocios pequeños — 
          y tú eres dueño de todos tus datos.
        </p>

        {/* Progress row */}
        <div style={styles.progressRow}>
          {progressLabels.map((label, i) => (
            <ProgressStep key={i} num={i + 1} label={label} active={i === 0} done={false} />
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={styles.main}>

        {/* Why Supabase */}
        <div style={{ marginBottom: 48 }}>
          <p style={styles.sectionLabel}>¿Por qué Supabase?</p>
          <h2 style={styles.sectionTitle}>Tu negocio merece sus propios datos</h2>
          <p style={styles.sectionDesc}>
            La mayoría de los sistemas de punto de venta te cobran mensualidad 
            y guardan tu información en sus servidores — tú no tienes control. 
            Con tinypos, <strong>tu información vive en tu propia base de datos</strong>, 
            gratis, para siempre.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 32 }}>
            {[
              { icon: 'lucide:dollar-sign', color: C.green, title: 'Costo real: $0', desc: 'El plan gratuito de Supabase es suficiente para cualquier negocio pequeño por años.' },
              { icon: 'lucide:database', color: C.blue, title: 'Tus datos, tu control', desc: 'Nadie más puede ver o vender la información de tus clientes y ventas.' },
              { icon: 'lucide:wifi-off', color: C.brand, title: 'Funciona sin internet', desc: 'tinypos guarda todo localmente. Supabase es el respaldo en la nube.' },
            ].map((item, i) => (
              <div key={i} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: '20px',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${item.color}15`, color: item.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem', marginBottom: 12,
                }}>
                  <Icon icon={item.icon} />
                </div>
                <div style={{ fontWeight: 800, marginBottom: 6, fontSize: '0.95rem' }}>{item.title}</div>
                <div style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.65 }}>{item.desc}</div>
              </div>
            ))}
          </div>

          {/* The honest limitation warning */}
          <div style={styles.warnBanner}>
            <Icon icon="lucide:alert-triangle" style={{ color: C.warn, fontSize: '1.2rem', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ display: 'block', marginBottom: 4 }}>
                Una limitación importante que debes conocer
              </strong>
              <p style={{ fontSize: '0.84rem', color: C.text, lineHeight: 1.7, margin: 0 }}>
                El plan gratuito de Supabase <strong>pausa tu base de datos si no hay actividad por 7 días</strong> — 
                por ejemplo, si cierras tu negocio una semana de vacaciones. Reactivarla es fácil: 
                entra a <strong>supabase.com</strong>, ve a tu proyecto y haz clic en "Restore". 
                Tarda menos de 30 segundos y no pierdes ningún dato. Si prefieres evitar esto, 
                puedes actualizar al plan Pro de Supabase por $25 USD/mes.
              </p>
            </div>
          </div>
        </div>

        <hr style={styles.divider} />

        {/* Steps */}
        <div style={{ marginBottom: 8 }}>
          <p style={styles.sectionLabel}>Paso a paso</p>
          <h2 style={styles.sectionTitle}>Sigue estos 5 pasos</h2>
          <p style={styles.sectionDesc}>
            Haz clic en cada paso para expandirlo. Puedes hacerlos en orden o volver al que necesites.
          </p>
        </div>

        {STEPS.map((step, i) => (
          <StepCard key={i} step={step} index={i} />
        ))}

        {/* FAQ */}
        <hr style={styles.divider} />
        <div>
          <p style={styles.sectionLabel}>Preguntas frecuentes</p>
          <h2 style={{ ...styles.sectionTitle, marginBottom: 24 }}>¿Tienes dudas?</h2>

          {[
            {
              q: '¿Necesito saber programar?',
              a: 'No. Todo lo que necesitas es crear una cuenta en Supabase y copiar dos códigos. tinypos hace el resto automáticamente.',
            },
            {
              q: '¿Qué pasa si pierdo mis llaves?',
              a: 'Puedes encontrarlas de nuevo en cualquier momento en supabase.com → tu proyecto → Project Settings → API. También puedes exportarlas desde tinypos con el botón "Exportar llaves".',
            },
            {
              q: '¿Puedo usar tinypos en varias tablets?',
              a: 'Sí. Guarda el archivo keys.tiny que se descarga al instalar. En cada dispositivo adicional, elige "Conectar dispositivo existente" y sube ese archivo.',
            },
            {
              q: '¿Mis datos están seguros?',
              a: 'Sí. Supabase usa cifrado en tránsito y en reposo. Además, tinypos configura automáticamente las reglas de seguridad para que solo tus dispositivos autorizados puedan acceder.',
            },
            {
              q: '¿Qué pasa cuando mi base de datos se pausa?',
              a: 'tinypos sigue funcionando — guarda todo localmente. Cuando reactives tu base de datos en supabase.com, todo se sincroniza automáticamente en el fondo.',
            },
          ].map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} />
          ))}
        </div>

        {/* CTA */}
        <div style={styles.ctaBox}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}><img 
              src="/icon.svg" 
              alt="tinypos" 
              style={{width: '80px', height: '80px', borderRadius: '10px'}} 
            />
          </div>
          <h2 style={styles.ctaTitle}>¿Todo listo?</h2>
          <p style={styles.ctaDesc}>
            Ya tienes todo lo que necesitas. Regresa a tinypos y pega tus llaves.
          </p>
          <button
            style={styles.btnPrimary}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            onClick={onBack}
          >
            <Icon icon="lucide:rocket" />
            Volver a tinypos
          </button>
        </div>

      </div>
    </div>
  );
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderBottom: `1px solid ${C.border}`,
      padding: '16px 0',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 16, cursor: 'pointer',
          textAlign: 'left', padding: 0,
          color: C.text,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{q}</span>
        <Icon
          icon={open ? 'lucide:minus' : 'lucide:plus'}
          style={{ color: C.muted, flexShrink: 0, fontSize: '1rem' }}
        />
      </button>
      {open && (
        <p style={{
          fontSize: '0.85rem', color: C.muted,
          lineHeight: 1.75, marginTop: 12, paddingRight: 24,
        }}>
          {a}
        </p>
      )}
    </div>
  );
}
