const validPoint = ([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) &&
  lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-12 &&
  p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
  p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
const intersects = (a, b, c, d) => {
  const abC = cross(a, b, c); const abD = cross(a, b, d);
  const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0) ||
    onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
};

export function validDeliveryArea(area) {
  if (!area.name?.trim() || !Number.isSafeInteger(area.feeCents) || area.feeCents < 0 || area.feeCents > 100000000 ||
      !Number.isSafeInteger(area.priority) || Math.abs(area.priority) > 1000000) return false;
  if (area.kind === 'radius') return validPoint([area.center?.lng, area.center?.lat]) &&
    Number.isFinite(Number(area.radiusKm)) && Number(area.radiusKm) > 0 && Number(area.radiusKm) <= 1000;
  if (area.kind !== 'polygon' || !Array.isArray(area.points) || area.points.length < 3 || area.points.length > 200 ||
      !area.points.every((p) => Array.isArray(p) && p.length === 2 && validPoint(p))) return false;
  const points = area.points;
  const n = points.length;
  let twiceArea = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i]; const b = points[(i + 1) % n];
    if (a[0] === b[0] && a[1] === b[1]) return false;
    twiceArea += a[0] * b[1] - b[0] * a[1];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (intersects(a, b, points[j], points[(j + 1) % n])) return false;
    }
  }
  return Math.abs(twiceArea) > 1e-12;
}
