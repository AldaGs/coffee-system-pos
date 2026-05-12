import { useCallback, useState } from 'react';

// Owns the "intercept a privileged action behind a PIN" state. The actual
// PIN entry UI and verification live inside PinChallengeModal; this hook only
// tracks which action (if any) is currently waiting on authorization.
export function usePinChallenge() {
  const [challenge, setChallenge] = useState({ isOpen: false, title: '', onAuthorized: null });

  const requirePin = useCallback((title, onAuthorized) => {
    setChallenge({ isOpen: true, title, onAuthorized });
  }, []);

  return { challenge, setChallenge, requirePin };
}
