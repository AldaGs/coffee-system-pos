import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { useMenuStore } from '../../../store/useMenuStore';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';
import { isLocalMode } from '../../../utils/appMode';
import { logActivity } from '../../../services/activityService';

// Only these keys live in shop_settings.menu_data; the menu itself has its own tables.
const settingsOnly = (menu) => ({
  cashiers: menu.cashiers,
  posSettings: menu.posSettings,
  receiptSettings: menu.receiptSettings,
  loyaltySettings: menu.loyaltySettings,
});

const readImage = (e, onLoad) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onloadend = () => onLoad(reader.result);
  reader.readAsDataURL(file);
};

// Receipt, general and loyalty settings, and the team (cashiers and their PINs).
export function useSettingsActions({ setIsSaving, receiptForm, setReceiptForm, generalSettings, setGeneralSettings, loyaltyForm }) {
  const menuData = useMenuStore((s) => s.menuData);
  const setMenuData = useMenuStore((s) => s.setMenuData);
  const { showAlert, showConfirm } = useDialog();
  const { t } = useTranslation();
  const [newCashier, setNewCashier] = useState({ name: '', pin: '', role: 'employee' });
  // Seeded at onboarding; no default cashier, so a new store never ships a guessable PIN.
  const cashiers = menuData?.cashiers || [];

  const saveSettingsToCloud = async (updatedMenu) => {
    setIsSaving(true);
    try {
      if (isLocalMode()) {
        // No shop_settings table: PINs go to the hashed local store (id 0 is the master PIN).
        const { setLocalPin } = await import('../../../utils/localAuth');
        if (updatedMenu.posSettings?.pinCode) await setLocalPin(0, updatedMenu.posSettings.pinCode);
        for (const c of (updatedMenu.cashiers || [])) {
          if (c?.pin) await setLocalPin(c.id, c.pin);
        }
        setMenuData(updatedMenu);
        return true;
      }
      const { error } = await supabase.from('shop_settings').update({ menu_data: settingsOnly(updatedMenu) }).eq('id', 1);
      if (error) throw error;
      setMenuData(updatedMenu);
      return true;
    } catch (error) {
      showAlert(t('common.error'), t('admin.cloudSaveFailPrefix') + error.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = (e) => readImage(e, (logo) => setReceiptForm({ ...receiptForm, logo }));
  const handleAppLogoUpload = (e) => readImage(e, (appBootLogo) => setGeneralSettings({ ...generalSettings, appBootLogo }));

  const handleSaveReceipt = () => {
    saveSettingsToCloud({ ...menuData, receiptSettings: receiptForm });
    logActivity('settings_updated', null, { section: 'receipt' });
    showAlert(t('common.success'), t('receipt.saveSuccessDesc'));
  };

  const handleSaveGeneralSettings = async () => {
    setIsSaving(true);
    try {
      const updatedMenu = { ...menuData, posSettings: generalSettings };
      const { error } = await supabase.from('shop_settings').update({ menu_data: settingsOnly(updatedMenu) }).eq('id', 1);
      if (error) throw error;
      setMenuData(updatedMenu);

      // The boot screen and favicon read the logo from localStorage before the app loads.
      if (generalSettings.appBootLogo) {
        localStorage.setItem('tinypos_boot_logo', generalSettings.appBootLogo);
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = generalSettings.appBootLogo;
      }

      logActivity('settings_updated', null, { section: 'general' });
      showAlert(t('common.success'), t('settings.saveSuccessDesc'));
    } catch (err) {
      console.error(err);
      showAlert(t('common.error'), t('admin.cloudSaveFailPrefix') + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLoyalty = () => {
    if (loyaltyForm.isActive) {
      if (loyaltyForm.visitsRequired < 1) return showAlert(t('common.error'), t('loyalty.visitsRequiredErr'));
      if (!loyaltyForm.rewardDescription?.trim()) return showAlert(t('common.error'), t('loyalty.rewardRequiredErr'));
    }
    saveSettingsToCloud({ ...menuData, loyaltySettings: loyaltyForm });
    logActivity('settings_updated', null, { section: 'loyalty' });
    showAlert(t('common.success'), t('loyalty.saveSuccessDesc'));
  };

  const handleResetLoyaltyData = () => {
    showConfirm(t('loyalty.deleteTitle') || 'Wipe Loyalty Data?', t('loyalty.resetWarning'), async () => {
      try {
        setIsSaving(true);
        const { error } = await supabase.from('customers').update({ visits: 0, completed_at: null }).not('phone', 'is', null);
        if (error) throw error;
        showAlert(t('common.success'), t('loyalty.wipedMsg'));
      } catch (err) {
        showAlert(t('admin.dbError'), t('admin.dbResetFailPrefix') + err.message);
      } finally {
        setIsSaving(false);
      }
    });
  };

  // `role` is the source of truth; `isAdmin` mirrors it for older readers.
  const handleAddCashier = async () => {
    if (!newCashier.name || newCashier.pin.length !== 4) {
      return showAlert(t('team.invalidInfoTitle'), t('team.invalidInfoDesc'));
    }
    const role = newCashier.role || 'employee';
    const entry = { id: Date.now(), name: newCashier.name, pin: newCashier.pin, role, isAdmin: role === 'admin' };
    const updatedMenu = { ...menuData };
    updatedMenu.cashiers.push(entry);
    saveSettingsToCloud(updatedMenu);

    // Without the hashed PIN row, verify_pin rejects the new cashier's own PIN.
    const { error: pinErr } = await supabase.rpc('set_cashier_pin', { p_cashier_id: entry.id, p_pin: newCashier.pin });
    if (pinErr) showAlert(t('common.error'), pinErr.message);

    logActivity('cashier_added', null, { name: newCashier.name, cashierId: entry.id, role });
    setNewCashier({ name: '', pin: '', role: 'employee' });
  };

  const handleDeleteCashier = (idToRemove) => {
    if (cashiers.length <= 1) return showAlert(t('common.error'), t('team.cannotDeleteLast'));
    showConfirm(t('team.deleteCashierTitle'), t('team.deleteCashierDesc'), async () => {
      const removed = cashiers.find((c) => c.id === idToRemove);
      saveSettingsToCloud({ ...menuData, cashiers: cashiers.filter((c) => c.id !== idToRemove) });
      const { error } = await supabase.rpc('delete_cashier_pin', { p_cashier_id: idToRemove });
      if (error) console.warn('Could not delete cashier_pins row:', error);
      if (removed) logActivity('cashier_removed', null, { name: removed.name });
    });
  };

  return {
    saveSettingsToCloud, handleLogoUpload, handleAppLogoUpload,
    handleSaveReceipt, handleSaveGeneralSettings, handleSaveLoyalty, handleResetLoyaltyData,
    cashiers, newCashier, setNewCashier, handleAddCashier, handleDeleteCashier,
  };
}
