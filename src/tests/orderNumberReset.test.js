import { describe, it, expect, vi } from 'vitest';

vi.mock('../hooks/useShiftState', () => ({ useShiftStateValue: () => [1, () => {}] }));
const { resetDue } = await import('../hooks/useOrderNumbers');

const d = (y, m, day) => new Date(y, m - 1, day, 12);

describe('resetDue', () => {
  it('weekly resets on Monday, not during the week', () => {
    // 2026-10-19 is a Monday.
    expect(resetDue('weekly', d(2026, 10, 19), d(2026, 10, 25))).toBe(false); // Mon -> Sun
    expect(resetDue('weekly', d(2026, 10, 25), d(2026, 10, 26))).toBe(true); // Sun -> Mon
    expect(resetDue('weekly', d(2026, 12, 30), d(2027, 1, 1))).toBe(false); // same week across New Year
  });

  it('daily, monthly and yearly', () => {
    expect(resetDue('daily', d(2026, 10, 22), d(2026, 10, 22))).toBe(false);
    expect(resetDue('daily', d(2026, 10, 22), d(2026, 10, 23))).toBe(true);
    expect(resetDue('monthly', d(2026, 10, 1), d(2026, 10, 31))).toBe(false);
    expect(resetDue('monthly', d(2025, 10, 31), d(2026, 10, 1))).toBe(true); // same month, next year
    expect(resetDue('yearly', d(2026, 1, 1), d(2026, 12, 31))).toBe(false);
    expect(resetDue('never', d(2020, 1, 1), d(2026, 1, 1))).toBe(false);
  });
});
