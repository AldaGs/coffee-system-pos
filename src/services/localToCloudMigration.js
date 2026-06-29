// One-time local ('guest') → cloud upgrade migration.
//
// Runs AFTER the user has created + connected a Supabase project (so the keys
// exist on disk and `supabase` is a live client) but BEFORE we flip
// tinypos_mode to 'cloud'. It pushes everything that lived only in Dexie up to
// the new project, then the caller flips the mode and reloads into a normal
// cloud install.
//
// Ordering matters because of foreign keys and id remapping:
//   1. inventory      — gives every local item a real cloud id (oldId→newId map)
//   2. customers      — loyalty visit counts (keyed by phone, no remap)
//   3. menu           — categories → groups/options → items (linkedWarehouseId
//                       and modifier deduction targets remapped via the inv map)
//                       → discount rules → settings blob
//   4. ledgers        — sales (db.syncQueue), inventory_logs, expenses
//
// IMPORTANT LIMITATION: cashier/admin PINs are stored only as local hashes
// (verify_pin needs the plaintext to re-hash server-side), so they cannot be
// migrated. The owner must re-enter PINs in the Team tab after upgrading. The
// migration surfaces this to the caller via the returned `notes`.
//
// The migration is best-effort per-section: a failure in one section is logged
// and collected, not fatal, so a partial network hiccup doesn't strand the user
// half-upgraded with no way forward. Sales/logs use upsert(onConflict:local_id)
// so re-running is safe.

import { supabase } from '../supabaseClient';
import { db } from '../db';
import * as menuLocal from '../api/menuLocal';
import * as cloud from '../api/menuCloud';
import * as vendorLocal from '../api/vendorLocal';
import * as vendorCloud from '../api/vendorCloud';
import { useMenuStore } from '../store/useMenuStore';

const noop = () => {};

// Remap an inventory reference through the oldId→newId map, leaving unknown
// values untouched (e.g. a recipe link that was never a local inventory id).
const remap = (map, id) => (id != null && map.has(String(id)) ? map.get(String(id)) : id);

