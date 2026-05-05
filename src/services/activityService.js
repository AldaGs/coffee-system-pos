import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Logs an action to the activity_logs table.
 * 
 * @param {string} actionType - E.g., 'Discount Applied', 'Price Changed', 'Inventory Restock'
 * @param {string} description - Human readable description of what happened
 * @param {object} metadata - Optional JSON object with exact values (e.g., { oldPrice: 10, newPrice: 15 })
 */
export const logActivity = async (actionType, description, metadata = null) => {
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
