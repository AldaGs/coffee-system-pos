// Floor-plan data-access (cloud mode). Reads/writes the dedicated `floor_plan`
// table introduced in migration 025_tables.sql. Mirrors the shape returned by
// floorLocal.js so consumers never branch on mode — the dispatcher in floors.js
// picks this module when NOT isLocalMode().
//
// In-memory floor shape:
//   { id, name, zone, isActive, sortOrder, document }
// `document` is the canvas doc of table nodes (shape defined by the Phase-2
// floor editor); it rides on the reserved `data` jsonb column as { document }.

import { supabase } from '../supabaseClient';

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

function floorToRow(floor) {
  const row = {
    id: floor.id,
    name: floor.name,
    zone: floor.zone || '',
    is_active: floor.isActive !== false,
    sort_order: floor.sortOrder ?? 0,
  };
  // Only write `data` when the caller actually carries a document, so a metadata
  // patch (rename / reorder) never clobbers the stored layout.
  if (floor.document !== undefined) row.data = { document: floor.document };
  return row;
}

export async function loadFloors() {
  const { data, error } = await supabase
    .from('floor_plan').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToFloor);
}

export async function addFloor(floor) {
  const { data: maxRow, error: maxErr } = await supabase
    .from('floor_plan').select('sort_order')
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (maxErr) throw maxErr;
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const row = floorToRow({ ...floor, sortOrder: nextOrder });
  if (!row.id) row.id = crypto.randomUUID();
  if (row.data === undefined) row.data = { document: null };
  const { error } = await supabase.from('floor_plan').insert(row);
  if (error) throw error;
  return row.id;
}

export async function updateFloor(id, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.zone !== undefined) row.zone = patch.zone || '';
  if (patch.isActive !== undefined) row.is_active = patch.isActive !== false;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  // The document lives in `data`; read-modify-write so a future sibling key in
  // `data` is not clobbered.
  if (patch.document !== undefined) {
    const { data: cur } = await supabase.from('floor_plan').select('data').eq('id', id).maybeSingle();
    row.data = { ...(cur?.data || {}), document: patch.document };
  }
  const { error } = await supabase.from('floor_plan').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteFloor(id) {
  const { error } = await supabase.from('floor_plan').delete().eq('id', id);
  if (error) throw error;
}
