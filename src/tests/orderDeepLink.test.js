import { describe, it, expect } from 'vitest';
import { parseAddParam, itemOrderLink } from '../utils/orderDeepLink';

describe('parseAddParam', () => {
  it('handles empty input', () => {
    expect(parseAddParam(null)).toEqual([]);
    expect(parseAddParam('')).toEqual([]);
  });
  it('parses ids with optional quantities', () => {
    expect(parseAddParam('a:2,b')).toEqual([{ id: 'a', qty: 2 }, { id: 'b', qty: 1 }]);
  });
  it('drops junk, sums repeats and clamps', () => {
    expect(parseAddParam(',a:0, ,a:x,b:999')).toEqual([{ id: 'a', qty: 2 }, { id: 'b', qty: 20 }]);
  });
});

describe('itemOrderLink', () => {
  it('appends add to an existing query', () => {
    expect(itemOrderLink('https://ordena.x.mx/order?p=ref', 'abc'))
      .toBe('https://ordena.x.mx/order?p=ref&add=abc');
  });
});
