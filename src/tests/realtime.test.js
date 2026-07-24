import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the Supabase client BEFORE importing realtime.js so the real module (which
// touches localStorage at load) is never evaluated. Each supabase.channel(name)
// returns a fake whose subscribe() callback we capture, so a test can drive the
// SUBSCRIBED / CHANNEL_ERROR status transitions by hand.
const channels = [];
function makeChannel(name) {
  const ch = {
    name,
    _statusCb: null,
    on: vi.fn(() => ch),
    subscribe: vi.fn((cb) => { ch._statusCb = cb; return ch; }),
    emit(status, err) { ch._statusCb?.(status, err); },
  };
  channels.push(ch);
  return ch;
}

const removeChannel = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabase: {
    channel: (name) => makeChannel(name),
    removeChannel: (ch) => removeChannel(ch),
  },
}));

// Keep the link "reachable" by default so connect() proceeds; individual tests can
// override.
vi.mock('../utils/network', () => ({
  isCloudReachable: vi.fn(() => true),
}));

import { createRealtimeChannel } from '../utils/realtime';
import { isCloudReachable } from '../utils/network';

const latest = () => channels[channels.length - 1];

describe('createRealtimeChannel degraded-mode polling', () => {
  beforeEach(() => {
    channels.length = 0;
    removeChannel.mockClear();
    isCloudReachable.mockReturnValue(true);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('subscribes once and streams without polling on a healthy link', async () => {
    const poll = vi.fn().mockResolvedValue();
    const { cleanup } = createRealtimeChannel('c', {}, vi.fn(), { poll, pollIntervalMs: 1000 });
    latest().emit('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(5000);
    expect(poll).not.toHaveBeenCalled();
    cleanup();
  });

  it('falls back to polling after failuresBeforePolling socket failures', async () => {
    const poll = vi.fn().mockResolvedValue();
    const { cleanup } = createRealtimeChannel('c', {}, vi.fn(), {
      poll, pollIntervalMs: 1000, failuresBeforePolling: 3,
    });

    // Drive three consecutive failures. The first two schedule reconnects (which
    // rebuild the channel); the third crosses the threshold and starts polling.
    for (let i = 0; i < 3; i++) {
      latest().emit('CHANNEL_ERROR');
      await vi.advanceTimersByTimeAsync(60000); // let any reconnect back-off fire
    }

    expect(poll).toHaveBeenCalled();
    cleanup();
  });

  it('keeps polling on the interval while the socket stays down', async () => {
    const poll = vi.fn().mockResolvedValue();
    const { cleanup } = createRealtimeChannel('c', {}, vi.fn(), {
      poll, pollIntervalMs: 1000, failuresBeforePolling: 1,
    });

    latest().emit('CHANNEL_ERROR'); // threshold 1 → straight to polling
    await vi.advanceTimersByTimeAsync(1); // immediate first poll
    const afterFirst = poll.mock.calls.length;
    expect(afterFirst).toBeGreaterThanOrEqual(1);

    await vi.advanceTimersByTimeAsync(3500); // ~3 more ticks
    expect(poll.mock.calls.length).toBeGreaterThan(afterFirst);
    cleanup();
  });

  it('stops polling and resumes streaming once the socket re-subscribes', async () => {
    const poll = vi.fn().mockResolvedValue();
    const { cleanup } = createRealtimeChannel('c', {}, vi.fn(), {
      poll, pollIntervalMs: 1000, failuresBeforePolling: 1,
    });

    latest().emit('CHANNEL_ERROR'); // → polling
    await vi.advanceTimersByTimeAsync(1);
    // The poll tick calls connect() again, creating a fresh channel; subscribe it.
    latest().emit('SUBSCRIBED');
    const callsAtRecovery = poll.mock.calls.length;

    await vi.advanceTimersByTimeAsync(5000); // well past several poll intervals
    // One catch-up poll on recovery is allowed, but no ongoing interval polling.
    expect(poll.mock.calls.length).toBeLessThanOrEqual(callsAtRecovery + 1);
    cleanup();
  });

  it('does not poll or churn handshakes after cleanup', async () => {
    const poll = vi.fn().mockResolvedValue();
    const { cleanup } = createRealtimeChannel('c', {}, vi.fn(), {
      poll, pollIntervalMs: 1000, failuresBeforePolling: 1,
    });
    latest().emit('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(1);
    cleanup();
    const callsAtCleanup = poll.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(poll.mock.calls.length).toBe(callsAtCleanup);
  });

  it('without a poll fn, stays in pure reconnect mode (never polls)', async () => {
    const { cleanup } = createRealtimeChannel('c', {}, vi.fn()); // no opts
    latest().emit('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(60000);
    // A reconnect was scheduled and rebuilt the channel (more than one created).
    expect(channels.length).toBeGreaterThan(1);
    cleanup();
  });
});
