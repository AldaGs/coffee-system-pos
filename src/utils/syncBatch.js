// Batched, resilient sync primitives for attemptBackgroundSync.
//
// The background sync used to push each offline queue up as ONE all-or-nothing
// upsert under the fixed POS deadline. After a long offline stretch that payload
// can be large enough to legitimately exceed the deadline on a slow-but-working
// link — so it times out, never syncs, AND opens the breaker, which blocks every
// later section of the same run. The whole backlog then wedges: too big to ever
// fit the deadline, retried whole every interval, failing the same way each time.
//
// Chunking fixes that: small fixed-size batches each comfortably fit the deadline
// (so no per-request deadline override is needed), and each chunk that lands can
// be cleared from the queue independently — partial progress survives a mid-batch
// failure instead of being thrown away.

import { isCloudReachable } from './network';

// Rows per cloud round-trip. Small enough that a chunk always fits the POS
// deadline on a slow link, large enough to drain a big backlog in few requests.
export const SYNC_CHUNK_SIZE = 50;

// Base delay for the single in-run retry (jittered ±50%).
export const SYNC_RETRY_BASE_MS = 400;

// Split an array into consecutive chunks of at most `size`.
export function chunkArray(arr, size = SYNC_CHUNK_SIZE) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Run one Supabase call (a thunk returning the usual `{ error }` result, or
// throwing) with a single jittered retry for a transient failure. Returns
// `{ ok, authError }`.
//
// Retry policy is deliberately narrow:
//   - Auth failures (400/401) are NOT transient — bail immediately and flag so
//     the caller can prompt re-auth instead of looping.
//   - A known-down link (breaker open, which a timeout/network error trips) is
//     not retried — hammering it just churns; the next sync interval (or the
//     heartbeat's recovery close) will pick it back up.
//   - So the retry effectively only covers a transient HTTP error that left the
//     link healthy (a 5xx or a conflict blip), which is exactly the case a short
//     jittered wait can clear.
export async function runSyncChunk(run) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let error = null;
    try {
      const res = await run();
      error = res?.error || null;
    } catch (e) {
      error = e;
    }

    if (!error) return { ok: true, authError: false };
    if (error.status === 400 || error.status === 401) return { ok: false, authError: true };

    // No retry left, or the link is known-down: give up on this chunk for now.
    if (attempt === 1 || !isCloudReachable()) return { ok: false, authError: false };

    const delay = SYNC_RETRY_BASE_MS * (0.5 + Math.random());
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return { ok: false, authError: false };
}
