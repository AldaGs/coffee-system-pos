import React from 'react';
import { supabase } from '../supabaseClient';
import { useDialog } from '../hooks/useDialog';
import { useTranslation } from '../hooks/useTranslation';
import { Icon } from '@iconify/react';

export default function SignOutButton({ variant = 'default' }) {
  const { showConfirm } = useDialog();
  const { t } = useTranslation();

  const handleSignOut = async () => {
    showConfirm(
      t('settings.signOutTitle', 'Sign Out of Store Account?'),
      t('settings.signOutConfirm', 'Your session will be closed, but your offline data will be kept safe. You will need to log in again to resume syncing.'),
      async () => {
        try {
          if (supabase) {
            await supabase.auth.signOut();
            // App.jsx listener will handle the redirect
            window.location.replace('/');
          }
        } catch (err) {
          console.error("SignOut Error:", err);
        }
      }
    );
  };

  const styleDefault = {
    width: '100%',
    padding: '12px 24px',
    backgroundColor: '#f39c12', // Amber/Orange for warning/action
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '1rem',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
  };

  const styleOutline = {
    width: '100%',
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: '#f39c12',
    border: '2px solid #f39c12',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '0.9rem',
    marginTop: '10px'
  };

  return (
    <button
      onClick={handleSignOut}
      style={variant === 'outline' ? styleOutline : styleDefault}
    >
      <Icon icon="lucide:log-out" />
      {t('settings.btnSignOut', 'Sign Out & Re-authorize')}
    </button>
  );
}
