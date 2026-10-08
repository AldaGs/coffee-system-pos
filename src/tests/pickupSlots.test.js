import { describe, it, expect } from 'vitest';
import { slotValid, toLocalInput, fromLocalInput, timesFor, firstSlot, asapOk, isOpenNow, nextOpening, formatHours } from '../utils/pickupSlots';

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

describe('openHours', () => {
  const MF = 0b0011111, SAT = 0b0100000; // mon..fri, sat
  const oh = { always: false, rules: [{ days: MF, start: '09:00', end: '14:00' }, { days: SAT, start: '10:00', end: '20:00' }] };
  it('absent / always = open', () => {
    expect(isOpenNow(undefined, { now, tz })).toBe(true);
    expect(isOpenNow({ always: true, rules: [] }, { now, tz })).toBe(true);
    expect(nextOpening(null, { now, tz })).toBe(null);
  });
  it('matches per-day rules in shop tz (Wed 09:00 open, Wed 14:00 closed, Sun closed)', () => {
    expect(isOpenNow(oh, { now, tz })).toBe(true);
    expect(isOpenNow(oh, { now: now + 5 * 3600000, tz })).toBe(false);
    expect(isOpenNow(oh, { now: Date.UTC(2026, 9, 11, 18, 0), tz })).toBe(false);
  });
  it('overnight windows wrap', () => {
    const n = { rules: [{ days: 0, start: '20:00', end: '02:00' }] };
    expect(isOpenNow(n, { now: Date.UTC(2026, 9, 8, 7, 0), tz })).toBe(true); // 01:00 local
    expect(isOpenNow(n, { now, tz })).toBe(false);
  });
  it('next opening: later today, then next day', () => {
    const later = { rules: [{ days: 0, start: '18:00', end: '22:00' }] };
    expect(nextOpening(later, { now, tz })).toEqual({ dayOffset: 0, dow: 2, time: '18:00' });
    expect(nextOpening(oh, { now: now + 5 * 3600000, tz })).toEqual({ dayOffset: 1, dow: 3, time: '9:00' }); // Wed 14:00 -> Thu
  });
  it('formats hours by day', () => {
    const d = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    expect(formatHours(oh, d, 'Todos')).toEqual(['Lun–Vie 9:00–14:00', 'Sáb 10:00–20:00']);
    expect(formatHours({ rules: [{ days: 0, start: '08:00', end: '20:00' }] }, d, 'Todos')).toEqual(['Todos 8:00–20:00']);
  });
});
