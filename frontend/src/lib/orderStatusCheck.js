// Utility functions for checking and updating order statuses in batches
// Optimized for performance with parallel processing and last-check tracking

import { supabase } from './supabase';
import { getSMMGenOrderStatus } from './smmgen';
import { getSMMCostOrderStatus } from './smmcost';
import { saveOrderStatusHistory } from './orderStatusHistory';

/**
 * Map SMMGen status to our status format
 * @param {string} smmgenStatus - Status from SMMGen API
 * @returns {string|null} Mapped status or null if unknown
 */
const mapSMMGenStatus = (smmgenStatus) => {
  if (!smmgenStatus) return null;
  
  const statusString = String(smmgenStatus).trim();
  const statusLower = statusString.toLowerCase();
  
  if (statusLower === 'pending' || statusLower.includes('pending')) return 'pending';
  if (statusLower === 'in progress' || statusLower.includes('in progress')) return 'in progress';
  if (statusLower === 'completed' || statusLower.includes('completed')) return 'completed';
  if (statusLower === 'partial' || statusLower.includes('partial')) return 'partial';
  if (statusLower === 'processing' || statusLower.includes('processing')) return 'processing';
  if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) return 'canceled';
  if (statusLower === 'refunds' || statusLower.includes('refund')) return 'refunds';
  
  return null;
};

/**
 * Map SMMCost status to our status format (same mapping as SMMGen)
 * @param {string} smmcostStatus - Status from SMMCost API
 * @returns {string|null} Mapped status or null if unknown
 */
const mapSMMCostStatus = (smmcostStatus) => {
  if (!smmcostStatus) return null;
  
  const statusString = String(smmcostStatus).trim();
  const statusLower = statusString.toLowerCase();
  
  if (statusLower === 'pending' || statusLower.includes('pending')) return 'pending';
  if (statusLower === 'in progress' || statusLower.includes('in progress')) return 'in progress';
  if (statusLower === 'completed' || statusLower.includes('completed')) return 'completed';
  if (statusLower === 'partial' || statusLower.includes('partial')) return 'partial';
  if (statusLower === 'processing' || statusLower.includes('processing')) return 'processing';
  if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) return 'canceled';
  if (statusLower === 'refunds' || statusLower.includes('refund')) return 'refunds';
  
  return null;
};

/**
 * Check if an order should be checked for status updates
 * @param {Object} order - Order object
 * @param {number} minIntervalMinutes - Minimum minutes since last check (default: 5)
 * @returns {boolean} True if order should be checked
 */
export const shouldCheckOrder = (order, minIntervalMinutes = 5) => {
  // Check if order has SMMGen or SMMCost order ID (smmcost_order_id is now TEXT)
  const hasSmmgenId = order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen";
  const hasSmmcostId = order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost";
  
  // Skip if no valid order ID from either panel
  if (!hasSmmgenId && !hasSmmcostId) {
    return false;
  }

  // Skip if order is completed or refunded
  if (order.status === 'completed' || order.status === 'refunded') {
    return false;
  }

  // Skip if checked recently (within minIntervalMinutes)
  if (order.last_status_check) {
    const lastCheck = new Date(order.last_status_check);
    const now = new Date();
    const minutesSinceCheck = (now - lastCheck) / (1000 * 60);
    
    if (minutesSinceCheck < minIntervalMinutes) {
      return false;
    }
  }

  return true;
};

/**
 * Check and update a single order's status
 * @param {Object} order - Order object
 * @param {Function} onStatusUpdate - Optional callback when status is updated
 * @returns {Promise<Object>} Result object with success, updated, and order info
 */
