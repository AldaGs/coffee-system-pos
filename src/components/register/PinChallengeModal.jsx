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
    const { verifyPin, verifyAdminPin } = useMenuStore.getState();
    try {
      const isCashierMatch = await verifyPin(activeCashier?.id, pinAttempt);
      const isStaffAdmin = await verifyAdminPin(pinAttempt);
      if (isCashierMatch || isStaffAdmin) {
        attempts.current = 0;
        const cb = challenge.onAuthorized;
        close();
        cb?.();
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

  return (
    <SharedPinPad
      variant="modal"
      title={challenge.title}
      subtitle={t('pin.managerReq')}
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
