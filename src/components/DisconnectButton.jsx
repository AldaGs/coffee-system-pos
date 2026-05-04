import React from 'react';
import { supabase } from '../supabaseClient';
import { useDialog } from '../hooks/useDialog';
import { useTranslation } from '../hooks/useTranslation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db'; 

export default function DisconnectButton() {
  const { showConfirm, showAlert } = useDialog();
  const { t } = useTranslation();

  // 1. Check for unsynced offline data
  // Note: Change 'syncQueue' if your Dexie table for offline items is named differently!
  const unsyncedCount = useLiveQuery(() => {
    if (db.syncQueue) return db.syncQueue.count();
    return 0; 
  }, []) || 0;

  const handleDisconnect = async () => {
    // 2. THE SAFETY GATE: Prevent deleting unsaved offline money!
    if (unsyncedCount > 0) {
      return showAlert(
        "¡Advertencia de Datos Offline!", 
        `Tienes ${unsyncedCount} registros pendientes de sincronizar. Conéctate a internet para que se guarden en la nube antes de desconectar el equipo.`
      );
    }

    showConfirm(
      t('settings.disconnectTitle', '¿Desconectar y Limpiar Dispositivo?'), 
      t('settings.disconnectConfirm', 'Esto borrará TODO el historial local, menú en caché, configuraciones y sesión. El dispositivo quedará como de fábrica.'), 
      async () => {
        try {
          // A. Sign out of Supabase (kills the session token)
          if (supabase) await supabase.auth.signOut();

          // B. Wipe IndexedDB (Dexie) completely
          await db.delete();
          await db.open(); // Re-open empty so the app doesn't crash on reload

          // C. Wipe ALL TinyPOS LocalStorage (The Zombie State killer)
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('tinypos_')) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key));

        } catch (err) {
          console.error("Disconnect Error:", err);
          showAlert(t('settings.disconnectErrorTitle'), t('settings.disconnectErrorDesc', 'Hubo un problema limpiando el dispositivo.'));
        } finally {
          // D. Hard Reload the browser to clear React/Zustand memory
          window.location.replace('/');
        }
    });
  };

  return (
    <button
      onClick={handleDisconnect}
      style={{ 
        width: '100%',
        padding: '12px 24px', 
        backgroundColor: '#e74c3c', 
        color: 'white', 
        border: 'none', 
        borderRadius: '8px', 
        cursor: 'pointer', 
        fontWeight: 'bold' 
      }}
    >
      {t('settings.btnDisconnect')}
    </button>
  );
}