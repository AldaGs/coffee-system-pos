// Accepts #rrggbb, #rgb (with or without #) and rgb()/rgba(); returns lowercase #rrggbb or null.
export function parseColorToHex(value) {
  if (!value) return null;
  const v = value.trim();
  let m = v.match(/^#?([0-9a-fA-F]{6})$/);
  if (m) return `#${m[1].toLowerCase()}`;
  m = v.match(/^#?([0-9a-fA-F]{3})$/);
  if (m) {
    const [r, g, b] = m[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  m = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i);
  if (m) {
    const rgb = [m[1], m[2], m[3]].map(Number);
    if (rgb.every((n) => n >= 0 && n <= 255)) return '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
  }
  return null;
}
