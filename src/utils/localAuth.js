// Device-local credentials for local ('guest') mode.
//
// There is no server in local mode, so the owner's email/password is the device
// lock — analogous to a screen-lock PIN, not a recoverable account. We store
// ONLY a PBKDF2-SHA-256 hash + random salt in Dexie (`app_local` store, key
// 'credentials'); the plaintext password is never persisted.
//
// IMPORTANT UX consequence (surface in upgrade-nudge copy): a local credential
// is unrecoverable. If the user clears browser data it is gone — which is the
// strongest argument for upgrading to a cloud backup.

import { db } from '../db';

const CRED_KEY = 'credentials';
const PBKDF2_ITERATIONS = 150000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function toHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Derive a PBKDF2-SHA-256 hash of `password` with the given salt (Uint8Array).
async function deriveHash(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    HASH_BYTES * 8
  );
  return toHex(bits);
}

// Constant-time-ish string compare to avoid leaking match position via timing.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// True once a local owner credential has been created on this device.
export async function hasLocalCredential() {
  const row = await db.app_local.get(CRED_KEY);
  return !!row?.passwordHash;
}

export async function getLocalEmail() {
  const row = await db.app_local.get(CRED_KEY);
  return row?.email || null;
}

// Create (or overwrite) the device-local owner credential.
export async function createLocalCredential(email, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const passwordHash = await deriveHash(password, salt);
  await db.app_local.put({
    key: CRED_KEY,
    email: (email || '').trim().toLowerCase(),
    salt: toHex(salt),
    passwordHash,
    createdAt: new Date().toISOString(),
  });
}

// Verify an email/password pair against the stored hash. Email match is
// case-insensitive; returns true only when both email and password match.
export async function verifyLocalCredential(email, password) {
  const row = await db.app_local.get(CRED_KEY);
  if (!row?.passwordHash || !row?.salt) return false;
  if ((email || '').trim().toLowerCase() !== row.email) return false;
  const candidate = await deriveHash(password, fromHex(row.salt));
  return safeEqual(candidate, row.passwordHash);
}

// ---- Local PIN store --------------------------------------------------------
// In cloud mode PINs are verified by the `verify_pin` SECURITY DEFINER RPC. Local
// mode has no server, so cashier/admin PINs live in `app_local` under key 'pins':
// { [cashierId]: pin }. The master PIN is cashier id 0.
//
// PINs are stored in cleartext (not hashed) deliberately: they are short
// device-lock codes, the real account credential (email/password) IS hashed, and
// the local→cloud upgrade needs the plaintext to re-seed the cloud's hashed
// secure_pins so the owner keeps the same PIN. There is no default PIN — the
// owner sets one during onboarding, so a fresh device with no PIN grants nothing.

const PINS_KEY = 'pins';

export async function setLocalPin(cashierId, pin) {
  const row = (await db.app_local.get(PINS_KEY)) || { key: PINS_KEY, pins: {} };
  row.pins[String(cashierId)] = String(pin);
  await db.app_local.put(row);
}

export async function verifyLocalPin(cashierId, pin) {
  const row = await db.app_local.get(PINS_KEY);
  const stored = row?.pins?.[String(cashierId)];
  if (stored == null) return false; // no PIN configured → nothing unlocks
  return String(stored) === String(pin);
}

// The master (id 0) PIN, used to seed the cloud on upgrade. null if unset.
export async function getLocalMasterPin() {
  const row = await db.app_local.get(PINS_KEY);
  return row?.pins?.['0'] ?? null;
}

// ---- Cloud-mode offline PIN cache -------------------------------------------
// In CLOUD mode PINs are verified by the `verify_pin` SECURITY DEFINER RPC, and
// plaintext PINs are scrubbed from the cached menu (see useMenuStore.setMenuData).
// The RPC is therefore the ONLY way into the register — which means a slow /
// half-open or dropped link would lock staff out of the till entirely, the exact
// symptom users hit in the field.
//
// To keep the register usable on a degraded link WITHOUT persisting plaintext or
// the server's PIN secret, we cache a PBKDF2 hash of every PIN that has ALREADY
// verified successfully online on this device. When the cloud is unreachable we
// verify the entered PIN against that cache instead of the RPC.
//
// Tradeoffs, deliberate:
//   - A brand-new device with no prior successful online login still needs the
//     cloud for the first unlock (nothing is cached yet).
//   - A cloud-side PIN rotation only takes effect offline after the new PIN is
//     used online once on this device; the old PIN keeps working offline until
//     then. Acceptable staleness for a device-lock code.

const CLOUD_PIN_CACHE_KEY = 'cloud_pin_cache';

// Bind the hash to the cashier id so a cached entry can only ever unlock the
// cashier it was recorded for, never a different one that shares a PIN.
const cloudPinMaterial = (cashierId, pin) => `${cashierId}:${pin}`;

// Pure derive helper (no Dexie) so the hashing can be unit-tested in isolation.
export async function deriveCloudPinHash(cashierId, pin, saltHex) {
  return deriveHash(cloudPinMaterial(cashierId, pin), fromHex(saltHex));
}

// Record that (cashierId, pin) verified online, so it still opens the register
// if the link degrades later. Called only after a successful `verify_pin` RPC.
export async function cacheCloudPinVerification(cashierId, pin) {
  const row = (await db.app_local.get(CLOUD_PIN_CACHE_KEY))
    || { key: CLOUD_PIN_CACHE_KEY, entries: {} };
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(cloudPinMaterial(cashierId, pin), salt);
  row.entries = row.entries || {};
  row.entries[String(cashierId)] = { salt: toHex(salt), hash };
  await db.app_local.put(row);
}

// Verify an entered PIN against the on-device cache. Returns false (never throws)
// when nothing is cached for this cashier — a fresh device simply has no offline
// fallback until its first successful online login.
export async function verifyCachedCloudPin(cashierId, pin) {
  const row = await db.app_local.get(CLOUD_PIN_CACHE_KEY);
  const entry = row?.entries?.[String(cashierId)];
  if (!entry?.hash || !entry?.salt) return false;
  const candidate = await deriveHash(cloudPinMaterial(cashierId, pin), fromHex(entry.salt));
  return safeEqual(candidate, entry.hash);
}
