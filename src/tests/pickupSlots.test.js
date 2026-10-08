import { describe, it, expect } from 'vitest';
import { slotValid, toLocalInput, fromLocalInput } from '../utils/pickupSlots';

// 2026-10-07 15:00 UTC = 09:00 in Mexico City (UTC-6, no DST after 2022); a Wednesday
const now = Date.UTC(2026, 9, 7, 15, 0);
const tz = 'America/Mexico_City';
describe('pickupSlots', () => {
  it('round-trips datetime-local values in the shop tz', () => {
    expect(fromLocalInput('2026-10-07T09:30', tz)).toBe(Date.UTC(2026, 9, 7, 15, 30));
    expect(toLocalInput(Date.UTC(2026, 9, 7, 15, 30), tz)).toBe('2026-10-07T09:30');
  });
  it('enforces lead, hours and interval in the shop tz', () => {
    const ok = (local, slots) => slotValid(fromLocalInput(local, tz), { now, tz, slots });
    expect(ok('2026-10-07T09:30')).toBe(true);
    expect(ok('2026-10-07T09:15')).toBe(false); // off interval and inside lead
    expect(ok('2026-10-07T21:00')).toBe(false); // end excluded
    expect(ok('2026-10-11T10:00')).toBe(false); // past daysAhead (3)
  });
  it('limits to configured days (Mon-only)', () => {
    const slots = { daysAhead: 14, hours: { days: 1, start: '10:00', end: '11:00' } };
    const ok = (local) => slotValid(fromLocalInput(local, tz), { now, tz, slots });
    expect(ok('2026-10-12T10:30')).toBe(true); // Monday
    expect(ok('2026-10-13T10:30')).toBe(false); // Tuesday
  });
});
