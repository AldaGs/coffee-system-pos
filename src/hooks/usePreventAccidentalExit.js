import { useEffect } from 'react';

// Blocks accidental refresh/close and mobile swipe-back navigation.
// Active only while the calling component is mounted — attach it on the
// Register and Admin screens so Setup/Landing/device-login remain unaffected.
export function usePreventAccidentalExit() {
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);
}
