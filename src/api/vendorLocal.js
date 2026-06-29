// Vendor registry data-access (local 'guest' mode). Mirrors every export of
// vendorCloud.js but reads/writes the Dexie `vendors` store instead of Supabase.
// The in-memory shape is byte-for-byte the same so the dispatcher in vendors.js
// can swap backends without consumers branching on mode.
//
// IDs are client-generated UUIDs — integer ids would collide with existing
// Supabase rows when the user upgrades and the migration pushes this registry up.

import { db } from '../db';

function rowToVendor(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact || '',
    commissionPercent: Number(row.commission_percent) || 0,
    splitType: row.data?.splitType === 'cost' ? 'cost' : 'percentage',
    commissionBase: row.data?.commissionBase === 'base' ? 'base' : 'gross',
    isActive: row.is_active !== false,
    sortOrder: row.sort_order ?? 0,
  };
}

export async function loadVendors() {
  const rows = await db.vendors.toArray();
  rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return rows.map(rowToVendor);
}

export async function addVendor(vendor) {
  const rows = await db.vendors.toArray();
  const nextOrder = rows.reduce((max, r) => Math.max(max, r.sort_order ?? -1), -1) + 1;
  const id = vendor.id || crypto.randomUUID();
  await db.vendors.put({
    id,
    name: vendor.name,
    contact: vendor.contact || '',
    commission_percent: Number(vendor.commissionPercent) || 0,
    is_active: vendor.isActive !== false,
    sort_order: vendor.sortOrder ?? nextOrder,
    data: {
      splitType: vendor.splitType === 'cost' ? 'cost' : 'percentage',
      commissionBase: vendor.commissionBase === 'base' ? 'base' : 'gross',
    },
  });
  return id;
}

export async function updateVendor(id, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.contact !== undefined) row.contact = patch.contact || '';
  if (patch.commissionPercent !== undefined) row.commission_percent = Number(patch.commissionPercent) || 0;
  if (patch.isActive !== undefined) row.is_active = patch.isActive !== false;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.splitType !== undefined || patch.commissionBase !== undefined) {
    const cur = await db.vendors.get(id);
    const data = { ...(cur?.data || {}) };
    if (patch.splitType !== undefined) data.splitType = patch.splitType === 'cost' ? 'cost' : 'percentage';
    if (patch.commissionBase !== undefined) data.commissionBase = patch.commissionBase === 'base' ? 'base' : 'gross';
    row.data = data;
  }
  await db.vendors.update(id, row);
}

export async function deleteVendor(id) {
  await db.vendors.delete(id);
}
