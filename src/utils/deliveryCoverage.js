import { validDeliveryArea } from './deliveryAreas';

const EARTH_RADIUS_KM = 6371.0088;

// This is a visual approximation of the server's geodesic radius boundary.
export function radiusRing(center, radiusKm, segments = 96) {
  const lat = center.lat * Math.PI / 180;
  const lng = center.lng * Math.PI / 180;
  const distance = radiusKm / EARTH_RADIUS_KM;
  const ring = Array.from({ length: segments }, (_, i) => {
    const bearing = i * 2 * Math.PI / segments;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
    const nextLng = lng + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat));
    return [nextLng * 180 / Math.PI, nextLat * 180 / Math.PI];
  });
  return [...ring, ring[0]];
}

export function visibleDeliveryCoverage(areas, { includeDisabled = false } = {}) {
  if (!Array.isArray(areas)) return [];
  return areas
    .map((area, index) => ({ area, index }))
    .filter(({ area }) => area && (includeDisabled || area.enabled === true) && validDeliveryArea(area))
    .sort((a, b) => b.area.priority - a.area.priority || a.index - b.index)
    .map(({ area }, index) => {
      const ring = area.kind === 'radius' ? radiusRing(area.center, Number(area.radiusKm)) : [...area.points, area.points[0]];
      const hue = Math.round((index * 137.508 + 18) % 360);
      return {
        id: area.id,
        name: area.name,
        feeCents: area.feeCents,
        priority: area.priority,
        enabled: area.enabled === true,
        color: `hsl(${hue}, 72%, 42%)`,
        geometry: { type: 'Polygon', coordinates: [ring] },
        boundsPoints: ring,
      };
    });
}
