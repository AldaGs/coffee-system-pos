// Menu data access layer. Replaces the old shop_settings.menu_data blob with
// targeted reads/writes against the dedicated tables introduced in migration
// 010_split_menu_data.sql:
//
//   menu_categories
//   menu_items
//   menu_modifier_groups        (allow_multiple folded in as a column)
//   menu_modifier_options
//   menu_item_modifier_groups   (item ↔ group join)
//   menu_discount_rules
//
// `loadMenu()` returns the same in-memory shape Admin.jsx and Register.jsx
// already use, so consumers don't change. Writers are per-entity and throw on
// error; handlers are responsible for optimistic local updates + rollback by
// re-loading on failure.

import { supabase } from '../supabaseClient';

// ---------- LOADER -----------------------------------------------------------

// Returns:
//   {
//     categories:            { [name]: Item[] },
//     categoryOrder:         string[],
//     hiddenCategories:      string[],
//     modifierGroups:        { [groupId]: Option[] },
//     modifierGroupSettings: { [groupId]: { allowMultiple: bool } },
//     discountRules:         Rule[]
//   }
//
// Item shape matches the legacy menu_data items so EditDrinkModal, Register,
// MenuTab, etc. keep working unchanged.
export async function loadMenu() {
  const [catsRes, itemsRes, groupsRes, optsRes, linksRes, rulesRes] = await Promise.all([
    supabase.from('menu_categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('menu_items').select('*').order('sort_order', { ascending: true }),
    supabase.from('menu_modifier_groups').select('*').order('sort_order', { ascending: true }),
    supabase.from('menu_modifier_options').select('*').order('sort_order', { ascending: true }),
    supabase.from('menu_item_modifier_groups').select('*').order('sort_order', { ascending: true }),
    supabase.from('menu_discount_rules').select('*').order('sort_order', { ascending: true })
  ]);

  for (const r of [catsRes, itemsRes, groupsRes, optsRes, linksRes, rulesRes]) {
    if (r.error) throw r.error;
  }

  const cats = catsRes.data || [];
  const items = itemsRes.data || [];
  const groups = groupsRes.data || [];
  const opts = optsRes.data || [];
  const links = linksRes.data || [];
  const rules = rulesRes.data || [];

  // category_id → name lookup
  const catName = new Map(cats.map(c => [c.id, c.name]));

  // item_id → ordered group ids (allowedModifiers)
  const allowedByItem = new Map();
  for (const l of links) {
    if (!allowedByItem.has(l.item_id)) allowedByItem.set(l.item_id, []);
    allowedByItem.get(l.item_id).push(l.group_id);
  }

  // categories: { [name]: Item[] } — preserves item sort_order via the query order
  const categories = {};
  for (const c of cats) categories[c.name] = [];
  for (const it of items) {
    const name = catName.get(it.category_id);
    if (!name) continue;
    categories[name].push(rowToItem(it, allowedByItem.get(it.id) || []));
  }

  const categoryOrder = cats.map(c => c.name);
  const hiddenCategories = cats.filter(c => c.is_hidden).map(c => c.name);

  // modifierGroups + modifierGroupSettings
  const modifierGroups = {};
  const modifierGroupSettings = {};
  for (const g of groups) {
    modifierGroups[g.id] = [];
    modifierGroupSettings[g.id] = { allowMultiple: !!g.allow_multiple };
  }
  for (const o of opts) {
    if (!modifierGroups[o.group_id]) continue;
    modifierGroups[o.group_id].push(rowToOption(o));
  }

  // discount rules: payload preserves the original rule shape; attach db id for updates
  const discountRules = rules.map(r => ({ ...r.payload, _id: r.id }));

  return {
    categories,
    categoryOrder,
    hiddenCategories,
    modifierGroups,
    modifierGroupSettings,
    discountRules
  };
}

function rowToItem(row, allowedModifiers) {
  const data = row.data || {};
  return {
    id: row.id,
    name: row.name,
    basePrice: row.base_price_cents,
    priceType: row.price_type,
    emoji: row.emoji,
    imageUrl: row.image_url || '',
    allowedModifiers,
    inventoryMode: data.inventoryMode || 'none',
    linkedWarehouseId: data.linkedWarehouseId || '',
    linkedRecipeId: data.linkedRecipeId || '',
    ...data
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
    substitutionTarget: data.substitutionTarget ?? null
  };
}

// Extracts the columns that promote-to-fields, returning the residual that
// belongs in the items.data jsonb.
function itemDataResidual(item) {
  const {
    id, name, basePrice, priceType, emoji, imageUrl, allowedModifiers,
    ...rest
  } = item;
  return rest;
}

function optionDataResidual(opt) {
  const { id, name, price, ...rest } = opt;
  return rest;
}

// ---------- CATEGORY WRITERS -------------------------------------------------

export async function addCategory(name) {
  const { data: maxRow, error: maxErr } = await supabase
    .from('menu_categories').select('sort_order')
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (maxErr) throw maxErr;
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from('menu_categories')
    .insert({ name, sort_order: nextOrder, is_hidden: false });
  if (error) throw error;
}

export async function renameCategory(oldName, newName) {
  const { error } = await supabase
    .from('menu_categories').update({ name: newName }).eq('name', oldName);
  if (error) throw error;
}

export async function deleteCategory(name) {
  const { error } = await supabase
    .from('menu_categories').delete().eq('name', name);
  if (error) throw error;
}

// Writes sort_order = index for each name in the given order.
export async function reorderCategories(orderedNames) {
  await Promise.all(orderedNames.map((name, idx) =>
    supabase.from('menu_categories').update({ sort_order: idx }).eq('name', name)
      .then(({ error }) => { if (error) throw error; })
  ));
}

export async function setCategoryHidden(name, isHidden) {
  const { error } = await supabase
    .from('menu_categories').update({ is_hidden: isHidden }).eq('name', name);
  if (error) throw error;
}

// ---------- ITEM WRITERS -----------------------------------------------------

async function categoryIdByName(name) {
  const { data, error } = await supabase
    .from('menu_categories').select('id').eq('name', name).single();
  if (error) throw error;
  return data.id;
}

export async function addItem(categoryName, item) {
  const category_id = await categoryIdByName(categoryName);

  const { data: maxRow, error: maxErr } = await supabase
    .from('menu_items').select('sort_order').eq('category_id', category_id)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (maxErr) throw maxErr;
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await supabase.from('menu_items').insert({
    id: item.id,
    category_id,
    name: item.name,
    base_price_cents: item.basePrice ?? 0,
    price_type: item.priceType || 'fixed',
    emoji: item.emoji || '',
    sort_order: nextOrder,
    is_hidden: false,
    data: itemDataResidual(item)
  });
  if (error) throw error;
}

// Updates promoted fields + data jsonb, optionally moving to a new category.
// When moving, appends to the destination (sort_order = max+1) — matches the
// legacy push semantics.
export async function updateItem(id, item, newCategoryName) {
  const patch = {
    name: item.name,
    base_price_cents: item.basePrice ?? 0,
    price_type: item.priceType || 'fixed',
    emoji: item.emoji || '',
    data: itemDataResidual(item)
  };
  if (newCategoryName !== undefined) {
    patch.category_id = await categoryIdByName(newCategoryName);
    const { data: maxRow, error: maxErr } = await supabase
      .from('menu_items').select('sort_order').eq('category_id', patch.category_id)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle();
    if (maxErr) throw maxErr;
    patch.sort_order = (maxRow?.sort_order ?? -1) + 1;
  }
  const { error } = await supabase.from('menu_items').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteItem(id) {
  // menu_item_modifier_groups cascade-deletes via FK.
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

// ---------- MODIFIER GROUP WRITERS ------------------------------------------

export async function addModifierGroup(id, name) {
  const { data: maxRow, error: maxErr } = await supabase
    .from('menu_modifier_groups').select('sort_order')
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (maxErr) throw maxErr;
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await supabase.from('menu_modifier_groups').insert({
    id, name, allow_multiple: false, sort_order: nextOrder
  });
  if (error) throw error;
}

// Changes the slug id (cascades to options + item links via FK ON UPDATE CASCADE)
// and the display name.
export async function renameModifierGroup(oldId, newId, newName) {
  const { error } = await supabase
    .from('menu_modifier_groups').update({ id: newId, name: newName }).eq('id', oldId);
  if (error) throw error;
}

export async function deleteModifierGroup(id) {
  const { error } = await supabase.from('menu_modifier_groups').delete().eq('id', id);
  if (error) throw error;
}

export async function setModifierGroupAllowMultiple(id, allowMultiple) {
  const { error } = await supabase
    .from('menu_modifier_groups').update({ allow_multiple: allowMultiple }).eq('id', id);
  if (error) throw error;
}

// ---------- MODIFIER OPTION WRITERS -----------------------------------------

export async function addModifierOption(groupId, option) {
  const { data: maxRow, error: maxErr } = await supabase
    .from('menu_modifier_options').select('sort_order').eq('group_id', groupId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (maxErr) throw maxErr;
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await supabase.from('menu_modifier_options').insert({
    id: option.id,
    group_id: groupId,
    name: option.name,
    price_delta_cents: option.price ?? 0,
    sort_order: nextOrder,
    data: optionDataResidual(option)
  });
  if (error) throw error;
}

// Options have no inbound FKs, so updating id in place is safe.
export async function updateModifierOption(oldOptionId, groupId, option) {
  const { error } = await supabase.from('menu_modifier_options').update({
    id: option.id,
    name: option.name,
    price_delta_cents: option.price ?? 0,
    data: optionDataResidual(option)
  }).eq('id', oldOptionId).eq('group_id', groupId);
  if (error) throw error;
}

export async function deleteModifierOption(groupId, optionId) {
  const { error } = await supabase
    .from('menu_modifier_options').delete().eq('id', optionId).eq('group_id', groupId);
  if (error) throw error;
}

// ---------- ITEM ↔ MODIFIER GROUP ATTACHMENTS -------------------------------

// Replaces the full set for an item — wipe + insert in the given order.
// Not transactional from the client, but a failed re-insert leaves the item
// with no groups, which the caller can recover from by re-loading.
export async function setItemModifiers(itemId, groupIds) {
  const { error: delErr } = await supabase
    .from('menu_item_modifier_groups').delete().eq('item_id', itemId);
  if (delErr) throw delErr;
  if (groupIds.length === 0) return;
  const rows = groupIds.map((gid, idx) => ({ item_id: itemId, group_id: gid, sort_order: idx }));
  const { error: insErr } = await supabase
    .from('menu_item_modifier_groups').insert(rows);
  if (insErr) throw insErr;
}

// ---------- DISCOUNT RULES --------------------------------------------------

// Rules don't have a natural client-side id, so the in-memory shape carries
// `_id` (db PK) on each rule for update/delete. addDiscountRule strips it from
// the payload when writing.
// Returns the inserted row's db id so the caller can hydrate optimistic state
// for follow-up updates (toggle active / delete) without a reload.
export async function addDiscountRule(rule) {
  const { _id, ...payload } = rule;
  const { data: maxRow, error: maxErr } = await supabase
    .from('menu_discount_rules').select('sort_order')
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (maxErr) throw maxErr;
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase.from('menu_discount_rules').insert({
    name: payload.name || '',
    rule_type: payload.type || '',
    payload,
    is_active: payload.isActive ?? true,
    sort_order: nextOrder
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateDiscountRule(id, rule) {
  const { _id, ...payload } = rule;
  const { error } = await supabase.from('menu_discount_rules').update({
    name: payload.name || '',
    rule_type: payload.type || '',
    payload,
    is_active: payload.isActive ?? true
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteDiscountRule(id) {
  const { error } = await supabase.from('menu_discount_rules').delete().eq('id', id);
  if (error) throw error;
}
