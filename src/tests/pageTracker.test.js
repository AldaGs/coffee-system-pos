import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPageTracker } from '../utils/pageTracker';

const fakeClient = () => ({ rpc: vi.fn(() => Promise.resolve({ error: null })) });

describe('page tracker', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('batches events from one visit and sends no identifiers beyond a random visit id', () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
    const client = fakeClient();
    const tracker = createPageTracker(client, 'order');
    tracker.track('page_view');
    tracker.track('add_to_cart', { itemId: 'latte' });
    expect(client.rpc).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    const [fn, { p_events }] = client.rpc.mock.calls[0];
    expect(fn).toBe('track_page_events');
    expect(p_events).toHaveLength(2);
    expect(p_events[0].visit).toMatch(/^[a-z0-9]{12}$/);
    expect(p_events[1]).toMatchObject({ page: 'order', event: 'add_to_cart', item_id: 'latte', visit: p_events[0].visit });
    tracker.stop();
  });

  it('sends nothing when the browser asks not to be tracked', () => {
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    const client = fakeClient();
    const tracker = createPageTracker(client, 'menu');
    tracker.track('page_view');
    tracker.stop();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
