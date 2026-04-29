import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from '@iconify/react';

export default function UpdateNotification() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error) {
      console.error('SW Registration Error', error);
    },
  });

  // If there is no update waiting, render nothing
  if (!needRefresh) return null;

  return (
    <div className="fade-in" style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'var(--bg-surface, #ffffff)',
      border: '1px solid var(--brand-color, #f28b05)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
      padding: '20px',
      borderRadius: '16px',
      zIndex: 9999, // Make sure it sits above EVERYTHING
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      width: '90%',
      maxWidth: '350px',
      textAlign: 'center'
    }}>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-main)' }}>
        <Icon icon="lucide:download-cloud" style={{ color: 'var(--brand-color)', fontSize: '1.5rem' }} />
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800' }}>¡Nueva Actualización!</h3>
      </div>
      
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.4' }}>
        Se ha descargado una nueva versión de TinyPOS. Reinicia para aplicar los cambios.
      </p>

      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
        <button 
          onClick={() => setNeedRefresh(false)}
          style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Ignorar
        </button>
        <button 
          onClick={() => updateServiceWorker(true)}
          style={{ flex: 1, padding: '12px', background: 'var(--brand-color)', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Reiniciar Ahora
        </button>
      </div>

    </div>
  );
}