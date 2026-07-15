// businessProfile — the single source of truth for what kind of business is
// running the app. A "business type" is just a NAMED PRESET over the capability
// axes the ecosystem actually branches on:
//
//   • floorPlan — needs the visual table/floor map (dine-in seating)
//   • kitchen   — has a prep stage relevant to tinykds
//   • ships     — hands orders off to tinylogistics for remote fulfillment
//   • terms     — vocabulary token (ticket/table vs order/customer vs sale)
//   • defaultLayout — the register layout a fresh station falls back to
//
// CRITICAL: types set DEFAULTS and vocabulary; they never hard-disable a
// capability another app provides. Kitchen (kdsEnabled) and shipping stay
// independently toggleable, so hybrids — e.g. a quick-service café that ALSO
// ships beans online — are expressed as flags on top of the preset, not as a
// combinatorial explosion of new types. Add a new type only when it flips an
// axis the four below don't already cover.
//
// `defaultLayout` values MUST match the register layout tokens used in
// GeneralSettingsTab / Register: 'cafe' | 'orders' | 'tables'.

export const BUSINESS_TYPES = ['restaurant', 'quickservice', 'store', 'ecommerce'];

export const DEFAULT_BUSINESS_TYPE = 'restaurant';

const PROFILES = {
  // Full-service restaurant: seated tickets on a floor map, kitchen prep.
  restaurant: {
    defaultLayout: 'tables',
    floorPlan: true,
    kitchen: true,
    ships: false,
    terms: 'restaurant',
  },
  // Counter café / bakery / food truck: fast sale, a kitchen, but no seating.
  quickservice: {
    defaultLayout: 'cafe',
    floorPlan: false,
    kitchen: true,
    ships: false,
    terms: 'quickservice',
  },
  // Retail store: counter sale of packaged goods, no kitchen, no seating.
  store: {
    defaultLayout: 'cafe',
    floorPlan: false,
    kitchen: false,
    ships: false,
    terms: 'store',
  },
  // Online store: persistent orders with a customer, handed to tinylogistics.
  ecommerce: {
    defaultLayout: 'orders',
    floorPlan: false,
    kitchen: false,
    ships: true,
    terms: 'ecommerce',
  },
};

export function getBusinessProfile(type) {
  return PROFILES[type] || PROFILES[DEFAULT_BUSINESS_TYPE];
}

// Read the store-wide business type out of the cached synced settings without
// pulling in React/state. Used by the register layout seeding on cold boot,
// where the only source available is the localStorage menu cache.
export function getCachedBusinessType() {
  try {
    const cached = localStorage.getItem('tinypos_cached_menu');
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed?.posSettings?.businessType || DEFAULT_BUSINESS_TYPE;
    }
  } catch {
    /* cache unavailable/corrupt — fall through to the default */
  }
  return DEFAULT_BUSINESS_TYPE;
}
