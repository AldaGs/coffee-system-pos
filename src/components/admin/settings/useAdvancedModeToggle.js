import { useState } from 'react';
import { useMenuStore } from '../../../store/useMenuStore';
import { updateDiscountRule } from '../../../api/menu';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';
import { useFlash } from '../../../hooks/useFlash';

// Switching Advanced mode needs a manager PIN. Turning it off also turns off
// loyalty and every discount rule (Lite mode has neither), after a warning.
export function useAdvancedModeToggle({ generalSettings, setGeneralSettings, menuData, saveSettingsToCloud, setLoyaltyForm }) {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const [pinChallenge, setPinChallenge] = useState({ isOpen: false, onAuthorized: null });
  const [pinAttempt, setPinAttempt] = useState('');
  const [pinError, flashPinError, setPinError] = useFlash(500);

  const closePinChallenge = () => {
    setPinChallenge({ isOpen: false, onAuthorized: null });
    setPinAttempt('');
    setPinError(false);
  };

  // Cashier PINs aren't kept in memory, so anything but the master PIN goes through verify_pin.
  const handlePinSubmit = async () => {
    const authorized = pinAttempt === generalSettings.pinCode
      || !!(await useMenuStore.getState().verifyAuthorizerPin(pinAttempt, 'admin'));
    if (!authorized) {
      flashPinError();
      setPinAttempt('');
      return;
    }
    const action = pinChallenge.onAuthorized;
    closePinChallenge();
    if (action) action();
  };

  const handleAdvancedModeToggle = () => {
    const next = !generalSettings.isAdvancedMode;
    const applyChange = (alsoDeactivate) => setPinChallenge({
      isOpen: true,
      onAuthorized: async () => {
        setGeneralSettings({ ...generalSettings, isAdvancedMode: next });
        if (!alsoDeactivate || !menuData) return;
        // Loyalty lives in shop settings; discount rules are menu rows written one by one.
        saveSettingsToCloud({
          ...menuData,
          loyaltySettings: { ...(menuData.loyaltySettings || {}), isActive: false },
          discountRules: (menuData.discountRules || []).map((r) => ({ ...r, isActive: false })),
        });
        await Promise.all((menuData.discountRules || [])
          .filter((r) => r._id && r.isActive)
          .map((r) => updateDiscountRule(r._id, { ...r, isActive: false })));
        if (setLoyaltyForm) setLoyaltyForm((prev) => ({ ...prev, isActive: false }));
      },
    });

    if (next === false) {
      const loyaltyOn = !!menuData?.loyaltySettings?.isActive;
      const activeRules = (menuData?.discountRules || []).filter((r) => r.isActive);
      if (loyaltyOn || activeRules.length > 0) {
        const lines = [];
        if (loyaltyOn) lines.push('• ' + t('settings.willDisableLoyalty'));
        if (activeRules.length > 0) lines.push('• ' + t('settings.willDisableRules').replace('{{n}}', activeRules.length));
        showConfirm(t('settings.liteWarnTitle'), t('settings.liteWarnDesc') + '\n\n' + lines.join('\n'), () => applyChange(true));
        return;
      }
    }
    applyChange(false);
  };

  return { pinChallenge, pinAttempt, setPinAttempt, pinError, setPinError, closePinChallenge, handlePinSubmit, handleAdvancedModeToggle };
}
