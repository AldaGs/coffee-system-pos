import { describe, it, expect } from 'vitest';
import { slotValid, toLocalInput, fromLocalInput, timesFor, firstSlot, asapOk } from '../utils/pickupSlots';

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
  it('finds the first slot and decides if ASAP is offered', () => {
    const slots = { enabled: true, interval: 60, daysAhead: 3, leadMinutes: 30, hours: { days: 31, start: '09:00', end: '13:00' } };
    expect(firstSlot({ now, tz, slots })).toBe(fromLocalInput('2026-10-07T10:00', tz));
    expect(asapOk({ now, tz, slots })).toBe(true);
    const late = Date.UTC(2026, 9, 8, 5, 0); // Wed 23:00 local
    expect(firstSlot({ now: late, tz, slots })).toBe(fromLocalInput('2026-10-08T09:00', tz));
    expect(asapOk({ now: late, tz, slots })).toBe(false);
    expect(asapOk({ now: late, tz, slots: { ...slots, enabled: false } })).toBe(true);
  });
  it('lists only allowed times for a day', () => {
    const slots = { enabled: true, interval: 60, daysAhead: 7, leadMinutes: 30, hours: { days: 31, start: '09:00', end: '13:00' } };
    expect(timesFor('2026-10-07', { now, tz, slots })).toEqual(['10:00', '11:00', '12:00']); // 09:00 inside lead
    expect(timesFor('2026-10-10', { now, tz, slots })).toEqual([]); // Saturday closed (Mon-Fri)
    expect(timesFor('2026-10-07', { now, tz, slots: null })[0]).toBe('09:15'); // no rules: next 15 min
  });
});
