/**
 * Resolve the register category tabs in the order they should be shown.
 *
 * Honors the admin-configured `categoryOrder` (categories listed there come
 * first, in that order) followed by any remaining categories in their raw
 * object-key order, then drops anything in `hiddenCategories`.
 *
 * Keeping this in one place ensures the rendered tabs (MenuArea) and the
 * default-selected category (Register boot) always agree.
 */
export function getOrderedVisibleCategories(menuData) {
  const allCats = Object.keys(menuData?.categories || {});
  const order = menuData?.categoryOrder || [];
  const hidden = new Set(menuData?.hiddenCategories || []);
  return [
    ...order.filter(c => allCats.includes(c)),
    ...allCats.filter(c => !order.includes(c)),
  ].filter(c => !hidden.has(c));
}
