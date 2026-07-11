// Degraded-connectivity handling.
//
// The whole app is offline-first: every write lands in Dexie first, then tries
// to mirror to Supabase. That works beautifully with NO connection, because
// `navigator.onLine` is false and every cloud guard short-circuits in ~0ms.
//
// The failure mode this module fixes is a SLOW / half-open connection: the wifi
// or 5G associates and completes the TCP handshake, so `navigator.onLine` is
// `true`, but requests stall for tens of seconds before the OS gives up. With
// no request deadline, `await supabase...` freezes the UI far longer than being
// offline ever would — the classic "slow is worse than no connection at all."
//
// Two mechanisms bring the slow case back down to the fast offline case:
//
//   1. A timeout `fetch` wrapper (createTimeoutFetch) injected into the Supabase
//      client. Every cloud request gets a deadline; when it's exceeded the
//      request aborts instead of hanging.
//
//   2. A circuit breaker. The first request that times out (or fails at the
//      network layer) "opens" the breaker for COOLDOWN_MS. While open,
//      isCloudReachable() reports false and the wrapper rejects non-storage
//      requests immediately — so a checkout that fires several cloud calls pays
//      the deadline once, not once per call, and the rest of the app skips the
//      cloud entirely until the cooldown lapses.
//
// Storage uploads (Supabase Storage: /storage/v1/...) are exempt: they're
// user-initiated, infrequent, and legitimately large, so they get a generous
// deadline and never trip the POS breaker.

// POS calls (REST, RPC, auth) are small; a healthy connection answers in well
// under a second, so 5s comfortably absorbs a slow-but-fine link while still
// bailing out long before the multi-second freezes users notice.
export const POS_DEADLINE_MS = 5000;

// Uploads can legitimately take a while on a slow uplink — don't punish them
// with the POS deadline.
export const STORAGE_DEADLINE_MS = 60000;

// How long the breaker stays open after a failure. During this window the app
// behaves as if offline: local Dexie writes only, no cloud round-trips.
export const COOLDOWN_MS = 10000;

let circuitOpenUntil = 0;

const isStorageUrl = (url) => typeof url === 'string' && url.includes('/storage/v1/');

const urlOf = (input) => {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url; // Request object
  try { return String(input); } catch { return ''; }
};

// Called by the fetch wrapper (and available to any code that learns the cloud
// is unreachable through another channel).
export function reportCloudFailure() {
  circuitOpenUntil = Date.now() + COOLDOWN_MS;
}

export function reportCloudSuccess() {
  circuitOpenUntil = 0;
}

// True while the breaker is open. Exposed mainly for tests / status UI.
export function isCircuitOpen() {
  return Date.now() < circuitOpenUntil;
}

// The signal hot-path guards should use instead of bare `navigator.onLine`.
// Combines the OS-level flag (catches true airplane mode instantly) with the
// breaker (catches slow/half-open links after the first stalled request).
export function isCloudReachable() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (isCircuitOpen()) return false;
  return true;
}

// Build the `fetch` to hand to createClient({ global: { fetch } }). Wraps the
// platform fetch with an AbortController deadline and the circuit breaker.
export function createTimeoutFetch(baseFetch) {
  const doFetch = baseFetch
    || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined);

  return async function timeoutFetch(input, init = {}) {
    const url = urlOf(input);
    const storage = isStorageUrl(url);
    const deadline = storage ? STORAGE_DEADLINE_MS : POS_DEADLINE_MS;

    // Breaker: while open, fail POS requests immediately rather than paying the
    // deadline again. Storage uploads are still allowed to try.
    if (!storage && isCircuitOpen()) {
      throw new DOMException('Cloud unreachable (circuit open)', 'AbortError');
    }

    const controller = new AbortController();

    // Respect a caller-supplied signal (e.g. supabase query .abortSignal()).
    const external = init.signal;
    if (external) {
      if (external.aborted) controller.abort(external.reason);
      else external.addEventListener('abort', () => controller.abort(external.reason), { once: true });
    }

    const timer = setTimeout(
      () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
      deadline
    );

    try {
      const res = await doFetch(input, { ...init, signal: controller.signal });
      // A real HTTP response (even a 4xx/5xx) proves the cloud is reachable.
      reportCloudSuccess();
      return res;
    } catch (err) {
      // Network-layer failure or our own timeout abort. Don't let storage
      // timeouts open the POS breaker — a big upload stalling doesn't mean the
      // lightweight REST calls are down.
      if (!storage) reportCloudFailure();
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

// Test-only: reset breaker state between cases.
export function _resetCircuitForTests() {
  circuitOpenUntil = 0;
}
