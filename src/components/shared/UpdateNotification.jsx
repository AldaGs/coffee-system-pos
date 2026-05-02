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

  // If there is no new update waiting, render absolutely nothing
  if (!needRefresh) return null;

  return (
    <div className="fade-in" style={{
      position: 'fixed',
      bottom: '30px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'var(--bg-surface)',
      border: '2px solid var(--brand-color)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
      padding: '24px',
      borderRadius: '20px',
      zIndex: 99999, // Sits above absolutely everything
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      width: '90%',
      maxWidth: '380px',
      textAlign: 'center'
    }}>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-main)' }}>
        <Icon icon="lucide:download-cloud" style={{ color: 'var(--brand-color)', fontSize: '1.8rem' }} />
        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900' }}>¡Nueva Actualización!</h3>
      </div>
      
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.4' }}>
        Se ha descargado una nueva versión de tinypos. Reinicia para aplicar los cambios y las nuevas funciones.
      </p>

      <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
        <button 
          onClick={() => setNeedRefresh(false)}
          style={{ flex: 1, padding: '14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Ignorar
        </button>
        <button 
          onClick={() => updateServiceWorker(true)}
          style={{ flex: 1, padding: '14px', background: 'var(--brand-color)', border: 'none', borderRadius: '12px', color: 'white', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(52, 152, 219, 0.3)' }}
        >
          Reiniciar Ahora
        </button>
      </div>
    </div>
  );
}