const checkSingleOrderStatus = async (order, onStatusUpdate = null) => {
  const result = {
    orderId: order.id,
    success: false,
    updated: false,
    error: null,
    newStatus: null
  };

  try {
    let statusData = null;
    let mappedStatus = null;
    let panelSource = null;

    // Check if order has SMMGen or SMMCost order ID (smmcost_order_id is now TEXT)
    const hasSmmgenId = order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen";
    const hasSmmcostId = order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost";

    // Prioritize SMMCost if both exist, otherwise use whichever is available
    if (hasSmmcostId) {
      // Get status from SMMCost (parse the order ID since it's stored as TEXT but API expects a number)
      statusData = await getSMMCostOrderStatus(parseInt(order.smmcost_order_id, 10));
      const smmcostStatus = statusData?.status || statusData?.Status;
      mappedStatus = mapSMMCostStatus(smmcostStatus);
      panelSource = 'smmcost';
    } else if (hasSmmgenId) {
    // Get status from SMMGen
      statusData = await getSMMGenOrderStatus(order.smmgen_order_id);
      const smmgenStatus = statusData?.status || statusData?.Status;
      mappedStatus = mapSMMGenStatus(smmgenStatus);
      panelSource = 'smmgen';
    } else {
      throw new Error('Order has no valid panel order ID');
    }

    // Update if status changed and order is not refunded
    if (mappedStatus && mappedStatus !== order.status && order.status !== 'refunded') {
      // Save status to history
      await saveOrderStatusHistory(
        order.id,
        mappedStatus,
        panelSource,
        statusData,
        order.status
      );

      // Update order status in Supabase
      const updateData = {
        status: mappedStatus,
        last_status_check: new Date().toISOString(),
        completed_at: mappedStatus === 'completed' ? new Date().toISOString() : order.completed_at
      };

      const { error: updateError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', order.id);

      if (updateError) {
        throw updateError;
      }

      result.updated = true;
      result.newStatus = mappedStatus;
      
      // Call callback if provided
      if (onStatusUpdate) {
        onStatusUpdate(order.id, mappedStatus, order.status);
      }
    } else {
      // Status unchanged, but still update last_status_check
      const { error: updateError } = await supabase
        .from('orders')
        .update({ last_status_check: new Date().toISOString() })
        .eq('id', order.id);

      if (updateError) {
        console.warn(`Failed to update last_status_check for order ${order.id}:`, updateError);
      }
    }

    result.success = true;
  } catch (error) {
    console.error(`Error checking order status for order ${order.id}:`, {
      error: error.message,
      orderId: order.id,
      smmgenOrderId: order.smmgen_order_id,
      smmcostOrderId: order.smmcost_order_id
    });
    result.error = error.message;
  }

  return result;
};

/**
 * Process a batch of orders with concurrency limit
 * @param {Array} orders - Array of orders to check
 * @param {number} concurrency - Maximum concurrent checks (default: 5)
 * @param {Function} onStatusUpdate - Optional callback when status is updated
 * @returns {Promise<Array>} Array of results
 */
const processBatch = async (orders, concurrency = 5, onStatusUpdate = null) => {
  const results = [];
  
  for (let i = 0; i < orders.length; i += concurrency) {
    const batch = orders.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(order => checkSingleOrderStatus(order, onStatusUpdate))
    );
    results.push(...batchResults);
  }
  
  return results;
};

/**
 * Check orders status in parallel batches with filtering
 * @param {Array} orders - Array of orders to check
 * @param {Object} options - Configuration options
 * @param {number} options.concurrency - Maximum concurrent checks (default: 5)
 * @param {number} options.minIntervalMinutes - Minimum minutes since last check (default: 5)
 * @param {Function} options.onStatusUpdate - Callback when status is updated (orderId, newStatus, oldStatus)
 * @param {Function} options.onProgress - Callback for progress updates (checked, total)
 * @returns {Promise<Object>} Results object with checked, updated, errors arrays
 */
export const checkOrdersStatusBatch = async (orders, options = {}) => {
  const {
    concurrency = 5,
    minIntervalMinutes = 5,
    onStatusUpdate = null,
    onProgress = null
  } = options;

  // Filter orders that need checking
  const ordersToCheck = orders.filter(order => shouldCheckOrder(order, minIntervalMinutes));

  if (ordersToCheck.length === 0) {
    console.log('No orders need status checking');
    return {
      checked: 0,
      updated: 0,
      errors: [],
      results: []
    };
  }

  console.log(`Checking status for ${ordersToCheck.length} orders (filtered from ${orders.length} total)`);

  const results = await processBatch(ordersToCheck, concurrency, onStatusUpdate);
  
  // Report progress if callback provided
  if (onProgress) {
    onProgress(ordersToCheck.length, ordersToCheck.length);
  }

  // Batch update last_status_check for orders that were skipped (not checked recently)
  const skippedOrders = orders.filter(order => {
    const hasSmmgenId = order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen";
    const hasSmmcostId = order.smmcost_order_id && order.smmcost_order_id !== "order not placed at smmcost";
    return !shouldCheckOrder(order, minIntervalMinutes) && 
      (hasSmmgenId || hasSmmcostId) &&
    order.status !== 'completed' &&
      order.status !== 'refunded';
  });

  if (skippedOrders.length > 0) {
    // Update last_status_check for skipped orders in batch (they were filtered out but still valid)
    // This is a no-op for most, but ensures consistency
    const skippedIds = skippedOrders.map(o => o.id);
    // Note: We don't update last_status_check for skipped orders since they were skipped for a reason
  }

  const updated = results.filter(r => r.updated).length;
  const errors = results.filter(r => !r.success);

  console.log(`Status check complete: ${ordersToCheck.length} checked, ${updated} updated, ${errors.length} errors`);

  return {
    checked: ordersToCheck.length,
    updated,
    errors: errors.map(r => ({ orderId: r.orderId, error: r.error })),
    results
  };
};

