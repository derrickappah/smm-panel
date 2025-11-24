// Utility functions for order status history tracking

import { supabase } from './supabase';

/**
 * Save order status to history table
 * @param {string} orderId - Order ID
 * @param {string} status - New status
 * @param {string} source - Source of status change: 'smmgen', 'manual', or 'system'
 * @param {Object} smmgenResponse - Full response from SMMGen API (optional)
 * @param {string} previousStatus - Previous status before this change (optional)
 * @param {string} createdBy - User ID who made the change (optional, for manual changes)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const saveOrderStatusHistory = async (
  orderId,
  status,
  source = 'system',
  smmgenResponse = null,
  previousStatus = null,
  createdBy = null
) => {
  try {
    const { error } = await supabase
      .from('order_status_history')
      .insert({
        order_id: orderId,
        status: status,
        source: source,
        smmgen_response: smmgenResponse,
        previous_status: previousStatus,
        created_by: createdBy
      });

    if (error) {
      console.error('Error saving order status history:', error);
      // Don't throw - history is not critical, just log the error
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Exception saving order status history:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get order status history for an order
 * @param {string} orderId - Order ID
 * @returns {Promise<Array>} Array of status history records
 */
export const getOrderStatusHistory = async (orderId) => {
  try {
    const { data, error } = await supabase
      .from('order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching order status history:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching order status history:', error);
    return [];
  }
};

