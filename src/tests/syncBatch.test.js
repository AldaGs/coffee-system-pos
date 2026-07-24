import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chunkArray, runSyncChunk, SYNC_CHUNK_SIZE } from '../utils/syncBatch';
import { reportCloudFailure, reportCloudSuccess, _resetCircuitForTests } from '../utils/network';

describe('chunkArray', () => {
  it('splits into consecutive chunks of at most `size`', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns [] for empty / non-array input', () => {
    expect(chunkArray([])).toEqual([]);
    expect(chunkArray(null)).toEqual([]);
    expect(chunkArray(undefined)).toEqual([]);
  });

  it('keeps everything in one chunk when it fits', () => {
    const rows = Array.from({ length: SYNC_CHUNK_SIZE }, (_, i) => i);
    expect(chunkArray(rows)).toHaveLength(1);
  });

  it('preserves order and covers every element across chunks', () => {
    const rows = Array.from({ length: SYNC_CHUNK_SIZE * 2 + 3 }, (_, i) => i);
    const chunks = chunkArray(rows);
    expect(chunks).toHaveLength(3);
    expect(chunks.flat()).toEqual(rows);
  });
});

describe('runSyncChunk', () => {
  beforeEach(() => {
    _resetCircuitForTests();
    reportCloudSuccess(); // breaker closed, link healthy
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns ok on a clean result', async () => {
    const run = vi.fn().mockResolvedValue({ error: null });
    const res = await runSyncChunk(run);
    expect(res).toEqual({ ok: true, authError: false });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('flags an auth error and does not retry it', async () => {
    const run = vi.fn().mockResolvedValue({ error: { status: 401, message: 'JWT expired' } });
    const res = await runSyncChunk(run);
    expect(res).toEqual({ ok: false, authError: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries once on a transient error while the link is healthy, then succeeds', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ error: { status: 503, message: 'temporarily unavailable' } })
      .mockResolvedValueOnce({ error: null });
    const p = runSyncChunk(run);
    await vi.runAllTimersAsync(); // let the jittered backoff elapse
    const res = await p;
    expect(res).toEqual({ ok: true, authError: false });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up after the single retry is exhausted', async () => {
    const run = vi.fn().mockResolvedValue({ error: { status: 503 } });
    const p = runSyncChunk(run);
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res).toEqual({ ok: false, authError: false });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the link is known-down (breaker open)', async () => {
    reportCloudFailure(); // breaker open
    const run = vi.fn().mockResolvedValue({ error: { message: 'Request timed out' } });
    const res = await runSyncChunk(run);
    expect(res).toEqual({ ok: false, authError: false });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('treats a thrown error like a failed result', async () => {
    const run = vi.fn().mockRejectedValue(new Error('network boom'));
    const p = runSyncChunk(run);
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.ok).toBe(false);
    expect(run).toHaveBeenCalledTimes(2); // healthy link → one retry
  });
});
