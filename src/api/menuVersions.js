// Menu versioning wrappers. Snapshots are written server-side by the
// snapshot_menu() RPC (idempotent — duplicate-of-last snapshots are skipped),
// restore is server-side too (atomic wipe + replay in one transaction).
//
// debouncedSnapshot() is the workhorse from Admin: every successful menu
// write calls it, and a single snapshot lands ~5s after the burst settles.

import { supabase } from '../supabaseClient';

const DEBOUNCE_MS = 5000;
const BOOT_SNAPSHOT_MIN_AGE_HOURS = 24;

let pendingTimer = null;
let pendingOp = null;

export function debouncedSnapshot(triggerOp) {
  pendingOp = triggerOp || pendingOp || 'menu-write';
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    const op = pendingOp;
    pendingOp = null;
    pendingTimer = null;
    supabase.rpc('snapshot_menu', { p_reason: 'auto', p_trigger_op: op })
      .then(({ error }) => {
        if (error) console.warn('snapshot_menu failed:', error.message);
      });
  }, DEBOUNCE_MS);
}

// Called once at app boot. If the most recent snapshot is older than the
// threshold (or doesn't exist), write a fresh one. Avoids gaps from passive
// sessions that never edit.
export async function snapshotIfStale() {
  const { data, error } = await supabase
    .from('menu_versions')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return;
  if (data) {
    const ageHours = (Date.now() - new Date(data.created_at).getTime()) / 3_600_000;
    if (ageHours < BOOT_SNAPSHOT_MIN_AGE_HOURS) return;
  }
  await supabase.rpc('snapshot_menu', { p_reason: 'auto', p_trigger_op: 'boot' });
}

export async function manualSnapshot(label) {
  const { data, error } = await supabase.rpc('snapshot_menu', {
    p_reason: 'manual',
    p_trigger_op: label || null
  });
  if (error) throw error;
  return data;
}

export async function listVersions(limit = 100) {
  const { data, error } = await supabase
    .from('menu_versions')
    .select('id, created_at, reason, trigger_op')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getVersion(id) {
  const { data, error } = await supabase
    .from('menu_versions')
    .select('id, created_at, reason, trigger_op, snapshot')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function restoreVersion(id) {
  const { data, error } = await supabase.rpc('restore_menu_version', {
    p_version_id: id
  });
  if (error) throw error;
  return data;
}
