import { useState } from 'react';
import { toCents, fromCents } from '../utils/moneyUtils';

// The item being configured in the modifier modal.
export function useItemPicker({ menuData }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);

  // Single-choice groups replace their option; multi-choice groups toggle it.
  const handleToggleModifier = (groupKey, option) => {
    const mods = [...pendingItem.selectedModifiers];
    const picked = { ...option, groupId: groupKey };
    if (menuData?.modifierGroupSettings?.[groupKey]?.allowMultiple) {
      const idx = mods.findIndex((m) => m.id === option.id && m.groupId === groupKey);
      if (idx >= 0) mods.splice(idx, 1); else mods.push(picked);
    } else {
      const idx = mods.findIndex((m) => m.groupId === groupKey);
      if (idx >= 0) mods[idx] = picked; else mods.push(picked);
    }
    setPendingItem({ ...pendingItem, selectedModifiers: mods });
  };

  // Text options (e.g. a name on the cup) exist only while they have text.
  const handleTextModifierChange = (groupKey, option, text) => {
    const mods = [...pendingItem.selectedModifiers];
    const idx = mods.findIndex((m) => m.id === option.id);
    if (text.trim() === '') {
      if (idx >= 0) mods.splice(idx, 1);
    } else if (idx >= 0) {
      mods[idx].textValue = text;
    } else {
      mods.push({ ...option, groupId: groupKey, textValue: text });
    }
    setPendingItem({ ...pendingItem, selectedModifiers: mods });
  };

  return { isModalOpen, setIsModalOpen, pendingItem, setPendingItem, handleToggleModifier, handleTextModifierChange };
}

// Tapping a product: ask the price for variable-price items, open the modifier
// modal when it has visible groups, otherwise add it straight to the ticket.
export function createItemClick({ menuData, addToTicket, setPendingItem, setIsModalOpen, showPrompt, showAlert, t }) {
  return (item) => {
    const hasVisibleModifiers = (item.allowedModifiers || []).some(
      (k) => menuData?.modifierGroups?.[k] && !menuData?.modifierGroupSettings?.[k]?.isHidden,
    );
    const add = (basePrice) => {
      const priced = basePrice === undefined ? item : { ...item, basePrice };
      if (hasVisibleModifiers) {
        setPendingItem({ ...priced, selectedModifiers: [] });
        setIsModalOpen(true);
      } else if (basePrice === undefined) {
        addToTicket(item, []);
      } else {
        addToTicket(item, [], basePrice);
      }
    };
    if (item.priceType !== 'variable') { add(); return; }
    showPrompt(
      `${t('menu.promptVariablePrice') || 'Enter Price for'} ${item.name}`,
      '',
      (input) => {
        const price = toCents(input);
        if (isNaN(price) || price < 0) return showAlert(t('common.error'), t('check.alertInvalid'));
        add(price);
      },
      item.basePrice > 0 ? String(fromCents(item.basePrice)) : '',
      t('common.save'),
      t('common.cancel'),
      'decimal',
    );
  };
}
