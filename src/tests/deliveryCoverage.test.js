import { describe, expect, it } from 'vitest';
import { radiusRing, visibleDeliveryCoverage } from '../utils/deliveryCoverage';

const radius = (id, priority = 0) => ({ id, name: id, enabled: true, kind: 'radius', center: { lat: 19.04, lng: -98.2 }, radiusKm: 2, feeCents: 2500, priority });
const polygon = { id: 'poly', name: 'Centro', enabled: true, kind: 'polygon', points: [[-98.2, 19.04], [-98.19, 19.04], [-98.19, 19.05]], feeCents: 3500, priority: 2 };

describe('customer delivery coverage', () => {
  it('filters disabled and invalid areas, then orders overlaps by server priority and original position', () => {
    const result = visibleDeliveryCoverage([radius('low'), { ...radius('off', 9), enabled: false }, polygon, { ...radius('bad'), center: null }, radius('first', 2)]);
    expect(result.map((area) => area.id)).toEqual(['poly', 'first', 'low']);
    expect(new Set(result.map((area) => area.color)).size).toBe(3);
  });

  it('closes polygon and geodesic radius outlines for MapLibre', () => {
    const [poly, circle] = visibleDeliveryCoverage([polygon, radius('circle')]);
    expect(poly.geometry.coordinates[0].at(-1)).toEqual(polygon.points[0]);
    expect(circle.geometry.coordinates[0]).toHaveLength(97);
    expect(circle.geometry.coordinates[0].at(-1)).toEqual(circle.geometry.coordinates[0][0]);
    expect(radiusRing({ lat: 0, lng: 0 }, 1)[0][1]).toBeCloseTo(0.008993, 5);
  });
  it('can include disabled valid zones for the admin overview without changing public coverage', () => {
    const areas = [radius('active'), null, { ...radius('inactive'), enabled: false }];
    expect(visibleDeliveryCoverage(areas).map((area) => area.id)).toEqual(['active']);
    expect(visibleDeliveryCoverage(areas, { includeDisabled: true }).map((area) => [area.id, area.enabled])).toEqual([['active', true], ['inactive', false]]);
  });
});
