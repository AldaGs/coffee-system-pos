// Single source of truth for which "mode" the install is running in.
//
//   'cloud' — the original tinypos flow: a connected Supabase project is the
//             source of truth; sync drains the local Dexie queue upward.
//   'local' — the no-infrastructure guest mode: everything lives on-device in
//             IndexedDB, credentials are stored locally (hashed), and the sync
//             layer is a no-op until the user upgrades to a cloud project.
//
// The flag is ABSENT on every install that existed before this feature, so
// `getMode()` defaults to 'cloud' — existing devices behave exactly as they
// did before. See docs/local-first-mode-plan.md.

const MODE_KEY = 'tinypos_mode';

export const MODE_CLOUD = 'cloud';
export const MODE_LOCAL = 'local';

export function getMode() {
  try {
    return localStorage.getItem(MODE_KEY) === MODE_LOCAL ? MODE_LOCAL : MODE_CLOUD;
  } catch {
    return MODE_CLOUD;
  }
}

export function isLocalMode() {
  return getMode() === MODE_LOCAL;
}

export function setMode(mode) {
  try {
    if (mode === MODE_LOCAL) {
      localStorage.setItem(MODE_KEY, MODE_LOCAL);
    } else {
      // 'cloud' is the implicit default — clear the key rather than storing it,
      // so an upgraded install is indistinguishable from a legacy cloud one.
      localStorage.removeItem(MODE_KEY);
    }
  } catch { /* noop */ }
}
