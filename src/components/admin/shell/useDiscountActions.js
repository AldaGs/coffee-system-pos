import { useState } from 'react';
import { addDiscountRule, updateDiscountRule, deleteDiscountRule } from '../../../api/menu';
import { useMenuStore } from '../../../store/useMenuStore';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';
import { reloadMenuFromCloud } from './useMenuWrite';

const EMPTY_RULE = {
  name: '', trigger: 'auto', code: '', kind: 'standard',
  type: 'percentage', value: '', targetType: 'cart', targetValue: '',
  bogoItem: '', buyQty: 2, payQty: 1,
  comboItems: [], comboPrice: '',
  requiredItems: [], minSubtotal: '', customer: 'any',
  days: [], startDate: '', endDate: '', startTime: '', endTime: '',
  maxRedemptions: '', maxPerDay: '', maxBudget: '', maxDiscount: '',
  priority: 0, allowStack: false, requireApproval: false,
  usage: 'recurring',
};

// Rules carry `id` (UI key) and `_id` (database key, needed to update or delete).
export function useDiscountActions({ runMenuWrite, setIsSaving }) {
  const menuData = useMenuStore((s) => s.menuData);
  const setMenuData = useMenuStore((s) => s.setMenuData);
  const { showAlert } = useDialog();
  const { t } = useTranslation();
  const [newRule, setNewRule] = useState(EMPTY_RULE);

  // setMenuData can't take an updater (it deep-copies via JSON), so read the
  // latest state after the await instead of a stale closure.
  const handleAddDiscountRule = async (rule) => {
    const baseMenu = useMenuStore.getState().menuData || menuData;
    setMenuData({ ...baseMenu, discountRules: [...(baseMenu.discountRules || []), rule] });
    setIsSaving(true);
    try {
      const dbId = await addDiscountRule(rule);
      const latest = useMenuStore.getState().menuData || {};
      setMenuData({
        ...latest,
        discountRules: (latest.discountRules || []).map((r) => (r.id === rule.id ? { ...r, _id: dbId } : r)),
      });
    } catch (err) {
      showAlert(t('common.error'), t('admin.cloudSaveFailPrefix') + err.message);
      await reloadMenuFromCloud();
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDiscountRule = (rule) => {
    if (!rule._id) return;
    const next = !rule.isActive;
    runMenuWrite({
      ...menuData,
      discountRules: (menuData.discountRules || []).map((r) => (r.id === rule.id ? { ...r, isActive: next } : r)),
    }, () => updateDiscountRule(rule._id, { ...rule, isActive: next }));
  };

  const handleDeleteDiscountRule = (rule) => {
    if (!rule._id) return;
    runMenuWrite({
      ...menuData,
      discountRules: (menuData.discountRules || []).filter((r) => r.id !== rule.id),
    }, () => deleteDiscountRule(rule._id));
  };

  return { newRule, setNewRule, handleAddDiscountRule, handleToggleDiscountRule, handleDeleteDiscountRule };
}
