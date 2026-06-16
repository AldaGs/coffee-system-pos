import { Icon } from '@iconify/react';
import { beginCloudUpgrade } from '../utils/appMode';

// Static "how to upgrade to a free Supabase backup" page. Reached from the
// upgrade nudge (UpgradeNagModal) and the General Settings upgrade card in local
// mode. A web page for now; a recorded video walkthrough will replace/supplement
// the steps later. Rendered via a path short-circuit in App.jsx (like /calculator),
// so it needs no router context.
export default function UpgradeGuide() {
  const steps = [
    {
      icon: 'lucide:user-plus',
      title: 'Crea una cuenta en Supabase',
      body: (
        <>Entra a <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: '#099b46', fontWeight: 700 }}>supabase.com</a> y regístrate gratis. Supabase es el servicio que guardará una copia de tus datos en la nube.</>
      ),
    },
    {
      icon: 'lucide:database',
      title: 'Crea un proyecto',
      body: 'Dentro de Supabase crea una organización y un proyecto nuevo. Anota la contraseña de la base de datos que te pida — la necesitarás una sola vez.',
    },
    {
      icon: 'lucide:link',
      title: 'Conéctalo a tinypos',
      body: 'Vuelve a tinypos y elige “Crear tu tienda con respaldo en la nube”. Sigue el asistente: instalará la base de datos y conectará tu proyecto.',
    },
    {
      icon: 'lucide:cloud-upload',
      title: 'Sube tus datos locales',
      body: 'Al conectar por primera vez, tinypos subirá automáticamente tu menú, ventas e inventario guardados en este dispositivo. Nada se pierde.',
    },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: '#fdfdfd', color: '#0d3a66', fontFamily: 'var(--font-main, system-ui)', overflowY: 'auto' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 5%', borderBottom: '1px solid #f0f0f0', background: 'white' }}>
        <button
          onClick={() => { window.location.href = '/'; }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#546e7a', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}
        >
          <Icon icon="lucide:arrow-left" /> Volver
        </button>
      </nav>

      <main style={{ maxWidth: '760px', margin: '0 auto', padding: 'clamp(32px, 6vw, 64px) 5%' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ width: '72px', height: '72px', background: 'rgba(9, 155, 70, 0.1)', color: '#099b46', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem', margin: '0 auto 20px' }}>
            <Icon icon="lucide:cloud-upload" />
          </div>
          <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.5px' }}>
            Respalda tus datos gratis
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#546e7a', margin: 0, lineHeight: 1.5 }}>
            Tu información vive solo en este dispositivo. En 4 pasos puedes crear una
            copia en la nube — sin costo y sin perder nada de lo que ya tienes.
          </p>
        </div>

        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {steps.map((s, i) => (
            <li key={i} style={{ display: 'flex', gap: '18px', background: 'white', border: '1px solid #f0f0f0', borderRadius: '18px', padding: '24px' }}>
              <div style={{ width: '48px', height: '48px', flexShrink: 0, background: 'rgba(13, 58, 102, 0.06)', color: '#0d3a66', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', position: 'relative' }}>
                <Icon icon={s.icon} />
                <span style={{ position: 'absolute', top: '-8px', left: '-8px', width: '24px', height: '24px', borderRadius: '50%', background: '#099b46', color: 'white', fontSize: '0.8rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              </div>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 800 }}>{s.title}</h3>
                <p style={{ margin: 0, color: '#546e7a', fontSize: '1rem', lineHeight: 1.55 }}>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div style={{ marginTop: '40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={beginCloudUpgrade}
            style={{ padding: '16px 40px', background: '#099b46', color: 'white', border: 'none', borderRadius: '14px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 12px rgba(5, 78, 35, 0.25)', display: 'inline-flex', alignItems: 'center', gap: '10px' }}
          >
            <Icon icon="lucide:cloud-upload" />
            Crear respaldo gratis ahora
          </button>
          <button
            onClick={() => { window.location.href = '/'; }}
            style={{ padding: '10px 24px', background: 'transparent', color: '#546e7a', border: 'none', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '4px' }}
          >
            Ahora no, seguir usando tinypos
          </button>
          <p style={{ marginTop: '4px', color: '#94a3b8', fontSize: '0.9rem' }}>
            Puedes hacer el respaldo cuando quieras — tus datos seguirán aquí.
          </p>
        </div>
      </main>
    </div>
  );
}
