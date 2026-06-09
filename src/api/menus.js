// Multi-menu data layer (migration 015). Manages rows in `menus` and
// `menu_schedules`. The implicit kind='live' row represents the catalog
// itself and cannot be deleted or have its kind changed — only its name,
// priority, is_active, and schedules are user-editable.
//
// Schedule shape (matches the DB row):
//   { id, menu_id, days_of_week, start_time, end_time, start_date, end_date }
// days_of_week: bitmask. Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64.
// 0 = every day. Time strings are 'HH:MM' or 'HH:MM:SS'. Dates are 'YYYY-MM-DD'.

import { supabase } from '../supabaseClient';

export const DAY_BITS = { mon: 1, tue: 2, wed: 4, thu: 8, fri: 16, sat: 32, sun: 64 };
export const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function daysToBitmask(days) {
  return days.reduce((acc, d) => acc | (DAY_BITS[d] || 0), 0);
}

export function bitmaskToDays(mask) {
  if (!mask) return [];
  return DAY_ORDER.filter(d => (mask & DAY_BITS[d]) !== 0);
}

// ---------- MENUS ------------------------------------------------------------

export async function loadMenus() {
  const [menusRes, schedulesRes] = await Promise.all([
    supabase.from('menus').select('*').order('priority', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('menu_schedules').select('*').order('id', { ascending: true })
  ]);
  if (menusRes.error) throw menusRes.error;
  if (schedulesRes.error) throw schedulesRes.error;

  const byMenu = new Map();
  for (const s of schedulesRes.data || []) {
    if (!byMenu.has(s.menu_id)) byMenu.set(s.menu_id, []);
    byMenu.get(s.menu_id).push(s);
  }
  return (menusRes.data || []).map(m => ({ ...m, schedules: byMenu.get(m.id) || [] }));
}

export async function addMenu({ name, kind = 'designed', priority = 1 }) {
  const { data, error } = await supabase
    .from('menus')
    .insert({ name, kind, priority, is_active: true, data: {} })
    .select('*').single();
  if (error) throw error;
  return data;
}

export async function updateMenu(id, patch) {
  const { error } = await supabase.from('menus').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteMenu(id) {
  // Schedules cascade-delete via FK.
  const { error } = await supabase.from('menus').delete().eq('id', id);
  if (error) throw error;
}

// ---------- SCHEDULES --------------------------------------------------------

export async function addSchedule(menuId, schedule) {
  const { data, error } = await supabase
    .from('menu_schedules')
    .insert({
      menu_id: menuId,
      days_of_week: schedule.days_of_week ?? 0,
      start_time: schedule.start_time || null,
      end_time: schedule.end_time || null,
      start_date: schedule.start_date || null,
      end_date: schedule.end_date || null
    })
    .select('*').single();
  if (error) throw error;
  return data;
}

export async function updateSchedule(id, patch) {
  const clean = {
    days_of_week: patch.days_of_week ?? 0,
    start_time: patch.start_time || null,
    end_time: patch.end_time || null,
    start_date: patch.start_date || null,
    end_date: patch.end_date || null
  };
  const { error } = await supabase.from('menu_schedules').update(clean).eq('id', id);
  if (error) throw error;
}

export async function deleteSchedule(id) {
  const { error } = await supabase.from('menu_schedules').delete().eq('id', id);
  if (error) throw error;
}
