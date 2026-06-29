// Floor-plan data-access (local 'guest' mode). Mirrors every export of
// floorCloud.js but reads/writes the Dexie `floor_plan` store instead of
// Supabase. The in-memory shape is byte-for-byte the same so the dispatcher in
// floors.js can swap backends without consumers branching on mode.
//
// IDs are client-generated UUIDs — integer ids would collide with existing
// Supabase rows when the user upgrades and the migration pushes this up.

import { db } from '../db';

function rowToFloor(row) {
  return {
    id: row.id,
    name: row.name,
    zone: row.zone || '',
    isActive: row.is_active !== false,
    sortOrder: row.sort_order ?? 0,
    document: row.data?.document || null,
  };
}

export async function loadFloors() {
  const rows = await db.floor_plan.toArray();
  rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return rows.map(rowToFloor);
}

export async function addFloor(floor) {
  const rows = await db.floor_plan.toArray();
  const nextOrder = rows.reduce((max, r) => Math.max(max, r.sort_order ?? -1), -1) + 1;
  const id = floor.id || crypto.randomUUID();
  await db.floor_plan.put({
    id,
    name: floor.name,
    zone: floor.zone || '',
    is_active: floor.isActive !== false,
    sort_order: floor.sortOrder ?? nextOrder,
    data: { document: floor.document ?? null },
  });
  return id;
}

export async function updateFloor(id, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.zone !== undefined) row.zone = patch.zone || '';
  if (patch.isActive !== undefined) row.is_active = patch.isActive !== false;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.document !== undefined) {
    const cur = await db.floor_plan.get(id);
    row.data = { ...(cur?.data || {}), document: patch.document };
  }
  await db.floor_plan.update(id, row);
}

export async function deleteFloor(id) {
  await db.floor_plan.delete(id);
}
