import { useState } from 'react';
import { Icon } from '@iconify/react';

// ─── Design tokens matching tinypos LandingPage ───────────────────────────────
const C = {
  brand: '#f28b05',
  brandLight: '#fff7ed',
  green: '#27ae60',
  greenLight: '#f0faf4',
  blue: '#2980b9',
  blueLight: '#eff6ff',
  red: '#e74c3c',
  text: '#0d3a66',
  muted: '#546e7a',
  border: '#e2e8f0',
  bg: '#fdfdfd',
  surface: '#ffffff',
  warn: '#d97706',
  warnLight: '#fffbeb',
};

const styles = {
  page: {
    backgroundColor: '#fdfdfd',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#0d3a66',
    height: '100dvh',
    overflowY: 'auto',
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
  navLogoText: { fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.5px' },
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
    backgroundColor: '#fdfdfd',
    padding: '72px 5% 48px',
    textAlign: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  heroBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'rgba(242,139,5,0.1)',
    border: '1px solid rgba(242,139,5,0.2)',
    color: '#f28b05',
    padding: '6px 14px', borderRadius: 20,
    fontSize: '0.75rem', fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 'clamp(2rem, 5vw, 3rem)', color: '#0d3a66',
    fontWeight: 900, lineHeight: 1.1,
    marginBottom: 16, letterSpacing: '-1px',
  },
  heroSubtitle: {
    fontSize: '1.1rem', color: '#546e7a',
    maxWidth: 600, margin: '0 auto',
    lineHeight: 1.6,
  },

  // ── Main content ──
  main: { maxWidth: 820, margin: '0 auto', padding: '40px 5% 80px' },

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
    lineHeight: 1.7, marginBottom: 28,
    maxWidth: 640,
  },

  // ── Feature card ──
  featureCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: '28px',
    marginBottom: 16,
    transition: 'box-shadow 0.2s',
  },
  featureIcon: (color) => ({
    width: 48, height: 48, borderRadius: 12,
    background: `${color}15`, color,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.4rem', marginBottom: 16,
  }),
  featureTitle: {
    fontSize: '1.15rem', fontWeight: 900,
    color: C.text, marginBottom: 8, letterSpacing: '-0.3px',
  },
  featureDesc: {
    fontSize: '0.9rem', color: C.muted, lineHeight: 1.7,
  },

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
    fontSize: '0.85rem', lineHeight: 1.7, color: C.text, margin: 0,
  },

  // ── CTA ──
  ctaBox: {
    background: 'white',
    border: '1px solid #e2e8f0',
    boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
    borderRadius: 24, padding: '48px 32px',
    textAlign: 'center', color: '#0d3a66',
    marginTop: 56,
  },
  ctaTitle: {
    fontSize: '1.6rem', fontWeight: 900,
    marginBottom: 10, letterSpacing: '-0.5px',
  },
  ctaDesc: {
    color: '#546e7a',
    fontSize: '0.95rem', marginBottom: 28,
    lineHeight: 1.6, maxWidth: 480, margin: '0 auto 28px',
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Callout({ type, icon, children }) {
  return (
    <div style={styles.callout(type)}>
      <Icon icon={icon} style={styles.calloutIcon(type)} />
      <p style={styles.calloutText}>{children}</p>
    </div>
  );
}

function FeatureCard({ icon, color, title, children }) {
  return (
    <div style={styles.featureCard}>
      <div style={styles.featureIcon(color)}>
        <Icon icon={icon} />
      </div>
      <div style={styles.featureTitle}>{title}</div>
      <div style={styles.featureDesc}>{children}</div>
    </div>
  );
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, padding: '16px 0' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 16, cursor: 'pointer',
          textAlign: 'left', padding: 0, color: C.text,
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
          fontSize: '0.88rem', color: C.muted,
          lineHeight: 1.75, marginTop: 12, paddingRight: 24,
        }}>
          {a}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SupabaseGuide({ onBack }) {
  return (
    <div style={styles.page}>

      {/* Nav */}
      <nav style={styles.nav}>
        <a href="/" style={styles.navLogo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '46px', height: '46px', background: 'linear-gradient(210deg, #0d3a66, #4770d6)', color: 'white', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
              <img
                src="/icon.svg"
                alt="tinypos"
                style={{ width: '50px', height: '50px', borderRadius: '10px', top: '-5px' }}
              />
            </div>
            <span style={styles.navLogoText}>tinypos</span>
          </div>
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
        <div style={styles.heroBadge}>
          <Icon icon="lucide:shield-check" />
          Tu nube privada
        </div>
        <h1 style={styles.heroTitle}>
          Tu negocio,<br />
          <span style={{ color: C.brand }}>tu propia nube segura</span>
        </h1>
        <p style={styles.heroSubtitle}>
          A diferencia de otros sistemas de punto de venta, tinypos conecta tu tienda a una
          base de datos que <strong>tú</strong> posees. Cero mensualidades, cero intermediarios,
          control total de tus datos.
        </p>
      </div>

      {/* Main content */}
      <div style={styles.main}>

        {/* Value Prop 1 — Own Your Data */}
        <div style={{ marginBottom: 32 }}>
          <p style={styles.sectionLabel}>Tu información, tus reglas</p>
          <h2 style={styles.sectionTitle}>Control total de tus datos</h2>
          <p style={styles.sectionDesc}>
            La mayoría de los sistemas de punto de venta guardan la información de tu negocio
            en sus servidores y te cobran por acceder a ella. Con tinypos es diferente:
            tu cuenta de Supabase es tuya, tus ventas son tuyas, tu historial y tus recetas son tuyos.
            Si algún día quieres irte, te llevas todo contigo.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <FeatureCard icon="lucide:database" color={C.blue} title="Tu base de datos">
              Las ventas, el inventario y los clientes viven en una cuenta gratuita de Supabase a tu nombre.
            </FeatureCard>
            <FeatureCard icon="lucide:user-check" color={C.green} title="Tú eres el dueño">
              Nadie más puede leer, vender ni bloquear el acceso a la información de tu negocio.
            </FeatureCard>
            <FeatureCard icon="lucide:download" color={C.brand} title="Portabilidad real">
              Exporta o migra tu historial completo cuando quieras. Sin contratos, sin candados.
            </FeatureCard>
          </div>
        </div>

        <hr style={styles.divider} />

        {/* Value Prop 2 — Zero-Touch Automation */}
        <div style={{ marginBottom: 32 }}>
          <p style={styles.sectionLabel}>Automatización completa</p>
          <h2 style={styles.sectionTitle}>Un clic. Cero configuración.</h2>
          <p style={styles.sectionDesc}>
            Olvídate de copiar llaves, ejecutar comandos o tocar un panel técnico.
            Cuando hagas clic en <strong>"Conectar"</strong>, tinypos prepara tu nube
            automáticamente — listo en menos de un minuto.
          </p>

          <div style={{
            background: C.greenLight, border: `1px solid #bbf7d0`,
            borderRadius: 12, padding: '22px 26px',
          }}>
            <div style={{ fontWeight: 800, marginBottom: 12, color: C.green, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon icon="lucide:sparkles" />
              Lo que hacemos por ti, en automático
            </div>
            <ul style={{ paddingLeft: 20, fontSize: '0.9rem', lineHeight: 2, color: C.text, margin: 0 }}>
              <li>Construimos todas las tablas (ventas, menú, inventario, clientes…)</li>
              <li>Configuramos las reglas de seguridad de tu base de datos</li>
              <li>Cargamos los datos iniciales de tu tienda</li>
              <li>Dejamos todo listo para vender desde el primer minuto</li>
            </ul>
          </div>
        </div>

        <hr style={styles.divider} />

        {/* Value Prop 3 — Enterprise Security */}
        <div style={{ marginBottom: 32 }}>
          <p style={styles.sectionLabel}>Seguridad de nivel empresarial</p>
          <h2 style={styles.sectionTitle}>Conexión segura con Supabase OAuth</h2>
          <p style={styles.sectionDesc}>
            Te conectas a Supabase de la misma forma en que inicias sesión con Google:
            mediante <strong>OAuth oficial</strong>. Tinypos nunca ve ni guarda tu contraseña maestra,
            y solo accede a tu proyecto durante los segundos que tarda la instalación.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
            <FeatureCard icon="lucide:key-round" color={C.blue} title="Sin contraseñas guardadas">
              Usamos OAuth oficial de Supabase. Tu contraseña maestra nunca pasa por nuestros servidores.
            </FeatureCard>
            <FeatureCard icon="lucide:timer" color={C.brand} title="Acceso temporal">
              El permiso se usa una sola vez para instalar la base de datos y se descarta inmediatamente después.
            </FeatureCard>
            <FeatureCard icon="lucide:lock" color={C.green} title="Cifrado siempre activo">
              Toda la comunicación viaja cifrada (TLS) y los datos se guardan cifrados en reposo.
            </FeatureCard>
          </div>

          <Callout type="tip" icon="lucide:info">
            Puedes revocar el acceso de tinypos a tu cuenta de Supabase en cualquier momento
            desde tu panel de Supabase. Tu base de datos seguirá funcionando con normalidad.
          </Callout>
        </div>

        <hr style={styles.divider} />

        {/* Value Prop 4 — Cost */}
        <div style={{ marginBottom: 32 }}>
          <p style={styles.sectionLabel}>Costo</p>
          <h2 style={styles.sectionTitle}>Tu ERP en la nube por <span style={{ color: C.green }}>$0</span></h2>
          <p style={styles.sectionDesc}>
            Supabase es <strong>100% gratis</strong> en su tier gratuito — y con margen de sobra
            para cualquier negocio pequeño o mediano. No pides tarjeta, no hay periodo de prueba,
            no hay cargos sorpresa.
          </p>

          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: '28px',
            display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: `${C.green}15`, color: C.green,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.8rem', flexShrink: 0,
            }}>
              <Icon icon="lucide:gift" />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 900, fontSize: '1.1rem', marginBottom: 6, color: C.text }}>
                Tier gratuito de Supabase
              </div>
              <div style={{ fontSize: '0.88rem', color: C.muted, lineHeight: 1.7 }}>
                500 MB de base de datos, 5 GB de transferencia mensual y respaldos automáticos —
                suficiente para años de operación de un negocio típico.
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <hr style={styles.divider} />
        <div>
          <p style={styles.sectionLabel}>Preguntas frecuentes</p>
          <h2 style={{ ...styles.sectionTitle, marginBottom: 24 }}>¿Tienes dudas?</h2>

          {[
            {
              q: '¿Necesito saber de tecnología?',
              a: 'No. Solo tienes que iniciar sesión con tu cuenta de Supabase. Tinypos se encarga del resto — no escribirás una sola línea de código ni tocarás ningún panel técnico.',
            },
            {
              q: '¿Qué tan privado es realmente?',
              a: 'Tu base de datos vive en una cuenta de Supabase a tu nombre. Tinypos no tiene acceso permanente a tu información — solo durante los segundos de la instalación inicial, mediante OAuth oficial.',
            },
            {
              q: '¿Puedo usarlo en varias tablets o computadoras?',
              a: 'Sí. Puedes vincular todos los dispositivos que necesites a la misma tienda y todos se sincronizan automáticamente.',
            },
            {
              q: '¿Funciona sin internet?',
              a: 'Sí. Tinypos sigue vendiendo aunque se caiga el internet — guarda todo localmente y sincroniza con tu nube en cuanto vuelve la conexión.',
            },
            {
              q: '¿Y si algún día quiero cambiarme?',
              a: 'Tu información es tuya. Como la base de datos vive en tu propia cuenta de Supabase, puedes exportar o migrar todo cuando quieras, sin pedir permiso a nadie.',
            },
          ].map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} />
          ))}
        </div>

        {/* CTA */}
        <div style={styles.ctaBox}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{ width: '68px', height: '68px', background: 'linear-gradient(210deg, #0d3a66, #4770d6)', color: 'white', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
              <img
                src="/icon.svg"
                alt="tinypos"
                style={{ width: '74px', height: '74px', borderRadius: '10px' }}
              />
            </div>
          </div>
          <h2 style={styles.ctaTitle}>Tu nube te está esperando</h2>
          <p style={styles.ctaDesc}>
            Un clic en <strong>Conectar</strong> y tendrás tu propia base de datos lista para vender.
          </p>
          <button
            style={styles.btnPrimary}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            onClick={onBack}
          >
            <Icon icon="lucide:rocket" />
            Entendido, ¡vamos!
          </button>
        </div>

      </div>
    </div>
  );
}
