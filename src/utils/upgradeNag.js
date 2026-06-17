// Upgrade-nudge ("nag") engine for local ('guest') mode.
//
// Local data lives only on this device. After the user gets value from the app
// (adds items, rings up sales, logs inventory, shares a ticket) we periodically
// invite them to create a free Supabase project for backup + multi-device. The
// invitation must feel earned, not spammy — so we count engagement events and
// only surface the dialog when a milestone is crossed AND a snooze window has
// elapsed, escalating the threshold each time so it appears less often over time.
//
// All state lives in the Dexie `nag_state` store under key 'state'. The whole
// module is inert outside local mode.

import { db } from '../db';
import { isLocalMode } from './appMode';

const KEY = 'state';

// Per-event-type thresholds for the FIRST nag. Each subsequent nag requires the
// next multiple (3 sales → 6 → 9…), so the prompt naturally backs off.
const THRESHOLDS = {
  items_added: 3,
  sales_completed: 3,
  inventory_logged: 1,
  ticket_shared: 1,
};

// Don't show the nag more than once per this window, regardless of activity.
const SNOOZE_MS = 48 * 60 * 60 * 1000; // 48h

const DEFAULT_STATE = { counts: {}, shownCount: 0, lastNagAt: 0, dismissed: false };

async function readState() {
  const row = await db.nag_state.get(KEY);
  return { ...DEFAULT_STATE, ...(row || {}) };
}

async function writeState(state) {
  await db.nag_state.put({ key: KEY, ...state });
}

// Record one engagement event and return true if the upgrade nag should be shown
// now. No-op (returns false) outside local mode or once permanently dismissed.
export async function recordEvent(type, amount = 1) {
  if (!isLocalMode()) return false;
  const state = await readState();
  state.counts[type] = (state.counts[type] || 0) + amount;
  await writeState(state);

  if (state.dismissed) return false;
  if (Date.now() - (state.lastNagAt || 0) < SNOOZE_MS) return false;

  // Trigger once any tracked counter reaches the threshold for the current tier.
  const tier = state.shownCount + 1;
  return Object.entries(THRESHOLDS).some(
    ([k, thr]) => (state.counts[k] || 0) >= thr * tier
  );
}

// Call after the nag has actually been displayed — advances the tier and resets
// the snooze clock.
export async function markNagShown() {
  const state = await readState();
  state.shownCount += 1;
  state.lastNagAt = Date.now();
  await writeState(state);
}

// User chose "don't show again".
export async function dismissNagForever() {
  const state = await readState();
  state.dismissed = true;
  await writeState(state);
}
