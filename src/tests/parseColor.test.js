import { describe, expect, it } from 'vitest';
import { parseColorToHex } from '../components/admin/settings/parseColor';

describe('parseColorToHex', () => {
  it('normalizes hex and rgb input', () => {
    expect(parseColorToHex('#F28B05')).toBe('#f28b05');
    expect(parseColorToHex('abc')).toBe('#aabbcc');
    expect(parseColorToHex(' rgb(242, 139, 5) ')).toBe('#f28b05');
    expect(parseColorToHex('rgba(0,0,0,0.5)')).toBe('#000000');
  });
  it('rejects anything else', () => {
    expect(parseColorToHex('rgb(300,0,0)')).toBeNull();
    expect(parseColorToHex('orange')).toBeNull();
    expect(parseColorToHex('')).toBeNull();
  });
});
