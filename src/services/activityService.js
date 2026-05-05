import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Logs an action to the activity_logs table.
 *
 * Prefer the canonical action codes in `activityFormatter.js` (e.g. 'sale',
 * 'discount_applied', 'inventory_restock'). Pass `description = null` so the
 * UI renders the human-readable text from `metadata` in the viewer's locale.
 *
 * @param {string} actionType
 * @param {string|null} description - Pre-formatted text (legacy). Prefer null.
 * @param {object} metadata - Structured payload the UI formatter consumes.
 */
export const logActivity = async (actionType, description = null, metadata = null) => {
  try {
    // We grab the current cashier straight from the global store
    const { activeCashier } = useAuthStore.getState();
    const cashierName = activeCashier?.name || 'System / Unknown';

    const { error } = await supabase.from('activity_logs').insert([{
      cashier_name: cashierName,
      action_type: actionType,
      description: description,
      metadata: metadata
    }]);

    if (error) throw error;
  } catch (error) {
    console.error("Failed to log activity:", error);
    // We don't want to throw and break the main app flow if a log fails,
    // so we just catch and console error it.
  }
};
