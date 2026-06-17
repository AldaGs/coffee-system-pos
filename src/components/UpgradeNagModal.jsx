import { Icon } from '@iconify/react';
import { useUpgradeNagStore } from '../store/useUpgradeNagStore';

// Local-mode upgrade nudge. Shown when the engagement milestones in upgradeNag.js
// fire. Leads with "back up your data" (the strongest argument, since local data
// is unrecoverable) and links to the tutorial page. Self-contained: reads the
// store, renders nothing when closed.
export default function UpgradeNagModal() {
  const isOpen = useUpgradeNagStore((s) => s.isOpen);
  const close = useUpgradeNagStore((s) => s.close);
  const dismissForever = useUpgradeNagStore((s) => s.dismissForever);

  if (!isOpen) return null;

  const goToGuide = () => {
    close();
    window.location.href = '/upgrade-guide';
  };

  return (
    <div
      onClick={close}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: '20px', animation: 'fadeIn 0.2s ease' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--bg-surface)', borderRadius: '24px', padding: '32px', maxWidth: '460px', width: '100%', boxShadow: '0 30px 80px rgba(0,0,0,0.3)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '18px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: 'rgba(52, 152, 219, 0.12)', color: '#3498db', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
            <Icon icon="lucide:cloud-upload" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: 'var(--text-main)' }}>
              Respalda tu negocio
            </h2>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
              ¡Vas muy bien! Pongamos tus datos a salvo.
            </p>
          </div>
        </div>

        <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.98rem', lineHeight: 1.5 }}>
          Ahora mismo tus ventas, menú e inventario viven <strong>solo en este dispositivo</strong>.
          Si borras el navegador o lo cambias, se pierden. Crea una cuenta gratuita
          de Supabase para respaldarlos y verlos desde otros dispositivos — sin costo.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          <button
            onClick={goToGuide}
            style={{ padding: '16px', background: '#099b46', color: 'white', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: '900', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <Icon icon="lucide:book-open" />
            Ver cómo (tutorial)
          </button>
          <button
            onClick={close}
            style={{ padding: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '12px', cursor: 'pointer', fontWeight: '700', fontSize: '0.95rem' }}
          >
            Ahora no
          </button>
          <button
            onClick={dismissForever}
            style={{ padding: '6px', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            No volver a mostrar
          </button>
        </div>
      </div>
    </div>
  );
}
