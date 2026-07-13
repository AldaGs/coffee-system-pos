import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createTimeoutFetch,
  isCloudReachable,
  isCircuitOpen,
  reportCloudFailure,
  reportCloudSuccess,
  _resetCircuitForTests,
  POS_DEADLINE_MS,
  COOLDOWN_MS,
} from '../utils/network';

// jsdom provides AbortController/DOMException; navigator.onLine defaults true.

describe('network circuit breaker', () => {
  beforeEach(() => {
    _resetCircuitForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports reachable when online and breaker closed', () => {
    expect(isCloudReachable()).toBe(true);
    expect(isCircuitOpen()).toBe(false);
  });

  it('opens the breaker on failure and recovers after cooldown', () => {
    reportCloudFailure();
    expect(isCircuitOpen()).toBe(true);
    expect(isCloudReachable()).toBe(false);

    vi.advanceTimersByTime(COOLDOWN_MS + 1);
    expect(isCircuitOpen()).toBe(false);
    expect(isCloudReachable()).toBe(true);
  });

  it('success closes the breaker immediately', () => {
    reportCloudFailure();
    expect(isCircuitOpen()).toBe(true);
    reportCloudSuccess();
    expect(isCircuitOpen()).toBe(false);
  });
});

describe('createTimeoutFetch', () => {
  beforeEach(() => {
    _resetCircuitForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes a successful response through and closes the breaker', async () => {
    const base = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const timeoutFetch = createTimeoutFetch(base);
    const res = await timeoutFetch('https://x.supabase.co/rest/v1/sales');
    expect(res.status).toBe(200);
    expect(isCircuitOpen()).toBe(false);
  });

  it('aborts a stalled POS request at the deadline and opens the breaker', async () => {
    // A fetch that only settles when its signal aborts (simulates a hung socket).
    const base = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));
    const timeoutFetch = createTimeoutFetch(base);

    const p = timeoutFetch('https://x.supabase.co/rest/v1/sales');
    const assertion = expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(POS_DEADLINE_MS + 1);
    await assertion;
    expect(isCircuitOpen()).toBe(true);
  });

  it('fails fast (no base fetch call) while the breaker is open', async () => {
    reportCloudFailure();
    const base = vi.fn();
    const timeoutFetch = createTimeoutFetch(base);
    await expect(timeoutFetch('https://x.supabase.co/rest/v1/sales'))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(base).not.toHaveBeenCalled();
  });

  it('still attempts storage uploads while the breaker is open, and never trips it', async () => {
    reportCloudFailure();
    const base = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const timeoutFetch = createTimeoutFetch(base);
    const res = await timeoutFetch('https://x.supabase.co/storage/v1/object/menu-assets/p.webp');
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalled();
  });
});
