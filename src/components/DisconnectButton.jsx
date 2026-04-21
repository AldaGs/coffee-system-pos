import React from 'react';
import { supabase } from '../supabaseClient'; 
// 1. Import your dialog hook (adjust the path if necessary!)
import { useDialog } from '../contexts/DialogContext'; 

export default function DisconnectButton() {
  // 2. Pull showConfirm from your context
  const { showConfirm } = useDialog(); 
  
  const handleDisconnect = async () => {
    // 3. Await your custom UI dialog instead of window.confirm
    const confirmMessage = "You will need your keys.tiny file to reconnect this device."

    showConfirm("Disconnect Device", confirmMessage, async () => {
        try {
            // 1. Sign out of Supabase
            if (supabase) await supabase.auth.signOut();
            
            // 2. Wipe Connection Keys
            localStorage.removeItem('tinypos_supabase_url');
            localStorage.removeItem('tinypos_supabase_anon_key');
            
            // 3. Wipe Caches
            localStorage.removeItem('tinypos_cached_menu');
            localStorage.removeItem('tinypos_cached_recipes');            
        } catch (err) {
            showAlert("Database Error","Error disconnecting:", err);
        } finally {
        // 4. Force reload back to landing page
            window.location.href = '/';
        }
      });
  };

  return (
    <button 
      onClick={handleDisconnect}
      style={{ padding: '12px 24px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
    >
      Disconnect Device from Store
    </button>
  );
}