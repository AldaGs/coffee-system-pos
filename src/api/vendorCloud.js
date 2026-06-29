// Vendor registry data-access (cloud mode). Reads/writes the dedicated
// `vendors` table introduced in migration 023_vendors.sql. Mirrors the shape
// returned by vendorLocal.js so consumers never branch on mode — the dispatcher
// in vendors.js picks this module when NOT isLocalMode().
//
// In-memory vendor shape:
//   { id, name, contact, commissionPercent, splitType, isActive, sortOrder }
// commissionPercent is the percentage the house keeps (0–100). splitType selects
// how the house cut is computed at settlement:
//   'percentage'    — house keeps commissionPercent of net revenue (default)
//   'cost'          — house keeps the per-item production cost (cost-recovery deal:
//                     the vendor gets all profit). The per-item cost lives on the
//                     menu item (vendorUnitCostCents), not here.
// splitType rides on the reserved `data` jsonb column so no schema change is needed.

import { supabase } from '../supabaseClient';

function rowToVendor(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact || '',
    commissionPercent: Number(row.commission_percent) || 0,
    splitType: row.data?.splitType === 'cost' ? 'cost' : 'percentage',
    isActive: row.is_active !== false,
    sortOrder: row.sort_order ?? 0,
  };
}

function vendorToRow(vendor) {
  return {
    id: vendor.id,
    name: vendor.name,
    contact: vendor.contact || '',
    commission_percent: Number(vendor.commissionPercent) || 0,
    is_active: vendor.isActive !== false,
    sort_order: vendor.sortOrder ?? 0,
    data: { splitType: vendor.splitType === 'cost' ? 'cost' : 'percentage' },
  };
}

export async function loadVendors() {
  const { data, error } = await supabase
    .from('vendors').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToVendor);
}

export async function addVendor(vendor) {
  const { data: maxRow, error: maxErr } = await supabase
    .from('vendors').select('sort_order')
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (maxErr) throw maxErr;
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const row = vendorToRow({ ...vendor, sortOrder: nextOrder });
  if (!row.id) row.id = crypto.randomUUID();
  const { error } = await supabase.from('vendors').insert(row);
  if (error) throw error;
  return row.id;
}

export async function updateVendor(id, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.contact !== undefined) row.contact = patch.contact || '';
  if (patch.commissionPercent !== undefined) row.commission_percent = Number(patch.commissionPercent) || 0;
  if (patch.isActive !== undefined) row.is_active = patch.isActive !== false;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.splitType !== undefined) row.data = { splitType: patch.splitType === 'cost' ? 'cost' : 'percentage' };
  const { error } = await supabase.from('vendors').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteVendor(id) {
  const { error } = await supabase.from('vendors').delete().eq('id', id);
  if (error) throw error;
}
