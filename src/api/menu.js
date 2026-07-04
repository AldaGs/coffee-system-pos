// Menu data-access dispatcher.
//
// Historically this file held the Supabase implementation directly. It now
// dispatches per-call between the cloud backend (menuCloud.js — unchanged from
// the original) and the local Dexie backend (menuLocal.js) based on the install
// mode. Every consumer keeps importing from './api/menu', so cloud installs are
// completely unaffected and local mode "just works" through the same surface.
//
// Dispatch is per-call (not resolved once at import) so a single page that flips
// mode — e.g. the local→cloud upgrade migration — picks the right backend
// without a reload.

import * as cloud from './menuCloud';
import * as local from './menuLocal';
import { isLocalMode } from '../utils/appMode';

const impl = () => (isLocalMode() ? local : cloud);

export const loadMenu = (...a) => impl().loadMenu(...a);

export const addCategory = (...a) => impl().addCategory(...a);
export const renameCategory = (...a) => impl().renameCategory(...a);
export const deleteCategory = (...a) => impl().deleteCategory(...a);
export const reorderCategories = (...a) => impl().reorderCategories(...a);
export const setCategoryHidden = (...a) => impl().setCategoryHidden(...a);
export const setCategoryPublicHidden = (...a) => impl().setCategoryPublicHidden(...a);

export const addItem = (...a) => impl().addItem(...a);
export const updateItem = (...a) => impl().updateItem(...a);
export const deleteItem = (...a) => impl().deleteItem(...a);
export const setItemHidden = (...a) => impl().setItemHidden(...a);

export const addModifierGroup = (...a) => impl().addModifierGroup(...a);
export const renameModifierGroup = (...a) => impl().renameModifierGroup(...a);
export const deleteModifierGroup = (...a) => impl().deleteModifierGroup(...a);
export const setModifierGroupAllowMultiple = (...a) => impl().setModifierGroupAllowMultiple(...a);
export const setModifierGroupHidden = (...a) => impl().setModifierGroupHidden(...a);

export const addModifierOption = (...a) => impl().addModifierOption(...a);
export const updateModifierOption = (...a) => impl().updateModifierOption(...a);
export const deleteModifierOption = (...a) => impl().deleteModifierOption(...a);

export const setItemModifiers = (...a) => impl().setItemModifiers(...a);

export const addDiscountRule = (...a) => impl().addDiscountRule(...a);
export const updateDiscountRule = (...a) => impl().updateDiscountRule(...a);
export const deleteDiscountRule = (...a) => impl().deleteDiscountRule(...a);
