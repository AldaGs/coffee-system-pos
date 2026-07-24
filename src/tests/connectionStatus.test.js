import { describe, it, expect } from 'vitest';
import { deriveConnectionState } from '../hooks/useConnectionStatus';

describe('deriveConnectionState', () => {
  it('is offline whenever the OS reports no network, regardless of the rest', () => {
    expect(deriveConnectionState({ online: false, reachable: true, pending: 0 })).toBe('offline');
    expect(deriveConnectionState({ online: false, reachable: false, pending: 5 })).toBe('offline');
  });

  it('is degraded when online but the breaker is open', () => {
    expect(deriveConnectionState({ online: true, reachable: false, pending: 0 })).toBe('degraded');
    expect(deriveConnectionState({ online: true, reachable: false, pending: 3 })).toBe('degraded');
  });

  it('is syncing when the link is good and a backlog is draining', () => {
    expect(deriveConnectionState({ online: true, reachable: true, pending: 2 })).toBe('syncing');
  });

  it('is online when the link is good and nothing is queued', () => {
    expect(deriveConnectionState({ online: true, reachable: true, pending: 0 })).toBe('online');
  });
});
