import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useDialog } from '../contexts/DialogContext';

export default function ExportKeysButton() {
  const { t } = useTranslation();
  const { showAlert } = useDialog();

  const handleExport = () => {
    const url = localStorage.getItem('tinypos_supabase_url');
    const key = localStorage.getItem('tinypos_supabase_anon_key');

    if (!url || !key) {
      showAlert(t('settings.alertNoConnectionTitle'), t('settings.alertNoConnectionDesc'));
      return;
    }

    const data = JSON.stringify({ url, key });
    const encoded = btoa(data);
    const blob = new Blob([encoded], { type: "text/plain" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "my-shop-keys.tiny";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #eee', borderRadius: '12px', backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
      <h3 style={{ margin: '0 0 8px 0', color: '#2c3e50' }}>{t('settings.deviceProvisioning')}</h3>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '16px' }}>
        {t('settings.deviceProvisioningDesc')}
      </p>

      <button
        onClick={handleExport}
        style={{
          padding: '12px 24px',
          backgroundColor: '#3498db',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <span>⬇️</span> {t('settings.btnDownloadKeys')}
      </button>
    </div>
  );
}
