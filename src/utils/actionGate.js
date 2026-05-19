import { getRole, roleAtLeast } from './cashierRoles';
import { setPendingAuthorizer } from './overrideAuthorizer';

/**
 * Decides whether a money-affecting register action should run directly,
 * or be gated behind the manager-override PIN modal.
 *
 * Behavior is keyed on the strictRegisterOverrides setting:
 *
 *  - strictRegisterOverrides === false  (current default behavior)
 *      Always go through requirePin with the default admin gate. Matches
 *      the pre-RBAC shop that shares a single admin PIN.
 *
 *  - strictRegisterOverrides === true
 *      If the active cashier is already manager+ → run immediately, no PIN.
 *      Else → requirePin with minRole='manager' so a manager (or admin) can
 *      type their PIN to authorize. The action receives the authorizer so
 *      it can log the override.
 *
 * @param {object}   args
 * @param {object}   args.posSettings        The current posSettings.
 * @param {object}   args.activeCashier      The cashier currently operating the register.
 * @param {Function} args.requirePin         usePinChallenge.requirePin
 * @param {string}   args.title              Modal title (already translated)
 * @param {Function} args.run                The actual action. Receives an
 *                                           optional `authorizer` cashier.
 */
export function gateRegisterAction({ posSettings, activeCashier, requirePin, title, run }) {
  const strict = !!posSettings?.strictRegisterOverrides;
  if (!strict) {
    // Existing behavior — admin PIN required for everyone. No override logged
    // because the PIN simply matched (no role escalation happened).
    requirePin(title, () => { setPendingAuthorizer(null); run(null); });
    return;
  }
  // Strict mode: managers and admins skip the PIN entirely. The cashier
  // they ARE is already the authorizer, but no logged "override" because
  // they didn't need to escalate past their own role.
  const role = getRole(activeCashier);
  if (roleAtLeast(role, 'manager')) {
    setPendingAuthorizer(null);
    run(null);
    return;
  }
  // Employee: manager/admin must authorize. Stash the authorizer so the
  // downstream logActivity call can record who blessed it.
  requirePin(title, (authorizer) => {
    setPendingAuthorizer(authorizer);
    run(authorizer);
  }, { minRole: 'manager' });
}

/**
 * True if the lock-icon hint should render on a button. Only employees
 * see the hint, and only in strict mode — otherwise the gate is invisible
 * to everyone.
 */
export function showOverrideLock(posSettings, activeCashier) {
  if (!posSettings?.strictRegisterOverrides) return false;
  return getRole(activeCashier) === 'employee';
}
