import { useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useMenuStore } from '../../store/useMenuStore';
import SharedPinPad from '../shared/SharedPinPad';

// Self-contained PIN challenge. Owns the attempt input, shake feedback, and
// verification call so Register doesn't have to coordinate four parallel
// pieces of state for one modal.
function PinChallengeModal({ challenge, setChallenge, activeCashier, showAlert }) {
  const { t } = useTranslation();
  const [pinAttempt, setPinAttempt] = useState('');
  const [shake, setShake] = useState(false);
  const attempts = useRef(0);

  if (!challenge.isOpen) return null;

  const close = () => {
    setChallenge({ isOpen: false, title: '', onAuthorized: null });
    setPinAttempt('');
  };

  const handleSubmit = async () => {
    const { verifyPin, verifyAuthorizerPin } = useMenuStore.getState();
    const minRole = challenge.minRole || 'admin';
    try {
      // Self-PIN always works for the active cashier (no role escalation).
      const isCashierMatch = await verifyPin(activeCashier?.id, pinAttempt);
      // Then try authorizer match at the required role. Returns the cashier
      // on success so the action callback can record who authorized it.
      const authorizer = isCashierMatch ? null : await verifyAuthorizerPin(pinAttempt, minRole);
      if (isCashierMatch || authorizer) {
        attempts.current = 0;
        const cb = challenge.onAuthorized;
        close();
        // Pass the authorizer (or null for self-PIN) so callers can log the override.
        cb?.(authorizer || null);
      } else {
        attempts.current += 1;
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPinAttempt('');
      }
    } catch (err) {
      showAlert(t('security.pinErrorTitle'), err.message);
      setPinAttempt('');
    }
  };

  // Manager-override flow gets a different subtitle so cashiers know who
  // they're supposed to summon.
  const subtitle = (challenge.minRole === 'manager') ? t('pin.managerOrAdminReq') : t('pin.managerReq');

  return (
    <SharedPinPad
      variant="modal"
      title={challenge.title}
      subtitle={subtitle}
      icon="lucide:shield-alert"
      pin={pinAttempt}
      setPin={setPinAttempt}
      error={shake}
      setError={setShake}
      onSubmit={handleSubmit}
      onCancel={close}
      submitText={t('pin.btnVerify')}
      submitIcon="lucide:check-circle"
    />
  );
}

export default PinChallengeModal;
