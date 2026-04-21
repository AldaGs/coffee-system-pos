import React from 'react';

export default function ExportKeysButton() {
  
  const handleExport = () => {
    // 1. Grab the active keys from the device's local memory
    const url = localStorage.getItem('tinypos_supabase_url');
    const key = localStorage.getItem('tinypos_supabase_anon_key');

    if (!url || !key) {
      alert("No store connection found on this device!");
      return;
    }

    // 2. Package and encode the data (Base64)
    const data = JSON.stringify({ url, key });
    const encoded = btoa(data); 
    const blob = new Blob([encoded], { type: "text/plain" });

    // 3. Trigger the stealth download
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    
    // You can customize this name!
    link.download = "my-shop-keys.tiny"; 
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #eee', borderRadius: '12px', backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
      <h3 style={{ margin: '0 0 8px 0', color: '#2c3e50' }}>Device Provisioning</h3>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '16px' }}>
        Download your store's secure connection file to quickly set up other tablets or phones without typing passwords.
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
        <span>⬇️</span> Download keys.tiny
      </button>
    </div>
  );
}