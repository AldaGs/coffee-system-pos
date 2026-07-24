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

// How long the breaker stays open after the FIRST failure. During this window the
// app behaves as if offline: local Dexie writes only, no cloud round-trips. Each
// additional consecutive failure grows the window (see reportCloudFailure) up to
// MAX_COOLDOWN_MS, so a persistently dead link is retried ever less often instead
// of on a fixed cadence.
export const COOLDOWN_MS = 10000;

// Ceiling for the grown cooldown. A link that's been down a while gets probed at
// most once per minute.
export const MAX_COOLDOWN_MS = 60000;

let circuitOpenUntil = 0;
// Consecutive failures since the last success — drives the cooldown back-off.
let consecutiveFailures = 0;

const isStorageUrl = (url) => typeof url === 'string' && url.includes('/storage/v1/');

const urlOf = (input) => {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url; // Request object
  try { return String(input); } catch { return ''; }
};

// Called by the fetch wrapper (and available to any code that learns the cloud
// is unreachable through another channel). Grows the open window with each
// consecutive failure so a link that stays down is retried less and less often,
// with subtractive jitter (never longer than the nominal window) so a fleet of
// devices don't all retry in lockstep.
export function reportCloudFailure() {
  consecutiveFailures += 1;
  const exp = Math.min(consecutiveFailures - 1, 16); // cap to avoid 2**huge
  const base = Math.min(COOLDOWN_MS * 2 ** exp, MAX_COOLDOWN_MS);
  // [0.75, 1.0) * base — the first failure therefore never exceeds COOLDOWN_MS.
  const window = base * (0.75 + Math.random() * 0.25);
  circuitOpenUntil = Date.now() + window;
}

export function reportCloudSuccess() {
  circuitOpenUntil = 0;
  consecutiveFailures = 0;
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

// ---- Proactive heartbeat ----------------------------------------------------
//
// The breaker on its own is purely reactive: it opens only after a real request
// eats the full deadline, and it closes when the fixed cooldown lapses — so a
// user action is what discovers both the outage AND the recovery, each time
// paying the deadline. On a persistently bad link that means every cooldown lapse
// dumps the next tap into another multi-second stall.
//
// The heartbeat decouples RECOVERY from user actions. While the breaker is open
// it probes the cloud in the background; the first probe that succeeds closes the
// breaker instantly, so by the time the cashier taps again the app already knows
// the link is back — no probe tax. While the link stays down, a failing probe
// extends the open window so the cooldown can't lapse and drop a user into a
// stall.
//
// It deliberately spends NO network while the breaker is closed, and a failed
// probe NEVER opens a healthy breaker. The probe endpoint can be blocked
// (CORS/proxy) even on a perfectly good link; letting that trip the breaker would
// route the whole app to the offline path against a working cloud — the exact
// symptom we're fighting. So real requests stay the only thing that OPENS the
// breaker; the heartbeat only ever helps it CLOSE (or hold open while confirmed
// down).

// While the breaker is open: how often to probe for recovery.
export const HEARTBEAT_PROBE_MS = 5000;
// While the breaker is closed: how often to cheaply re-check (local only, no
// network) whether it has opened and probing should begin.
export const HEARTBEAT_IDLE_MS = 4000;

let heartbeatTimer = null;
let heartbeatProbe = null;
let heartbeatRunning = false;

// Symmetric ±15% jitter for the poll cadence, to de-sync a fleet of devices.
const jitterInterval = (ms) => ms * (0.85 + Math.random() * 0.3);

/**
 * Start the connectivity heartbeat. Idempotent-ish: starting again replaces any
 * running heartbeat. Returns a stop function (also exported as
 * stopConnectivityHeartbeat) for effect cleanup.
 *
 * @param {() => Promise<boolean>} probe Resolves true iff the cloud answered.
 *        Injected so this module stays free of Supabase config. It MUST bypass
 *        the breaker-open short-circuit (i.e. not use the wrapped fetch), or it
 *        could never run while the breaker is open.
 */
export function startConnectivityHeartbeat(probe, {
  probeIntervalMs = HEARTBEAT_PROBE_MS,
  idleIntervalMs = HEARTBEAT_IDLE_MS,
} = {}) {
  if (typeof probe !== 'function') return () => {};
  stopConnectivityHeartbeat();
  heartbeatProbe = probe;
  heartbeatRunning = true;

  const tick = async () => {
    if (!heartbeatRunning) return;

    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const hidden = typeof document !== 'undefined' && document.hidden;

    // Only spend a network probe when there's something to detect: the breaker is
    // open and we're plausibly able to reach the cloud. A truly offline device or
    // a backgrounded tab just waits.
    if (isCircuitOpen() && !offline && !hidden) {
      let ok = false;
      try { ok = await heartbeatProbe(); } catch { ok = false; }
      if (!heartbeatRunning) return;
      if (ok) {
        // Link is definitively back — the health endpoint answered. Close now so
        // the next user action goes straight to the cloud instead of re-probing.
        reportCloudSuccess();
      } else {
        // Still down: extend the open window so it can't lapse and drop a user
        // into a full-deadline stall before the link actually recovers.
        reportCloudFailure();
      }
    }

    if (!heartbeatRunning) return;
    const base = isCircuitOpen() ? probeIntervalMs : idleIntervalMs;
    heartbeatTimer = setTimeout(tick, jitterInterval(base));
  };

  heartbeatTimer = setTimeout(tick, jitterInterval(idleIntervalMs));
  return stopConnectivityHeartbeat;
}

export function stopConnectivityHeartbeat() {
  heartbeatRunning = false;
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
  heartbeatProbe = null;
}

// Test-only: reset breaker + heartbeat state between cases.
export function _resetCircuitForTests() {
  circuitOpenUntil = 0;
  consecutiveFailures = 0;
  stopConnectivityHeartbeat();
}
