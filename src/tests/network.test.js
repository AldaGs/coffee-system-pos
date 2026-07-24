import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createTimeoutFetch,
  isCloudReachable,
  isCircuitOpen,
  reportCloudFailure,
  reportCloudSuccess,
  startConnectivityHeartbeat,
  stopConnectivityHeartbeat,
  _resetCircuitForTests,
  POS_DEADLINE_MS,
  COOLDOWN_MS,
  MAX_COOLDOWN_MS,
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

  it('grows the cooldown on consecutive failures (first stays within COOLDOWN_MS)', () => {
    // First failure: window is [0.75, 1.0) * COOLDOWN_MS, so it always clears by
    // COOLDOWN_MS and never exceeds it.
    reportCloudFailure();
    vi.advanceTimersByTime(COOLDOWN_MS + 1);
    expect(isCircuitOpen()).toBe(false);

    // A run of failures without any success backs the window off well past a
    // single COOLDOWN_MS (2**n growth), so it's still open after COOLDOWN_MS.
    for (let i = 0; i < 5; i++) reportCloudFailure();
    vi.advanceTimersByTime(COOLDOWN_MS + 1);
    expect(isCircuitOpen()).toBe(true);

    // ...but never past the ceiling.
    vi.advanceTimersByTime(MAX_COOLDOWN_MS + 1);
    expect(isCircuitOpen()).toBe(false);

    // A success resets the back-off: the next lone failure is short again.
    reportCloudSuccess();
    reportCloudFailure();
    vi.advanceTimersByTime(COOLDOWN_MS + 1);
    expect(isCircuitOpen()).toBe(false);
  });
});

describe('connectivity heartbeat', () => {
  beforeEach(() => {
    _resetCircuitForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    stopConnectivityHeartbeat();
    vi.useRealTimers();
  });

  it('closes an open breaker once a background probe succeeds', async () => {
    reportCloudFailure();
    expect(isCircuitOpen()).toBe(true);

    const probe = vi.fn().mockResolvedValue(true);
    startConnectivityHeartbeat(probe, { probeIntervalMs: 5000, idleIntervalMs: 4000 });

    // First tick is scheduled after the idle interval (+ up to 15% jitter).
    await vi.advanceTimersByTimeAsync(4000 * 1.2);
    expect(probe).toHaveBeenCalled();
    expect(isCircuitOpen()).toBe(false); // recovery detected without a user action
  });

  it('never opens a healthy breaker when the probe fails (e.g. blocked endpoint)', async () => {
    // Breaker closed, link actually fine, but the probe endpoint is unreachable.
    const probe = vi.fn().mockResolvedValue(false);
    startConnectivityHeartbeat(probe, { probeIntervalMs: 5000, idleIntervalMs: 4000 });

    await vi.advanceTimersByTimeAsync(4000 * 1.2 * 3);
    // While closed the heartbeat spends no network probe and cannot trip the breaker.
    expect(probe).not.toHaveBeenCalled();
    expect(isCircuitOpen()).toBe(false);
  });

  it('holds the breaker open while probes keep failing', async () => {
    reportCloudSuccess(); // reset back-off so the first failure is a short window
    reportCloudFailure();
    expect(isCircuitOpen()).toBe(true);

    const probe = vi.fn().mockResolvedValue(false);
    startConnectivityHeartbeat(probe, { probeIntervalMs: 5000, idleIntervalMs: 4000 });

    // Advance well past the initial cooldown; failing probes keep extending it.
    await vi.advanceTimersByTimeAsync(60000);
    expect(probe).toHaveBeenCalled();
    expect(isCircuitOpen()).toBe(true);
  });

  it('stops probing after cleanup', async () => {
    reportCloudFailure();
    const probe = vi.fn().mockResolvedValue(false);
    const stop = startConnectivityHeartbeat(probe, { probeIntervalMs: 5000, idleIntervalMs: 4000 });
    stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(probe).not.toHaveBeenCalled();
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
