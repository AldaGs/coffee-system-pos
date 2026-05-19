import { useCallback, useState } from 'react';

// Owns the "intercept a privileged action behind a PIN" state. The actual
// PIN entry UI and verification live inside PinChallengeModal; this hook only
// tracks which action (if any) is currently waiting on authorization.
//
// API:
//   requirePin(title, onAuthorized, options?)
//     title         - heading shown in the modal
//     onAuthorized  - called with the authorizer cashier object on success.
//                     Existing callers that ignore the arg keep working.
//     options.minRole - minimum role allowed to authorize.
//                       'admin' (default, current behavior) | 'manager'.
//                       Used by strictRegisterOverrides to accept managers
//                       on refund/void/expense/manual-discount.
export function usePinChallenge() {
  const [challenge, setChallenge] = useState({ isOpen: false, title: '', onAuthorized: null, minRole: 'admin' });

  const requirePin = useCallback((title, onAuthorized, options = {}) => {
    setChallenge({
      isOpen: true,
      title,
      onAuthorized,
      minRole: options.minRole || 'admin',
    });
  }, []);

  return { challenge, setChallenge, requirePin };
}
