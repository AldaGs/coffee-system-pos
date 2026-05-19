// Per-PIN role helpers. The cashier's `role` ('employee' | 'manager' | 'admin')
// is the source of truth; the legacy `isAdmin` boolean is kept for backwards
// compatibility with existing installs (it derives from role on write, and
// rows missing `role` are mapped from `isAdmin` on read).

export const ROLES = Object.freeze({
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  ADMIN: 'admin',
});

const ORDER = { employee: 1, manager: 2, admin: 3 };

/**
 * Resolve the effective role of a cashier, tolerating legacy rows that only
 * have `isAdmin` set. Defaults to 'employee' if nothing matches.
 */
export function getRole(cashier) {
  if (!cashier) return ROLES.EMPLOYEE;
  if (cashier.role && ORDER[cashier.role]) return cashier.role;
  return cashier.isAdmin ? ROLES.ADMIN : ROLES.EMPLOYEE;
}

/**
 * True if `role` is at least `min` in the hierarchy
 * (employee < manager < admin). Unknown roles fall back to 'employee'.
 */
export function roleAtLeast(role, min) {
  const r = ORDER[role] || ORDER.employee;
  const m = ORDER[min] || ORDER.employee;
  return r >= m;
}

/**
 * Returns true if the cashier (resolved through `getRole`) meets the minimum.
 */
export function cashierMeets(cashier, min) {
  return roleAtLeast(getRole(cashier), min);
}
