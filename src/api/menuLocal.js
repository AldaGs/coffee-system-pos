// Local ('guest') mode menu backend. Mirrors every export of api/menu.js but
// reads/writes the Dexie `menu_local` store instead of Supabase. The in-memory
// shape returned by loadMenu() is byte-for-byte the same as the cloud loader, so
// Admin/Register consumers don't branch on mode — the dispatcher in menuRepo.js
// picks this module when isLocalMode().
//
// Rows are tagged by `type` and keyed by a client-generated UUID. UUIDs are
// CRITICAL: integer auto-increment ids would collide with existing Supabase ids
// when the user upgrades and the migration pushes this catalog up.

import { db } from '../db';

const TYPE = {
  CATEGORY: 'category',
  ITEM: 'item',
  MOD_GROUP: 'modGroup',
  MOD_OPTION: 'modOption',
  ITEM_MOD_LINK: 'itemModLink',
  DISCOUNT_RULE: 'discountRule',
};

const uuid = () => crypto.randomUUID();

async function rowsOf(type) {
  const rows = await db.menu_local.where('type').equals(type).toArray();
  return rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

async function nextSortOrder(type, filterFn) {
  const rows = await rowsOf(type);
  const scoped = filterFn ? rows.filter(filterFn) : rows;
  return scoped.reduce((max, r) => Math.max(max, r.sort_order ?? -1), -1) + 1;
}

// ---------- row → in-memory transforms (kept in lockstep with api/menu.js) ----

function rowToItem(row, allowedModifiers) {
  const data = row.data || {};
  return {
    id: row.id,
    name: row.name,
    basePrice: row.base_price_cents,
    priceType: row.price_type,
    emoji: row.emoji,
    imageUrl: row.image_url || '',
    isHidden: !!row.is_hidden,
    allowedModifiers,
    inventoryMode: data.inventoryMode || 'none',
    linkedWarehouseId: data.linkedWarehouseId || '',
    linkedRecipeId: data.linkedRecipeId || '',
    ...data,
  };
}

function rowToOption(row) {
  const data = row.data || {};
  return {
    id: row.id,
    name: row.name,
    price: row.price_delta_cents,
    isTextInput: !!data.isTextInput,
    deductionTarget: data.deductionTarget ?? null,
    deductionTargetId: data.deductionTargetId ?? null,
    substitutionTarget: data.substitutionTarget ?? null,
    substitutionTargetId: data.substitutionTargetId ?? null,
  };
}

function itemDataResidual(item) {
  const { id, name, basePrice, priceType, emoji, imageUrl, isHidden, allowedModifiers, ...rest } = item;
  return rest;
}

function optionDataResidual(opt) {
  const { id, name, price, ...rest } = opt;
  return rest;
}

// ---------- LOADER -----------------------------------------------------------

export async function loadMenu() {
  const [cats, items, groups, opts, links, rules] = await Promise.all([
    rowsOf(TYPE.CATEGORY),
    rowsOf(TYPE.ITEM),
    rowsOf(TYPE.MOD_GROUP),
    rowsOf(TYPE.MOD_OPTION),
    rowsOf(TYPE.ITEM_MOD_LINK),
    rowsOf(TYPE.DISCOUNT_RULE),
  ]);

  const catName = new Map(cats.map((c) => [c.id, c.name]));

  const allowedByItem = new Map();
  for (const l of links) {
    if (!allowedByItem.has(l.item_id)) allowedByItem.set(l.item_id, []);
    allowedByItem.get(l.item_id).push(l.group_id);
  }

  const categories = {};
  for (const c of cats) categories[c.name] = [];
  for (const it of items) {
    const name = catName.get(it.category_id);
    if (!name) continue;
    categories[name].push(rowToItem(it, allowedByItem.get(it.id) || []));
  }

  const categoryOrder = cats.map((c) => c.name);
  const hiddenCategories = cats.filter((c) => c.is_hidden).map((c) => c.name);

  const modifierGroups = {};
  const modifierGroupSettings = {};
  for (const g of groups) {
    modifierGroups[g.id] = [];
    modifierGroupSettings[g.id] = { allowMultiple: !!g.allow_multiple, isHidden: !!g.is_hidden };
  }
  for (const o of opts) {
    if (!modifierGroups[o.group_id]) continue;
    modifierGroups[o.group_id].push(rowToOption(o));
  }

  const discountRules = rules.map((r) => ({ ...r.payload, _id: r.id }));

  return {
    categories,
    categoryOrder,
    hiddenCategories,
    modifierGroups,
    modifierGroupSettings,
    discountRules,
  };
}

// ---------- CATEGORY WRITERS -------------------------------------------------

export async function addCategory(name) {
  const sort_order = await nextSortOrder(TYPE.CATEGORY);
  await db.menu_local.put({ id: uuid(), type: TYPE.CATEGORY, name, sort_order, is_hidden: false });
}

export async function renameCategory(oldName, newName) {
  const cats = await rowsOf(TYPE.CATEGORY);
  const row = cats.find((c) => c.name === oldName);
  if (row) await db.menu_local.update(row.id, { name: newName });
}

export async function deleteCategory(name) {
  const cats = await rowsOf(TYPE.CATEGORY);
  const row = cats.find((c) => c.name === name);
  if (!row) return;
  // Cascade: remove the category's items (and their modifier links).
  const items = (await rowsOf(TYPE.ITEM)).filter((i) => i.category_id === row.id);
  for (const it of items) await deleteItem(it.id);
  await db.menu_local.delete(row.id);
}

export async function reorderCategories(orderedNames) {
  const cats = await rowsOf(TYPE.CATEGORY);
  const byName = new Map(cats.map((c) => [c.name, c]));
  await Promise.all(orderedNames.map((name, idx) => {
    const row = byName.get(name);
    return row ? db.menu_local.update(row.id, { sort_order: idx }) : null;
  }));
}

export async function setCategoryHidden(name, isHidden) {
  const cats = await rowsOf(TYPE.CATEGORY);
  const row = cats.find((c) => c.name === name);
  if (row) await db.menu_local.update(row.id, { is_hidden: isHidden });
}

// ---------- ITEM WRITERS -----------------------------------------------------

async function categoryIdByName(name) {
  const cats = await rowsOf(TYPE.CATEGORY);
  const row = cats.find((c) => c.name === name);
  if (!row) throw new Error(`Category not found: ${name}`);
  return row.id;
}

export async function addItem(categoryName, item) {
  const category_id = await categoryIdByName(categoryName);
  const sort_order = await nextSortOrder(TYPE.ITEM, (r) => r.category_id === category_id);
  await db.menu_local.put({
    id: item.id || uuid(),
    type: TYPE.ITEM,
    category_id,
    name: item.name,
    base_price_cents: item.basePrice ?? 0,
    price_type: item.priceType || 'fixed',
    emoji: item.emoji || '',
    image_url: item.imageUrl || '',
    sort_order,
    is_hidden: false,
    data: itemDataResidual(item),
  });
}

export async function updateItem(id, item, newCategoryName) {
  const patch = {
    name: item.name,
    base_price_cents: item.basePrice ?? 0,
    price_type: item.priceType || 'fixed',
    emoji: item.emoji || '',
    image_url: item.imageUrl || '',
    data: itemDataResidual(item),
  };
  if (newCategoryName !== undefined) {
    patch.category_id = await categoryIdByName(newCategoryName);
    patch.sort_order = await nextSortOrder(TYPE.ITEM, (r) => r.category_id === patch.category_id);
  }
  await db.menu_local.update(id, patch);
}

export async function deleteItem(id) {
  const links = (await rowsOf(TYPE.ITEM_MOD_LINK)).filter((l) => l.item_id === id);
  for (const l of links) await db.menu_local.delete(l.id);
  await db.menu_local.delete(id);
}

export async function setItemHidden(id, isHidden) {
  await db.menu_local.update(id, { is_hidden: isHidden });
}

// ---------- MODIFIER GROUP WRITERS ------------------------------------------

export async function addModifierGroup(id, name) {
  const sort_order = await nextSortOrder(TYPE.MOD_GROUP);
  await db.menu_local.put({ id, type: TYPE.MOD_GROUP, name, allow_multiple: false, is_hidden: false, sort_order });
}

export async function renameModifierGroup(oldId, newId, newName) {
  const group = await db.menu_local.get(oldId);
  if (!group) return;
  // Slug id is the PK, so a rename means re-key + cascade to options/links.
  if (newId !== oldId) {
    await db.menu_local.delete(oldId);
    await db.menu_local.put({ ...group, id: newId, name: newName });
    const opts = (await rowsOf(TYPE.MOD_OPTION)).filter((o) => o.group_id === oldId);
    for (const o of opts) await db.menu_local.update(o.id, { group_id: newId });
    const links = (await rowsOf(TYPE.ITEM_MOD_LINK)).filter((l) => l.group_id === oldId);
    for (const l of links) await db.menu_local.update(l.id, { group_id: newId });
  } else {
    await db.menu_local.update(oldId, { name: newName });
  }
}

export async function deleteModifierGroup(id) {
  const opts = (await rowsOf(TYPE.MOD_OPTION)).filter((o) => o.group_id === id);
  for (const o of opts) await db.menu_local.delete(o.id);
  const links = (await rowsOf(TYPE.ITEM_MOD_LINK)).filter((l) => l.group_id === id);
  for (const l of links) await db.menu_local.delete(l.id);
  await db.menu_local.delete(id);
}

export async function setModifierGroupAllowMultiple(id, allowMultiple) {
  await db.menu_local.update(id, { allow_multiple: allowMultiple });
}

export async function setModifierGroupHidden(id, isHidden) {
  await db.menu_local.update(id, { is_hidden: isHidden });
}

// ---------- MODIFIER OPTION WRITERS -----------------------------------------

export async function addModifierOption(groupId, option) {
  const sort_order = await nextSortOrder(TYPE.MOD_OPTION, (r) => r.group_id === groupId);
  await db.menu_local.put({
    id: option.id || uuid(),
    type: TYPE.MOD_OPTION,
    group_id: groupId,
    name: option.name,
    price_delta_cents: option.price ?? 0,
    sort_order,
    data: optionDataResidual(option),
  });
}

export async function updateModifierOption(oldOptionId, groupId, option) {
  const existing = await db.menu_local.get(oldOptionId);
  const patch = {
    name: option.name,
    price_delta_cents: option.price ?? 0,
    data: optionDataResidual(option),
  };
  if (option.id && option.id !== oldOptionId) {
    await db.menu_local.delete(oldOptionId);
    await db.menu_local.put({ ...existing, ...patch, id: option.id, group_id: groupId, type: TYPE.MOD_OPTION });
  } else {
    await db.menu_local.update(oldOptionId, patch);
  }
}

export async function deleteModifierOption(groupId, optionId) {
  await db.menu_local.delete(optionId);
}

// ---------- ITEM ↔ MODIFIER GROUP ATTACHMENTS -------------------------------

export async function setItemModifiers(itemId, groupIds) {
  const links = (await rowsOf(TYPE.ITEM_MOD_LINK)).filter((l) => l.item_id === itemId);
  for (const l of links) await db.menu_local.delete(l.id);
  for (let idx = 0; idx < groupIds.length; idx++) {
    await db.menu_local.put({
      id: uuid(),
      type: TYPE.ITEM_MOD_LINK,
      item_id: itemId,
      group_id: groupIds[idx],
      sort_order: idx,
    });
  }
}

// ---------- DISCOUNT RULES --------------------------------------------------

export async function addDiscountRule(rule) {
  const { _id, ...payload } = rule;
  const id = uuid();
  const sort_order = await nextSortOrder(TYPE.DISCOUNT_RULE);
  await db.menu_local.put({
    id,
    type: TYPE.DISCOUNT_RULE,
    name: payload.name || '',
    rule_type: payload.type || '',
    payload,
    is_active: payload.isActive ?? true,
    sort_order,
  });
  return id;
}

export async function updateDiscountRule(id, rule) {
  const { _id, ...payload } = rule;
  await db.menu_local.update(id, {
    name: payload.name || '',
    rule_type: payload.type || '',
    payload,
    is_active: payload.isActive ?? true,
  });
}

export async function deleteDiscountRule(id) {
  await db.menu_local.delete(id);
}
