import { describe, expect, it } from 'vitest';
import { validDeliveryArea } from '../utils/deliveryAreas';

const area = { id: 'a', enabled: true, name: 'Centro', feeCents: 4000, priority: 2 };

describe('delivery area validation', () => {
  it('accepts a center and radius and rejects an unset or invalid center', () => {
    expect(validDeliveryArea({ ...area, kind: 'radius', center: { lat: 19.04, lng: -98.2 }, radiusKm: 3 })).toBe(true);
    expect(validDeliveryArea({ ...area, kind: 'radius', center: null, radiusKm: 3 })).toBe(false);
    expect(validDeliveryArea({ ...area, kind: 'radius', center: { lat: 92, lng: -98.2 }, radiusKm: 3 })).toBe(false);
    expect(validDeliveryArea({ ...area, kind: 'radius', center: { lat: 19.04, lng: -98.2 }, radiusKm: 0 })).toBe(false);
  });

  it('requires a non-crossing street boundary with at least three corners', () => {
    expect(validDeliveryArea({ ...area, kind: 'polygon', points: [[-98.2, 19], [-98.1, 19], [-98.1, 19.1], [-98.2, 19.1]] })).toBe(true);
    expect(validDeliveryArea({ ...area, kind: 'polygon', points: [[-98.2, 19], [-98.1, 19.1], [-98.1, 19], [-98.2, 19.1]] })).toBe(false);
    expect(validDeliveryArea({ ...area, kind: 'polygon', points: [[-98.2, 19], [-98.1, 19]] })).toBe(false);
  });
});
