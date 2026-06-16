import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/useAuthStore';
import { isLocalMode } from '../utils/appMode';

/**
 * Logs an action to the activity_logs table.
 *
 * Prefer the canonical action codes in `activityFormatter.js` (e.g. 'sale',
 * 'discount_applied', 'inventory_restock'). Pass `description = null` so the
 * UI renders the human-readable text from `metadata` in the viewer's locale.
 *
 * For manager-override actions, pass `authorizedBy` so the audit trail
 * records both the operator and the authorizer. The authorizer is folded
 * into `metadata` (existing column) — we don't add a separate column to keep
 * the schema migration footprint zero.
 *
 * @param {string} actionType
 * @param {string|null} description - Pre-formatted text (legacy). Prefer null.
 * @param {object} metadata - Structured payload the UI formatter consumes.
 * @param {{id: any, name: string, role?: string}|null} authorizedBy - Manager
 *   or admin who authorized this override, if any.
 */
export const logActivity = async (actionType, description = null, metadata = null, authorizedBy = null) => {
  // Local ('guest') mode has no activity_logs table and no Activity viewer.
  if (isLocalMode()) return;
  try {
    // We grab the current cashier straight from the global store
    const { activeCashier } = useAuthStore.getState();
    const cashierName = activeCashier?.name || 'System / Unknown';

    let finalMetadata = metadata;
    if (authorizedBy) {
      finalMetadata = {
        ...(metadata || {}),
        authorized_by: {
          id: authorizedBy.id,
          name: authorizedBy.name,
          role: authorizedBy.role,
        },
        override: true,
        actor_cashier_id: activeCashier?.id ?? null,
      };
    }

    const { error } = await supabase.from('activity_logs').insert([{
      cashier_name: cashierName,
      action_type: actionType,
      description: description,
      metadata: finalMetadata
    }]);

    if (error) throw error;
  } catch (error) {
    console.error("Failed to log activity:", error);
    // We don't want to throw and break the main app flow if a log fails,
    // so we just catch and console error it.
  }
};
