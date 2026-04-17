function GeneralSettingsTab({ generalSettings, setGeneralSettings, handleAppLogoUpload, handleSaveGeneralSettings }) {
  return (
    <div>
      <h1 style={{ color: 'var(--text-main)' }}>General Settings</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Customize the look, feel, and security of your POS terminal.</p>
      <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Register Name</label>
          <input type="text" value={generalSettings.name} onChange={(e) => setGeneralSettings({ ...generalSettings, name: e.target.value })} placeholder="e.g., Front Counter iPad" style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Primary Brand Color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input type="color" value={generalSettings.brandColor} onChange={(e) => setGeneralSettings({ ...generalSettings, brandColor: e.target.value })} style={{ width: '60px', height: '50px', border: 'none', cursor: 'pointer', padding: 0, borderRadius: '8px', overflow: 'hidden' }} />
            <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '1.1rem' }}>{generalSettings.brandColor.toUpperCase()}</span>
          </div>

          {/* --- NEW BRANDING SECTION --- */}
          <h3 style={{ marginTop: '16px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>App Branding</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>App Loading Screen Logo (Color PNG/JPG)</label>
            <input type="file" accept="image/*" onChange={handleAppLogoUpload} style={{ padding: '8px', color: 'var(--text-main)' }} />
            
            {generalSettings.appBootLogo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                <img 
                  src={generalSettings.appBootLogo} 
                  alt="App Boot Logo" 
                  style={{ maxHeight: '100px', objectFit: 'contain', background: 'var(--bg-main)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} 
                />
                <button 
                  onClick={() => setGeneralSettings({ ...generalSettings, appBootLogo: null })} 
                  style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}
                >
                  Remove App Logo
                </button>
              </div>
            )}
            <small style={{ color: 'var(--text-muted)' }}>This logo is used strictly for the app's loading screen and browser tab. It will not be printed.</small>
          </div>
          {/* ----------------------------- */}

        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Color Theme</label>
          <select value={generalSettings.isDarkMode} onChange={(e) => setGeneralSettings({ ...generalSettings, isDarkMode: e.target.value === 'true' })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
            <option value={false}>☀️ Light Mode</option>
            <option value={true}>🌙 Dark Mode</option>
          </select>
        </div>
        <h3 style={{ marginTop: '16px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Security</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Auto-Lock Timer (Minutes)</label>
          <input type="number" min="0" value={generalSettings.autoLockMinutes} onChange={(e) => setGeneralSettings({ ...generalSettings, autoLockMinutes: parseInt(e.target.value) || 0 })} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          <small style={{ color: 'var(--text-muted)' }}>If the register is not touched for this many minutes, it will require a PIN. Set to 0 to turn off.</small>
        </div>

        <h3 style={{ marginTop: '16px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Team Workflow</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Ticket Visibility Mode</label>
          <select
            value={generalSettings.ticketVisibility || 'open'}
            onChange={(e) => setGeneralSettings({ ...generalSettings, ticketVisibility: e.target.value })}
            style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
          >
            <option value="open">Open Floor (Everyone sees all active tickets)</option>
            <option value="isolated">Isolated (Staff only see their own tickets)</option>
          </select>
          <small style={{ color: 'var(--text-muted)' }}>Isolated mode is great for traditional waiters who manage their own specific tables/orders.</small>
        </div>

        <h3 style={{ marginTop: '16px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Order Numbers</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Auto-Reset Frequency</label>
          <select
            value={generalSettings.orderResetPolicy || 'daily'}
            onChange={(e) => setGeneralSettings({ ...generalSettings, orderResetPolicy: e.target.value })}
            style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
          >
            <option value="never">Never Reset (Count infinitely)</option>
            <option value="daily">Daily (Resets to #1 every morning)</option>
            <option value="weekly">Weekly (Resets every Monday)</option>
            <option value="monthly">Monthly (Resets 1st of the month)</option>
            <option value="yearly">Yearly (Resets Jan 1st)</option>
          </select>
          <small style={{ color: 'var(--text-muted)' }}>How often should the ticket numbers go back to Order #1?</small>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Manual Override</label>
          <button
            onClick={() => {
              if (window.confirm("Are you sure? This will force the next ticket to be Order #1.")) {
                localStorage.setItem('tinypos_nextOrderNum', 1);
                window.confirm("Done! The next ticket will be #1.");
              }
            }}
            style={{ padding: '12px', background: 'transparent', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: 'fit-content' }}
          >
            Force Reset to #1 Now
          </button>
        </div>

        <h3 style={{ marginTop: '16px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Shift Management</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Enable "Corte de Caja" (End of Shift)</label>
          <select
            value={generalSettings.enableCorte !== false}
            onChange={(e) => setGeneralSettings({ ...generalSettings, enableCorte: e.target.value === 'true' })}
            style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
          >
            <option value={true}>Yes - Show the Corte button</option>
            <option value={false}>No - Hide shift management</option>
          </select>
          <small style={{ color: 'var(--text-muted)' }}>Turn this off if the café does not reconcile the cash drawer per shift.</small>
        </div>

        <h3 style={{ marginTop: '16px', marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Hardware</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Thermal Printer Size</label>
          <select
            value={generalSettings.printerSize || '80mm'}
            onChange={(e) => setGeneralSettings({ ...generalSettings, printerSize: e.target.value })}
            style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
          >
            <option value="80mm">Standard (80mm)</option>
            <option value="58mm">Narrow (58mm)</option>
          </select>
          <small style={{ color: 'var(--text-muted)' }}>Adjusts the receipt layout to prevent text from being cut off on smaller printers.</small>
        </div>

        <button onClick={handleSaveGeneralSettings} style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '16px', fontSize: '1.1rem' }}>Save General Settings</button>
      </div>
    </div>
  );
}

export default GeneralSettingsTab;
