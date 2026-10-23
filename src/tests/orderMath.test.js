import { describe, it, expect } from 'vitest';
import { lineKey, lineUnitCents, cashChips, cashOk } from '../components/publicOrder/orderMath';

const groups = new Map([['g1', { id: 'g1', options: [{ id: 'oat', price_delta_cents: 1000 }, { id: 'shot', price_delta_cents: 1500 }, { id: 'free' }] }]]);
const itemsById = new Map([['latte', { id: 'latte', price_cents: 5500 }]]);

describe('orderMath', () => {
  it('keys lines by item and sorted options', () => {
    expect(lineKey('latte', ['shot', 'oat'])).toBe('latte|oat,shot');
    expect(lineKey('latte', [])).toBe('latte|');
  });

  it('adds option deltas to the item price', () => {
    expect(lineUnitCents({ id: 'latte', mods: ['oat', 'shot', 'free'] }, itemsById, groups)).toBe(8000);
    expect(lineUnitCents({ id: 'gone', mods: ['oat'] }, itemsById, groups)).toBe(1000);
  });

  it('offers exact plus round bills above the total', () => {
    expect(cashChips(8000)).toEqual([8000, 10000, 20000, 50000]);
    expect(cashChips(10000)).toEqual([10000, 20000, 50000]);
  });

  it('accepts cash from the total up to $1,000 over', () => {
    expect(cashOk(8000, 8000)).toBe(true);
    expect(cashOk(7999, 8000)).toBe(false);
    expect(cashOk(108000, 8000)).toBe(true);
    expect(cashOk(108001, 8000)).toBe(false);
  });
});
