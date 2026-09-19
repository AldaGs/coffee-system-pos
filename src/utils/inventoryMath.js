// Single source of truth for "what does this ticket consume from stock?".
//
// This used to live twice: once in validateStockLocally (read-only pre-flight)
// and once inline in processCheckout (the real deduction). The two copies had
// already drifted — the pre-flight and the deduction disagreed about how much a
// modifier consumes — so the check could pass and the deduction still be wrong.
// Both now call buildDeductionPlan and differ only in what they do with it.
//
// Pure and synchronous: callers pass the inventory array they already loaded, so
// this stays trivially testable (see src/tests/inventoryMath.test.js).

// Resolve an inventory row by id first (authoritative), then by name (how
// recipes and modifier targets were linked before ids existed).
export function findInventoryItem(inventory, id, name) {
  return (
    (id != null && id !== '' && inventory.find(inv => String(inv.id) === String(id)))
    || (name && inventory.find(inv => inv.name === name))
    || null
  );
}

// Build the bill of materials for ONE recipe-mode ticket line, applying the
// line's modifiers. Two modifier shapes exist:
//   * substitution (has BOTH a deduction and a substitution target): swap an
//     ingredient out for another, inheriting the replaced ingredient's qty —
//     "oat milk instead of whole milk".
//   * addition (deduction target only): add an ingredient on top — "extra shot".
// An addition scales with the line qty, exactly like a substitution does and
// like the standard-item path does: 3 lattes with an extra shot each consume 3
// shots, not 1.
function recipeBOM(recipe, line, lineQty) {
  const bom = (recipe.ingredients || []).map(ing => ({
    id: ing.id,
    item_name: ing.name,
    qty: (parseFloat(ing.qty) || 0) * lineQty,
  }));

  for (const mod of line.selectedModifiers || []) {
    const hasDeduct = mod.deductionTargetId || mod.deductionTarget;
    const hasSub = mod.substitutionTargetId || mod.substitutionTarget;
    if (!hasDeduct) continue;

    if (hasSub) {
      const baseIndex = mod.substitutionTargetId
        ? bom.findIndex(ing => String(ing.id) === String(mod.substitutionTargetId))
        : bom.findIndex(ing => ing.item_name === mod.substitutionTarget);
      if (baseIndex === -1) {
        // The ingredient this modifier replaces isn't in the recipe (renamed
        // ingredient, or the modifier is attached to the wrong item). Falling
        // through silently would deduct NOTHING for a substitution the customer
        // was charged for, so record it and still deduct the substitute at the
        // line qty — the closest correct behavior.
        bom.push({
          id: mod.deductionTargetId || null,
          item_name: mod.deductionTarget,
          qty: lineQty,
          orphanedSubstitution: mod.substitutionTarget || mod.substitutionTargetId || null,
        });
        continue;
      }
      const baseQty = bom[baseIndex].qty;
      bom.splice(baseIndex, 1);
      bom.push({ id: mod.deductionTargetId || null, item_name: mod.deductionTarget, qty: baseQty });
    } else {
      bom.push({ id: mod.deductionTargetId || null, item_name: mod.deductionTarget, qty: lineQty });
    }
  }

  return bom;
}

/**
 * Work out every stock movement a ticket implies.
 *
 * Returns:
 *   deductions — one entry per source (the ticket line itself, a modifier, or a
 *                recipe ingredient), each already resolved to a real inventory
 *                row. processCheckout writes one inventory_logs row per entry.
 *   unresolved — sources that reference an inventory item that no longer exists
 *                (stale linkedWarehouseId, renamed ingredient, orphaned
 *                substitution). These used to fall through silently and sell
 *                stock without moving it; callers now surface them.
 */
