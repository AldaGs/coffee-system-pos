import { useState } from 'react';
import {
  addModifierGroup, renameModifierGroup, deleteModifierGroup,
  setModifierGroupAllowMultiple, setModifierGroupHidden, setModifierGroupPublicHidden,
  addModifierOption, updateModifierOption, deleteModifierOption, setItemModifiers,
} from '../../../api/menu';
import { useMenuStore } from '../../../store/useMenuStore';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';
import { toCents } from '../../../utils/moneyUtils';

const slug = (name) => name.toLowerCase().replace(/\s+/g, '_');
const EMPTY_OPTION = {
  groupKey: '', name: '', price: '0', isTextInput: false,
  deductionTarget: '', deductionTargetId: '', substitutionTarget: '', substitutionTargetId: '',
};

const optionFromForm = (form) => ({
  id: slug(form.name),
  name: form.name,
  price: form.isTextInput ? 0 : toCents(form.price),
  isTextInput: form.isTextInput,
  deductionTarget: form.deductionTarget || null,
  deductionTargetId: form.deductionTargetId || null,
  substitutionTarget: form.substitutionTarget || null,
  substitutionTargetId: form.substitutionTargetId || null,
});

// Modifier groups, their options, and which groups each item offers.
export function useModifierActions({ runMenuWrite }) {
  const menuData = useMenuStore((s) => s.menuData);
  const { showAlert, showConfirm } = useDialog();
  const { t } = useTranslation();

  const [newModGroupName, setNewModGroupName] = useState('');
  const [newModOption, setNewModOption] = useState({ groupKey: '', name: '', price: '0', isTextInput: false });
  const [editingDrink, setEditingDrink] = useState(null);

  const withGroupSetting = (groupKey, patch) => ({
    ...menuData,
    modifierGroupSettings: {
      ...(menuData.modifierGroupSettings || {}),
      [groupKey]: { ...(menuData.modifierGroupSettings?.[groupKey] || {}), ...patch },
    },
  });

  const handleToggleModifierGroupMulti = (groupKey) => {
    const next = !menuData.modifierGroupSettings?.[groupKey]?.allowMultiple;
    runMenuWrite(withGroupSetting(groupKey, { allowMultiple: next }), () => setModifierGroupAllowMultiple(groupKey, next));
  };

  // Hidden everywhere: public menu and Register.
  const handleToggleModifierGroupHidden = (groupKey) => {
    const next = !menuData.modifierGroupSettings?.[groupKey]?.isHidden;
    runMenuWrite(withGroupSetting(groupKey, { isHidden: next }), () => setModifierGroupHidden(groupKey, next));
  };

  // Cashier-only: hidden from the public menu and online orders.
  const handleToggleModifierGroupPublicHidden = (groupKey) => {
    const next = !menuData.modifierGroupSettings?.[groupKey]?.publicHidden;
    runMenuWrite(withGroupSetting(groupKey, { publicHidden: next }), () => setModifierGroupPublicHidden(groupKey, next));
  };

  const handleAddModifierGroup = () => {
    if (!newModGroupName.trim()) return;
    const groupKey = slug(newModGroupName);
    setNewModGroupName('');
    if (menuData.modifierGroups[groupKey]) return;
    runMenuWrite({
      ...menuData,
      modifierGroups: { ...menuData.modifierGroups, [groupKey]: [] },
      modifierGroupSettings: { ...(menuData.modifierGroupSettings || {}), [groupKey]: { allowMultiple: false } },
    }, () => addModifierGroup(groupKey, groupKey));
  };

  const handleAddModifierOption = () => {
    if (!newModOption.groupKey || !newModOption.name || (!newModOption.isTextInput && newModOption.price === '')) {
      return showAlert(t('menu.missingFieldsTitle'), t('menu.missingFieldsDesc'));
    }
    const option = optionFromForm(newModOption);
    runMenuWrite({
      ...menuData,
      modifierGroups: {
        ...menuData.modifierGroups,
        [newModOption.groupKey]: [...menuData.modifierGroups[newModOption.groupKey], option],
      },
    }, () => addModifierOption(newModOption.groupKey, option));
    setNewModOption({ ...EMPTY_OPTION, groupKey: newModOption.groupKey });
  };

  const handleUpdateModifierOption = (groupKey, oldOptionId, updatedOpt) => {
    if (!updatedOpt.name || (!updatedOpt.isTextInput && updatedOpt.price === '')) {
      return showAlert(t('menu.missingFieldsTitle'), t('menu.missingFieldsDesc'));
    }
    const optionIndex = menuData.modifierGroups[groupKey].findIndex((o) => o.id === oldOptionId);
    if (optionIndex === -1) return;
    const option = optionFromForm(updatedOpt);
    const options = [...menuData.modifierGroups[groupKey]];
    options[optionIndex] = option;
    runMenuWrite({ ...menuData, modifierGroups: { ...menuData.modifierGroups, [groupKey]: options } },
      () => updateModifierOption(oldOptionId, groupKey, option));
    setNewModOption(EMPTY_OPTION);
  };

  // Rewrites every item's allowedModifiers so it matches the FK cascade on the server.
  const remapItemModifiers = (fn) => {
    const categories = {};
    Object.keys(menuData.categories).forEach((cat) => {
      categories[cat] = menuData.categories[cat].map((item) => ({ ...item, allowedModifiers: fn(item.allowedModifiers) }));
    });
    return categories;
  };

  // The group id is a slug of its name, so renaming changes the id.
  const handleRenameModifierGroup = (oldKey, newKey) => {
    if (!newKey.trim()) return;
    const key = slug(newKey);
    if (oldKey === key) return;
    if (menuData.modifierGroups[key]) return showAlert(t('common.error'), t('mods.errorGroupExists'));

    const groups = { ...menuData.modifierGroups };
    groups[key] = groups[oldKey];
    delete groups[oldKey];
    const settings = { ...(menuData.modifierGroupSettings || {}) };
    if (settings[oldKey]) {
      settings[key] = settings[oldKey];
      delete settings[oldKey];
    }
    runMenuWrite({
      ...menuData,
      modifierGroups: groups,
      modifierGroupSettings: settings,
      categories: remapItemModifiers((mods) => (Array.isArray(mods) ? mods.map((k) => (k === oldKey ? key : k)) : (mods || []))),
    }, () => renameModifierGroup(oldKey, key, key));
  };

  const handleDeleteModifierGroup = (groupKey) => {
    showConfirm(t('menu.deleteModGroupTitle'), `${t('menu.deleteModGroupDesc')} (${groupKey.replace('_', ' ')})`, () => {
      const groups = { ...menuData.modifierGroups };
      delete groups[groupKey];
      const settings = { ...(menuData.modifierGroupSettings || {}) };
      delete settings[groupKey];
      runMenuWrite({
        ...menuData,
        modifierGroups: groups,
        modifierGroupSettings: settings,
        categories: remapItemModifiers((mods) => (mods || []).filter((m) => m !== groupKey)),
      }, () => deleteModifierGroup(groupKey));
    });
  };

  const handleDeleteModifierOption = (groupKey, optionId, optionName) => {
    showConfirm(t('menu.deleteModOptionTitle'), `${t('menu.deleteModOptionDesc')} (${optionName})`, () => {
      runMenuWrite({
        ...menuData,
        modifierGroups: {
          ...menuData.modifierGroups,
          [groupKey]: menuData.modifierGroups[groupKey].filter((opt) => opt.id !== optionId),
        },
      }, () => deleteModifierOption(groupKey, optionId));
    });
  };

  const toggleModifierForDrink = (modGroupKey) => {
    const { categoryName, drink } = editingDrink;
    const current = menuData.categories[categoryName].find((d) => d.id === drink.id);
    if (!current) return;
    const allowed = current.allowedModifiers || [];
    const nextAllowed = allowed.includes(modGroupKey) ? allowed.filter((k) => k !== modGroupKey) : [...allowed, modGroupKey];
    const updated = { ...current, allowedModifiers: nextAllowed };
    setEditingDrink({ ...editingDrink, drink: updated });
    runMenuWrite({
      ...menuData,
      categories: {
        ...menuData.categories,
        [categoryName]: menuData.categories[categoryName].map((d) => (d.id === drink.id ? updated : d)),
      },
    }, () => setItemModifiers(drink.id, nextAllowed));
  };

  return {
    newModGroupName, setNewModGroupName, newModOption, setNewModOption, editingDrink, setEditingDrink,
    handleAddModifierGroup, handleAddModifierOption, handleUpdateModifierOption,
    handleRenameModifierGroup, handleDeleteModifierGroup, handleDeleteModifierOption,
    handleToggleModifierGroupMulti, handleToggleModifierGroupHidden, handleToggleModifierGroupPublicHidden,
    toggleModifierForDrink,
  };
}
