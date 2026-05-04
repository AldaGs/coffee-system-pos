import { useEffect } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import SharedPinPad from '../shared/SharedPinPad';

function PinChallengeModal({ pinChallenge, setPinChallenge, challengePinAttempt, setChallengePinAttempt, challengeError, setChallengeError, handleChallengeSubmit }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!pinChallenge.isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        setChallengePinAttempt(prev => prev.length < 4 ? prev + e.key : prev);
      } else if (e.key === 'Backspace') {
        setChallengePinAttempt(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault(); // 🛑 Kills the "Ghost Click" on background buttons
        if (challengePinAttempt.length === 4) handleChallengeSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault(); // 🛑 Prevents background actions
        setPinChallenge({ isOpen: false, title: "", onAuthorized: null });
        setChallengePinAttempt('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinChallenge.isOpen, challengePinAttempt, handleChallengeSubmit, setChallengePinAttempt, setPinChallenge]);

  if (!pinChallenge.isOpen) return null;

  return (
    <SharedPinPad
      variant="modal"
      title={pinChallenge.title}
      subtitle={t('pin.managerReq')}
      icon="lucide:shield-alert"
      pin={challengePinAttempt}
      setPin={setChallengePinAttempt}
      error={challengeError}
      setError={setChallengeError}
      onSubmit={handleChallengeSubmit}
      onCancel={() => { 
        setPinChallenge({ isOpen: false, title: "", onAuthorized: null }); 
        setChallengePinAttempt(''); 
      }}
      submitText={t('pin.btnVerify')}
      submitIcon="lucide:check-circle"
    />
  );
}

export default PinChallengeModal;