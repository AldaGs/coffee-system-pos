import { describe, it, expect } from 'vitest';
import { buildSlots } from '../utils/pickupSlots';

describe('buildSlots', () => {
  // 2026-10-07 15:00 UTC = 09:00 in Mexico City (UTC-6, no DST after 2022)
  const now = Date.UTC(2026, 9, 7, 15, 0);
  const tz = 'America/Mexico_City';
  it('honors lead time, hours and interval in the shop tz', () => {
    const [today] = buildSlots({ now, tz, slots: { interval: 30, leadMinutes: 30, daysAhead: 3 } });
    expect(today.ms[0]).toBe(Date.UTC(2026, 9, 7, 15, 30)); // 09:30 local
    expect(today.ms.at(-1)).toBe(Date.UTC(2026, 9, 8, 2, 30)); // 20:30 local (21:00 excluded)
  });
  it('limits to configured days (Mon-only) ', () => {
    const r = buildSlots({ now, tz, slots: { daysAhead: 14, hours: { days: 1, start: '10:00', end: '11:00' } } });
    expect(r.length).toBe(2); // two Mondays in 14 days
    expect(r[0].ms.length).toBe(2);
  });
});
