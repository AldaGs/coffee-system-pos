import { useTranslation } from '../../hooks/useTranslation';
import SharedPinPad from '../shared/SharedPinPad';

function PinChallengeModal({ pinChallenge, setPinChallenge, challengePinAttempt, setChallengePinAttempt, challengeError, setChallengeError, handleChallengeSubmit }) {
  const { t } = useTranslation();

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