export function buildDeductionPlan({ items = [], recipes = [], inventory = [] }) {
  const deductions = [];
  const unresolved = [];

  const resolve = (id, name, source, lineName) => {
    const found = findInventoryItem(inventory, id, name);
    if (!found) unresolved.push({ source, target: name || String(id ?? ''), lineName });
    return found;
  };

  for (const line of items) {
    const lineQty = line.qty || 1;

    if (line.inventoryMode === 'standard' && line.linkedWarehouseId) {
      const whItem = resolve(line.linkedWarehouseId, null, 'item', line.name);
      if (whItem) {
        deductions.push({ id: whItem.id, name: whItem.name, qty: lineQty, unit_cost: whItem.unit_cost || 0 });
      }

      for (const mod of line.selectedModifiers || []) {
        const hasDeduct = mod.deductionTargetId || mod.deductionTarget;
        const hasSub = mod.substitutionTargetId || mod.substitutionTarget;
        // A substitution on a standard (non-recipe) item has no BOM to swap
        // inside, so it never deducted here and still doesn't.
        if (!hasDeduct || hasSub) continue;
        const modItem = resolve(mod.deductionTargetId, mod.deductionTarget, 'modifier', line.name);
        if (modItem) {
          deductions.push({ id: modItem.id, name: modItem.name, qty: lineQty, unit_cost: modItem.unit_cost || 0 });
        }
      }
    } else if (line.inventoryMode === 'recipe' && line.linkedRecipeId) {
      const recipe = recipes.find(r => String(r.id) === String(line.linkedRecipeId));
      if (!recipe?.ingredients) {
        if (!recipe) unresolved.push({ source: 'recipe', target: String(line.linkedRecipeId), lineName: line.name });
        continue;
      }

      for (const ing of recipeBOM(recipe, line, lineQty)) {
        if (!(ing.qty > 0)) continue;
        if (ing.orphanedSubstitution) {
          unresolved.push({ source: 'substitution', target: ing.orphanedSubstitution, lineName: line.name });
        }
        const whItem = resolve(ing.id, ing.item_name, 'ingredient', line.name);
        if (whItem) {
          deductions.push({ id: whItem.id, name: whItem.name, qty: ing.qty, unit_cost: whItem.unit_cost || 0 });
        }
      }
    }
  }

  return { deductions, unresolved };
}

// Total required per inventory id — what a stock check compares against, since
// one ticket can draw the same item from several lines.
export function aggregateDeductions(deductions) {
  const totals = new Map();
  for (const d of deductions) {
    const key = String(d.id);
    totals.set(key, (totals.get(key) || 0) + d.qty);
  }
  return totals;
}

// Human-readable summary of unresolved targets, for the warning the cashier and
// the console see. Kept here so checkout and the tests phrase it identically.
// Client mirror of the server's menu_item_available() RPC (schema >= 1.4), so
// the Menu Editor can flag what the public menu is treating as sold out.
// Keep the two in step: a standard item is out when its linked stock is <= 0;
// a recipe item is out when any non-manual ingredient (matched by NAME, missing
// = 0 stock) has less stock than the recipe uses. Unlinked or dangling links
// count as available, exactly like the RPC.
export function isMenuItemSoldOut(item, { inventory = [], recipes = [] } = {}) {
  const mode = item?.inventoryMode || 'none';
  if (mode === 'standard' || mode === 'warehouse') {
    if (!item.linkedWarehouseId) return false;
    const inv = inventory.find(i => String(i.id) === String(item.linkedWarehouseId));
    return inv ? !(Number(inv.current_stock) > 0) : false;
  }
  if (mode === 'recipe') {
    const recipe = recipes.find(r => r.id === item.linkedRecipeId);
    if (!recipe) return false;
    return (recipe.ingredients || []).some(ing => {
      if (ing.isManual) return false;
      const need = /^-?\d+(\.\d+)?$/.test(String(ing.qty ?? '')) ? Number(ing.qty) : 0;
      const inv = inventory.find(i => i.name === ing.name);
      return (Number(inv?.current_stock) || 0) < need;
    });
  }
  return false;
}

export function describeUnresolved(unresolved) {
  return unresolved
    .map(u => `${u.lineName || '?'} → ${u.target || '?'} (${u.source})`)
    .join(', ');
}