export async function migrateLocalToCloud(onProgress = noop) {
  const errors = [];
  const notes = [];
  const invIdMap = new Map(); // String(localId) -> cloudId

  // ---- 0. ALLOWLIST: register this admin so RLS permits the writes ---------
  // The signed-in admin (established by SetupScreen before the reload) must
  // exist in app_users for the per-table RLS policies to allow inserts. App's
  // allowlist effect normally does this on SIGNED_IN, but it's skipped during
  // the local-mode migration — so we run the bootstrap RPC explicitly first.
  onProgress({ phase: 'auth' });
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { ok: false, errors: ['No hay sesión activa. Vuelve a intentar el respaldo.'], notes: [] };
    }
    await supabase.rpc('claim_or_bootstrap_app_user');
  } catch (e) {
    // Older schemas may not have the RPC; the writes below will reveal if RLS
    // still blocks. Don't hard-fail here.
    console.warn('claim_or_bootstrap_app_user during migration:', e?.message);
  }

  // ---- 1. INVENTORY -------------------------------------------------------
  onProgress({ phase: 'inventory' });
  try {
    const localInv = await db.inventory.toArray();
    for (const item of localInv) {
      const { id: localId, ...payload } = item;
      const { data, error } = await supabase.from('inventory').insert([payload]).select();
      if (error) throw error;
      invIdMap.set(String(localId), data[0].id);
    }
  } catch (e) {
    errors.push(`Inventario: ${e.message}`);
  }

  // ---- 2. CUSTOMERS (loyalty) --------------------------------------------
  onProgress({ phase: 'customers' });
  try {
    const customers = await db.customers.toArray();
    if (customers.length) {
      const { error } = await supabase
        .from('customers')
        .upsert(customers, { onConflict: 'phone' });
      if (error) throw error;
    }
  } catch (e) {
    errors.push(`Clientes: ${e.message}`);
  }

  // ---- 2b. VENDORS --------------------------------------------------------
  // Push the consignment registry up first so item.data.vendorId references
  // (preserved verbatim — vendor ids are client UUIDs) resolve against real
  // cloud rows. Re-running is safe: ids are reused, so duplicate inserts fail
  // only on the PK, which we swallow per-vendor.
  onProgress({ phase: 'vendors' });
  try {
    const vendors = await vendorLocal.loadVendors();
    for (const vendor of vendors) {
      try {
        await vendorCloud.addVendor(vendor);
      } catch (e) {
        // Likely a re-run (PK conflict) — leave the existing row as-is.
        if (!String(e.message || '').includes('duplicate')) throw e;
      }
    }
  } catch (e) {
    errors.push(`Vendedores: ${e.message}`);
  }

  // ---- 3. MENU ------------------------------------------------------------
  onProgress({ phase: 'menu' });
  try {
    const menu = await menuLocal.loadMenu();

    // Categories (preserve order + hidden flags).
    for (const name of menu.categoryOrder) {
      await cloud.addCategory(name);
      if (menu.hiddenCategories.includes(name)) {
        await cloud.setCategoryHidden(name, true);
      }
    }

    // Modifier groups + options. menuLocal keys groups by their slug id, which
    // we preserve into the cloud (renameModifierGroup uses the same id).
    for (const [groupId, options] of Object.entries(menu.modifierGroups)) {
      await cloud.addModifierGroup(groupId, groupId);
      if (menu.modifierGroupSettings[groupId]?.allowMultiple) {
        await cloud.setModifierGroupAllowMultiple(groupId, true);
      }
      if (menu.modifierGroupSettings[groupId]?.isHidden) {
        await cloud.setModifierGroupHidden(groupId, true);
      }
      for (const opt of options) {
        await cloud.addModifierOption(groupId, {
          ...opt,
          deductionTargetId: remap(invIdMap, opt.deductionTargetId),
          substitutionTargetId: remap(invIdMap, opt.substitutionTargetId),
        });
      }
    }

    // Items, with inventory references remapped to their new cloud ids.
    for (const [categoryName, items] of Object.entries(menu.categories)) {
      for (const item of items) {
        const migrated = {
          ...item,
          linkedWarehouseId: remap(invIdMap, item.linkedWarehouseId),
        };
        await cloud.addItem(categoryName, migrated);
        if (item.allowedModifiers?.length) {
          await cloud.setItemModifiers(item.id, item.allowedModifiers);
        }
        if (item.isHidden) {
          await cloud.setItemHidden(item.id, true);
        }
      }
    }

    // Discount rules.
    for (const rule of menu.discountRules) {
      const { _id, ...payload } = rule;
      await cloud.addDiscountRule(payload);
    }
  } catch (e) {
    errors.push(`Menú: ${e.message}`);
  }

  // ---- 3b. SETTINGS blob --------------------------------------------------
  onProgress({ phase: 'settings' });
  try {
    const cached = useMenuStore.getState().menuData || {};
    const settingsOnly = {
      // pins are local-only (hashed) and can't be migrated; strip them.
      cashiers: (cached.cashiers || []).map((c) => { const cc = { ...c }; delete cc.pin; return cc; }),
      posSettings: cached.posSettings || {},
      receiptSettings: cached.receiptSettings || {},
      loyaltySettings: cached.loyaltySettings || {},
    };
    const { error } = await supabase.from('shop_settings').update({ menu_data: settingsOnly }).eq('id', 1);
    if (error) throw error;
    // NOTE: the "re-create admin + PINs in the Team tab" warning is shown
    // unconditionally by MigrationScreen on success, so we don't duplicate it
    // here in `notes`.
  } catch (e) {
    errors.push(`Configuración: ${e.message}`);
  }

  // ---- 4. LEDGERS: sales, inventory logs, expenses ------------------------
  onProgress({ phase: 'ledgers' });
  try {
    // Sales accumulated in the offline queue during local use.
    const pendingSales = await db.syncQueue.toArray();
    if (pendingSales.length) {
      const clean = pendingSales.map(({ id: _UNUSED, ...rest }) => rest); // eslint-disable-line no-unused-vars
      const { error } = await supabase.from('sales').upsert(clean, { onConflict: 'local_id' });
      if (error) throw error;
      await db.syncQueue.clear();
    }

    // Inventory logs (audit/restock/sale trail).
    const logs = await db.inventory_logs.toArray();
    if (logs.length) {
      const clean = logs.map(({ id: _UNUSED, ...rest }) => rest); // eslint-disable-line no-unused-vars
      const { error } = await supabase.from('inventory_logs').upsert(clean, { onConflict: 'local_id' });
      if (error) throw error;
      await db.inventory_logs.clear();
    }

    // Expenses recorded locally (these never entered the cloud expense queue).
    const expenses = await db.expenses.toArray();
    if (expenses.length) {
      const clean = expenses.map((e) => ({
        amount: e.amount,
        reason: e.reason,
        category: e.category || 'General',
        cashier_name: e.cashierName || 'Unknown',
        local_id: e.id,
      }));
      const { error } = await supabase.from('expenses').upsert(clean, { onConflict: 'local_id' });
      if (error) throw error;
    }

    // Vendor payout ledger recorded locally (financial records — preserve them).
    const vendorPayouts = await db.vendor_payouts.toArray();
    if (vendorPayouts.length) {
      const clean = vendorPayouts.map((p) => {
        const row = { ...p };
        delete row.id; // drop Dexie autoincrement id; cloud assigns its own
        return row;
      });
      const { error } = await supabase.from('vendor_payouts').upsert(clean, { onConflict: 'local_id' });
      if (error) throw error;
    }
  } catch (e) {
    errors.push(`Ventas/gastos: ${e.message}`);
  }

  onProgress({ phase: 'done' });
  return { ok: errors.length === 0, errors, notes };
}
