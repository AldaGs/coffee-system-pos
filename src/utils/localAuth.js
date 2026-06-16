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
// mode has no server, so cashier/admin PINs are hashed (same PBKDF2 scheme) and
// kept in `app_local` under key 'pins': { [cashierId]: { salt, hash } }.
//
// The master PIN is cashier id 0. Until the owner sets their own, local mode
// falls back to the same default the app ships with ('1234') so a fresh device
// can reach Admin — mirroring useMenuStore.getPosSettings()'s default pinCode.

const PINS_KEY = 'pins';
const DEFAULT_MASTER_PIN = '1234';

export async function setLocalPin(cashierId, pin) {
  const row = (await db.app_local.get(PINS_KEY)) || { key: PINS_KEY, pins: {} };
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  row.pins[String(cashierId)] = { salt: toHex(salt), hash: await deriveHash(pin, salt) };
  await db.app_local.put(row);
}

export async function verifyLocalPin(cashierId, pin) {
  const row = await db.app_local.get(PINS_KEY);
  const entry = row?.pins?.[String(cashierId)];
  if (!entry) {
    // No PIN configured yet — only the master id 0 has a usable default.
    return String(cashierId) === '0' && pin === DEFAULT_MASTER_PIN;
  }
  const candidate = await deriveHash(pin, fromHex(entry.salt));
  return safeEqual(candidate, entry.hash);
}
