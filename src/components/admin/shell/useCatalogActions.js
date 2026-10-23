import { useState } from 'react';
import {
  addCategory, renameCategory, deleteCategory, reorderCategories, setCategoryHidden, setCategoryPublicHidden,
  addItem, updateItem, deleteItem, setItemHidden,
} from '../../../api/menu';
import { useMenuStore } from '../../../store/useMenuStore';
import { useUpgradeNagStore } from '../../../store/useUpgradeNagStore';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';
import { logActivity } from '../../../services/activityService';
import { toCents } from '../../../utils/moneyUtils';

const EMPTY_ITEM_FORM = {
  category: '', name: '', price: '', priceType: 'fixed', emoji: '☕', ivaTreatment: 'tasa0',
  allowedModifiers: [], item_type: 'none',
  groupKey: '', isTextInput: false, deductionTarget: '', substitutionTarget: '',
};

const findItem = (categories, itemId) => {
  for (const [category, items] of Object.entries(categories || {})) {
    const item = items.find((d) => d.id === itemId);
    if (item) return { category, item };
  }
  return {};
};

// Categories and items of the menu editor, plus the add/edit item form.
export function useCatalogActions({ runMenuWrite, vendors }) {
  const menuData = useMenuStore((s) => s.menuData);
  const { showAlert, showConfirm } = useDialog();
  const { t } = useTranslation();

  const [newCategoryName, setNewCategoryName] = useState('');
  const [itemForm, setNewItemForm] = useState(EMPTY_ITEM_FORM);
  const [editingItemId, setEditingItemId] = useState(null);
  // Until the user picks one, new items go to the first category.
  const newItemForm = itemForm.category ? itemForm : { ...itemForm, category: menuData?.categoryOrder?.[0] || '' };

  const withItems = (category, items) => ({ ...menuData, categories: { ...menuData.categories, [category]: items } });

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (menuData.categories[name]) return showAlert(t('menu.alertConflictTitle'), t('menu.alertConflictDesc'));
    setNewCategoryName('');
    runMenuWrite({
      ...menuData,
      categories: { ...menuData.categories, [name]: [] },
      categoryOrder: [...(menuData.categoryOrder || []), name],
    }, () => addCategory(name));
  };

  const handleRenameCategory = (oldName, newName) => {
    if (!newName || !newName.trim() || newName === oldName) return;
    if (menuData.categories[newName]) return showAlert(t('menu.alertConflictTitle'), t('menu.alertConflictDesc'));
    // Rebuilt rather than mutated so the category keeps its position.
    const categories = {};
    Object.keys(menuData.categories).forEach((key) => {
      categories[key === oldName ? newName : key] = menuData.categories[key];
    });
    runMenuWrite({
      ...menuData,
      categories,
      categoryOrder: (menuData.categoryOrder || []).map((c) => (c === oldName ? newName : c)),
      hiddenCategories: (menuData.hiddenCategories || []).map((c) => (c === oldName ? newName : c)),
    }, () => renameCategory(oldName, newName));
  };

  // direction: -1 up, +1 down in the Register tab order.
  const handleMoveCategory = (categoryName, direction) => {
    const allCats = Object.keys(menuData.categories || {});
    const existingOrder = Array.isArray(menuData.categoryOrder) ? menuData.categoryOrder : [];
    const order = [...existingOrder.filter((c) => allCats.includes(c)), ...allCats.filter((c) => !existingOrder.includes(c))];
    const idx = order.indexOf(categoryName);
    const newIdx = idx + direction;
    if (idx < 0 || newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    runMenuWrite({ ...menuData, categoryOrder: order }, () => reorderCategories(order));
  };

  const toggleInList = (key, name) => {
    const set = new Set(menuData[key] || []);
    const willBeHidden = !set.has(name);
    if (willBeHidden) set.add(name); else set.delete(name);
    return [{ ...menuData, [key]: [...set] }, willBeHidden];
  };

  const handleToggleCategoryVisibility = (categoryName) => {
    const [menu, hidden] = toggleInList('hiddenCategories', categoryName);
    runMenuWrite(menu, () => setCategoryHidden(categoryName, hidden));
  };

  // Public menu only; independent of the Register hide.
  const handleToggleCategoryPublicVisibility = (categoryName) => {
    const [menu, hidden] = toggleInList('publicHiddenCategories', categoryName);
    runMenuWrite(menu, () => setCategoryPublicHidden(categoryName, hidden));
  };

  const handleDeleteCategory = (categoryName) => {
    if (menuData.categories[categoryName].length > 0) {
      return showAlert(t('common.error'), `${t('menu.deleteCategoryHasItems')} (${categoryName})`);
    }
    showConfirm(t('menu.deleteCategoryTitle'), `${t('menu.deleteCategoryDesc')} (${categoryName})`, () => {
      const categories = { ...menuData.categories };
      delete categories[categoryName];
      runMenuWrite({
        ...menuData,
        categories,
        categoryOrder: (menuData.categoryOrder || []).filter((c) => c !== categoryName),
        hiddenCategories: (menuData.hiddenCategories || []).filter((c) => c !== categoryName),
      }, () => deleteCategory(categoryName));
    });
  };

  // Register (POS) grid only.
  const handleToggleDrinkVisibility = (categoryName, drinkId) => {
    const items = menuData.categories?.[categoryName] || [];
    const target = items.find((d) => d.id === drinkId);
    if (!target) return;
    const next = !target.isHidden;
    runMenuWrite(withItems(categoryName, items.map((d) => (d.id === drinkId ? { ...d, isHidden: next } : d))),
      () => setItemHidden(drinkId, next));
  };

  // Public menu only; publicHidden rides in the item's data jsonb.
  const handleToggleDrinkPublicVisibility = (categoryName, drinkId) => {
    const items = menuData.categories?.[categoryName] || [];
    const target = items.find((d) => d.id === drinkId);
    if (!target) return;
    const updated = { ...target, publicHidden: !target.publicHidden };
    runMenuWrite(withItems(categoryName, items.map((d) => (d.id === drinkId ? updated : d))),
      () => updateItem(drinkId, updated), 'menu-item-public-visibility');
  };

  // Public-menu-only fields (roast date, WhatsApp link) from the Menús Públicos tab.
  const handleSetItemPublicFields = (itemId, patch) => {
    const { category, item } = findItem(menuData.categories, itemId);
    if (!item) return;
    const updated = { ...item, ...patch };
    runMenuWrite(withItems(category, menuData.categories[category].map((d) => (d.id === itemId ? updated : d))),
      () => updateItem(itemId, updated), 'menu-item-public-fields');
  };

  // Adds a fully built item (the Recipe Builder publishing a recipe).
  const handleAddItemDirect = (categoryName, item) => {
    runMenuWrite(withItems(categoryName, [...(menuData.categories[categoryName] || []), item]), () => addItem(categoryName, item));
    useUpgradeNagStore.getState().trigger('items_added');
  };

  const resetItemForm = () => {
    setNewItemForm((prev) => ({
      ...prev, name: '', price: '', priceType: 'fixed', emoji: '☕', ivaTreatment: 'tasa0',
      inventoryMode: 'none', linkedWarehouseId: '', linkedRecipeId: '', publicHidden: false,
      vendorId: '', vendorUnitCost: '', vendorSplitType: '',
    }));
  };

  // The vendor name and cost are copied onto the item so old sales and settlements
  // stay readable and correct after the vendor is renamed or the cost edited.
  const vendorFieldsForForm = () => {
    const vendorId = newItemForm.vendorId || '';
    return {
      vendorId,
      vendorName: vendorId ? (vendors.find((v) => String(v.id) === String(vendorId))?.name || '') : '',
      vendorUnitCostCents: vendorId ? toCents(newItemForm.vendorUnitCost || 0) : 0,
      vendorSplitType: vendorId ? (newItemForm.vendorSplitType || '') : '',
    };
  };

  const itemFieldsFromForm = () => ({
    name: newItemForm.name,
    basePrice: toCents(newItemForm.price || 0),
    priceType: newItemForm.priceType || 'fixed',
    emoji: newItemForm.emoji || '',
    ivaTreatment: newItemForm.ivaTreatment || 'tasa0',
    inventoryMode: newItemForm.inventoryMode || 'none',
    linkedWarehouseId: newItemForm.linkedWarehouseId || '',
    linkedRecipeId: newItemForm.linkedRecipeId || '',
    publicHidden: !!newItemForm.publicHidden,
    ...vendorFieldsForForm(),
  });

  const handleAddDrink = () => {
    if (!newItemForm.category || !newItemForm.name || !newItemForm.price) {
      return showAlert(t('menu.missingFieldsTitle'), t('menu.missingFieldsDesc'));
    }

    if (editingItemId) {
      const { category: oldCategory, item: existing } = findItem(menuData.categories, editingItemId);
      if (!existing) return showAlert(t('menu.alertErrorTitle'), t('menu.alertItemNotFound'));
      const updatedItem = { ...existing, ...itemFieldsFromForm() };
      const categories = { ...menuData.categories };
      if (oldCategory === newItemForm.category) {
        categories[oldCategory] = categories[oldCategory].map((d) => (d.id === editingItemId ? updatedItem : d));
      } else {
        categories[oldCategory] = categories[oldCategory].filter((d) => d.id !== editingItemId);
        categories[newItemForm.category] = [...(categories[newItemForm.category] || []), updatedItem];
      }
      const movedCategory = oldCategory === newItemForm.category ? undefined : newItemForm.category;
      runMenuWrite({ ...menuData, categories }, () => updateItem(editingItemId, updatedItem, movedCategory));
      logActivity('menu_item_updated', null, { name: updatedItem.name });
      setEditingItemId(null);
      resetItemForm();
      return;
    }

    const newDrink = {
      id: newItemForm.name.toLowerCase().replace(/\s+/g, '_'),
      allowedModifiers: [],
      ...itemFieldsFromForm(),
    };
    runMenuWrite(withItems(newItemForm.category, [...(menuData.categories[newItemForm.category] || []), newDrink]),
      () => addItem(newItemForm.category, newDrink));
    useUpgradeNagStore.getState().trigger('items_added');
    logActivity('menu_item_added', null, {
      name: newItemForm.name,
      category: newItemForm.category,
      price: toCents(newItemForm.price),
    });
    resetItemForm();
  };

  const handleDeleteDrink = (categoryName, drinkId, drinkName) => {
    showConfirm(t('menu.deleteDrinkTitle'), `${t('menu.deleteDrinkDesc')} (${drinkName})`, () => {
      runMenuWrite(withItems(categoryName, menuData.categories[categoryName].filter((d) => d.id !== drinkId)),
        () => deleteItem(drinkId));
      logActivity('menu_item_deleted', null, { name: drinkName });
    });
  };

  return {
    newCategoryName, setNewCategoryName, newItemForm, setNewItemForm, editingItemId, setEditingItemId,
    handleAddCategory, handleRenameCategory, handleMoveCategory, handleDeleteCategory,
    handleToggleCategoryVisibility, handleToggleCategoryPublicVisibility,
    handleToggleDrinkVisibility, handleToggleDrinkPublicVisibility,
    handleSetItemPublicFields, handleAddItemDirect, handleAddDrink, handleDeleteDrink,
  };
}
