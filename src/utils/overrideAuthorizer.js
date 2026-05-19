// Transient holder for the authorizer of the most recent manager override.
//
// The gate (`gateRegisterAction`) stashes the authorizer here right before it
// runs the action callback; the action's log site reads & clears it on its
// next `logActivity` call. Module-level state is fine because the value's
// lifetime is one click — set, consumed, gone.
//
// We deliberately don't auto-consume inside `logActivity` to keep the audit
// payload explicit: only the log calls that opt in record an override.

let pending = null;

export function setPendingAuthorizer(authorizer) {
  pending = authorizer || null;
}

/**
 * Returns the pending authorizer and clears it. Returns null if none was set.
 */
export function consumePendingAuthorizer() {
  const p = pending;
  pending = null;
  return p;
}
