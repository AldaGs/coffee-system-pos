import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../supabaseClient';
import { isLocalMode } from '../../../utils/appMode';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';
import { useMenuStore } from '../../../store/useMenuStore';

// Cloud sign-in plus the admin PIN lock. Local mode was already unlocked by
// LocalAuthGate, so it starts authenticated; the PIN gate still applies.
export function useAdminSession() {
  const navigate = useNavigate();
  const { showAlert } = useDialog();
  const { t } = useTranslation();
  const menuData = useMenuStore((s) => s.menuData);

  const [isAuthenticated, setIsAuthenticated] = useState(isLocalMode());
  // Gates the login form until getSession() resolves, so a signed-in user doesn't see it flash.
  const [isCheckingSession, setIsCheckingSession] = useState(!isLocalMode());
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // strictAdminAccess: only an 'admin' cashier may stay on this page, re-checked when settings change.
  useEffect(() => {
    if (!menuData?.posSettings?.strictAdminAccess) return;
    let active = null;
    try {
      const raw = localStorage.getItem('tinypos_activeCashier');
      if (raw) active = JSON.parse(raw);
    } catch { /* noop */ }
    const role = active?.role || (active?.isAdmin ? 'admin' : 'employee');
    if (role !== 'admin') navigate('/', { replace: true });
  }, [menuData, navigate]);

  useEffect(() => {
    if (isLocalMode() || !supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsAuthenticated(true);
      setIsCheckingSession(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.auth.signInWithPassword(loginForm);
      if (error) throw error;
      setIsAuthenticated(true);
    } catch (error) {
      showAlert(t('admin.loginFailed'), error.message);
      setLoginForm({ ...loginForm, password: '' });
    }
  };

  const handleLogout = async () => {
    if (!isLocalMode() && supabase) await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

  const handleBackToRegister = () => {
    setIsAdminUnlocked(false);
    setAdminPinInput('');
    navigate('/');
  };

  const handleUnlock = async () => {
    try {
      if (await useMenuStore.getState().verifyAdminPin(adminPinInput)) {
        setIsAdminUnlocked(true);
        setPinError(false);
      } else {
        setPinError(true);
        setAdminPinInput('');
      }
    } catch (err) {
      showAlert(t('admin.error'), err.message);
      setAdminPinInput('');
    }
  };

  return {
    isAuthenticated, isCheckingSession, loginForm, setLoginForm, handleLogin, handleLogout,
    isAdminUnlocked, adminPinInput, setAdminPinInput, pinError, setPinError, handleUnlock, handleBackToRegister,
  };
}
