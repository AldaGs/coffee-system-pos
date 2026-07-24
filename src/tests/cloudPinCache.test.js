import { describe, it, expect } from 'vitest';
import { deriveCloudPinHash } from '../utils/localAuth';

// Pure coverage for the offline cloud-PIN cache hashing. The Dexie-backed
// cache/verify wrappers are exercised in the app; here we pin down the crypto
// contract they depend on: deterministic per (cashierId, pin, salt), and bound
// to the cashier id so one cashier's cached hash can never unlock another.
// crypto.subtle is available in the Node test runtime, so no browser mock.

const SALT_A = '000102030405060708090a0b0c0d0e0f'; // 16 bytes hex
const SALT_B = 'f0e0d0c0b0a090807060504030201000';

describe('cloud PIN cache hashing (deriveCloudPinHash)', () => {
  it('is deterministic for the same cashier, pin and salt', async () => {
    const a = await deriveCloudPinHash(3, '1234', SALT_A);
    const b = await deriveCloudPinHash(3, '1234', SALT_A);
    expect(a).toBe(b);
  });

  it('produces a different hash for a different PIN', async () => {
    const right = await deriveCloudPinHash(3, '1234', SALT_A);
    const wrong = await deriveCloudPinHash(3, '9999', SALT_A);
    expect(wrong).not.toBe(right);
  });

  it('is bound to the cashier id (same PIN, different cashier → different hash)', async () => {
    const forCashier3 = await deriveCloudPinHash(3, '1234', SALT_A);
    const forCashier7 = await deriveCloudPinHash(7, '1234', SALT_A);
    expect(forCashier7).not.toBe(forCashier3);
  });

  it('depends on the salt (same input, different salt → different hash)', async () => {
    const withA = await deriveCloudPinHash(3, '1234', SALT_A);
    const withB = await deriveCloudPinHash(3, '1234', SALT_B);
    expect(withA).not.toBe(withB);
  });

  it('returns a hex string of the expected length (32-byte hash)', async () => {
    const hash = await deriveCloudPinHash(0, '4321', SALT_A);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
