// Utility functions for checking and updating order statuses in batches
// Optimized for performance with parallel processing and last-check tracking

import { supabase } from './supabase';
import { getSMMGenOrderStatus } from './smmgen';
import { getSMMCostOrderStatus } from './smmcost';
import { getJBSMMPanelOrderStatus } from './jbsmmpanel';
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
 * Map JB SMM Panel status to our status format (same mapping as SMMGen/SMMCost)
 * @param {string} jbsmmpanelStatus - Status from JB SMM Panel API
 * @returns {string|null} Mapped status or null if unknown
 */
const mapJBSMMPanelStatus = (jbsmmpanelStatus) => {
  if (!jbsmmpanelStatus) return null;
  
  const statusString = String(jbsmmpanelStatus).trim();
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
  // Check if order has SMMGen, SMMCost, or JB SMM Panel order ID
  // Ignore smmgen_order_id if it's the internal UUID (set by trigger)
  const isInternalUuid = order.smmgen_order_id === order.id;
  const hasSmmgenId = order.smmgen_order_id && 
                     order.smmgen_order_id !== "order not placed at smm gen" && 
                     !isInternalUuid; // Ignore if it's just the internal UUID
  const hasSmmcostId = order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost";
  // JB SMM Panel validation: handle both string and number types, check for error strings
  const jbsmmpanelId = order.jbsmmpanel_order_id;
  const hasJbsmmpanelId = jbsmmpanelId && 
    String(jbsmmpanelId).toLowerCase() !== "order not placed at jbsmmpanel" &&
    Number(jbsmmpanelId) > 0;
  
  // Debug logging for JB SMM Panel orders
  if (jbsmmpanelId) {
    console.log('[orderStatusCheck] shouldCheckOrder - JB SMM Panel order:', {
      orderId: order.id,
      jbsmmpanelId,
      jbsmmpanelIdType: typeof jbsmmpanelId,
      jbsmmpanelIdString: String(jbsmmpanelId),
      jbsmmpanelIdLower: String(jbsmmpanelId).toLowerCase(),
      isErrorString: String(jbsmmpanelId).toLowerCase() === "order not placed at jbsmmpanel",
      numberValue: Number(jbsmmpanelId),
      hasJbsmmpanelId,
      hasSmmgenId,
      hasSmmcostId,
      hasAnyId: hasSmmgenId || hasSmmcostId || hasJbsmmpanelId,
      currentStatus: order.status,
      lastStatusCheck: order.last_status_check,
      minIntervalMinutes
    });
  }
  
  // Skip if no valid order ID from any panel
  if (!hasSmmgenId && !hasSmmcostId && !hasJbsmmpanelId) {
    if (jbsmmpanelId) {
      console.log('[orderStatusCheck] shouldCheckOrder - Skipping JB SMM Panel order (no valid ID):', {
        orderId: order.id,
        jbsmmpanelId,
        hasJbsmmpanelId,
        reason: 'hasJbsmmpanelId is false'
      });
    }
    return false;
  }

  // Skip if order is completed or refunded
  if (order.status === 'completed' || order.status === 'refunded') {
    if (jbsmmpanelId) {
      console.log('[orderStatusCheck] shouldCheckOrder - Skipping JB SMM Panel order (completed/refunded):', {
        orderId: order.id,
        jbsmmpanelId,
        status: order.status
      });
    }
    return false;
  }

  // Skip if checked recently (within minIntervalMinutes)
  // If minIntervalMinutes is 0, bypass the interval check (for manual/admin checks)
  if (minIntervalMinutes > 0 && order.last_status_check) {
    const lastCheck = new Date(order.last_status_check);
    const now = new Date();
    const minutesSinceCheck = (now - lastCheck) / (1000 * 60);
    
    if (minutesSinceCheck < minIntervalMinutes) {
      if (jbsmmpanelId) {
        console.log('[orderStatusCheck] shouldCheckOrder - Skipping JB SMM Panel order (checked recently):', {
          orderId: order.id,
          jbsmmpanelId,
          minutesSinceCheck,
          minIntervalMinutes,
          lastStatusCheck: order.last_status_check
        });
      }
      return false;
    }
  }

  if (jbsmmpanelId) {
    console.log('[orderStatusCheck] shouldCheckOrder - JB SMM Panel order WILL be checked:', {
      orderId: order.id,
      jbsmmpanelId,
      status: order.status
    });
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

    // Check if order has SMMGen, SMMCost, or JB SMM Panel order ID
    // Ignore smmgen_order_id if it's the internal UUID (set by trigger)
    const isInternalUuid = order.smmgen_order_id === order.id;
    const hasSmmgenId = order.smmgen_order_id && 
                       order.smmgen_order_id !== "order not placed at smm gen" && 
                       !isInternalUuid; // Ignore if it's just the internal UUID
    const hasSmmcostId = order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost";
    // JB SMM Panel validation: handle both string and number types, check for error strings
    const jbsmmpanelId = order.jbsmmpanel_order_id;
    const hasJbsmmpanelId = jbsmmpanelId && 
      String(jbsmmpanelId).toLowerCase() !== "order not placed at jbsmmpanel" &&
      Number(jbsmmpanelId) > 0;

    // Prioritize: SMMCost > JB SMM Panel > SMMGen
    if (hasSmmcostId) {
      // Get status from SMMCost (parse the order ID since it's stored as TEXT but API expects a number)
      statusData = await getSMMCostOrderStatus(parseInt(order.smmcost_order_id, 10));
      const smmcostStatus = statusData?.status || statusData?.Status;
      mappedStatus = mapSMMCostStatus(smmcostStatus);
      panelSource = 'smmcost';
    } else if (hasJbsmmpanelId) {
      // Get status from JB SMM Panel
      console.log('[orderStatusCheck] Checking JB SMM Panel order status:', {
        orderId: order.id,
        jbsmmpanelOrderId: jbsmmpanelId,
        jbsmmpanelOrderIdType: typeof jbsmmpanelId,
        currentStatus: order.status,
        lastStatusCheck: order.last_status_check
      });
      
      statusData = await getJBSMMPanelOrderStatus(jbsmmpanelId);
      
      // Log the API response for debugging
      console.log('[orderStatusCheck] JB SMM Panel status API response:', {
        orderId: order.id,
        jbsmmpanelOrderId: jbsmmpanelId,
        statusData,
        hasStatusData: !!statusData,
        statusDataType: typeof statusData,
        statusDataKeys: statusData && typeof statusData === 'object' ? Object.keys(statusData) : null,
        statusDataIsArray: Array.isArray(statusData)
      });
      
      // Check if statusData is null/undefined (network errors, etc.)
      if (!statusData) {
        console.warn('JB SMM Panel status check returned null/undefined:', {
          orderId: order.id,
          jbsmmpanelOrderId: jbsmmpanelId,
          reason: 'API returned null (likely network error or order not found)'
        });
        throw new Error('JB SMM Panel status check failed: API returned null');
      }
      
      // Extract status from various possible field names and nested structures
      // Check all possible locations where status might be stored
      const jbsmmpanelStatus = statusData?.status || 
        statusData?.Status || 
        statusData?.STATUS ||
        statusData?.order?.status ||
        statusData?.order?.Status ||
        statusData?.data?.status ||
        statusData?.data?.Status ||
        statusData?.result?.status ||
        statusData?.result?.Status ||
        // Check if status is a number (some APIs use numeric codes)
        (typeof statusData?.status === 'number' ? String(statusData.status) : null) ||
        (typeof statusData?.Status === 'number' ? String(statusData.Status) : null) ||
        null;
      
      console.log('JB SMM Panel status extracted:', {
        orderId: order.id,
        jbsmmpanelOrderId: jbsmmpanelId,
        rawStatus: jbsmmpanelStatus,
        statusDataType: typeof jbsmmpanelStatus,
        fullResponseKeys: statusData ? Object.keys(statusData) : [],
        fullResponse: statusData
      });
      
      // If status is still null, log the full response structure for debugging
      if (!jbsmmpanelStatus) {
        console.error('JB SMM Panel status not found in response. Full response structure:', {
          orderId: order.id,
          jbsmmpanelOrderId: jbsmmpanelId,
          response: statusData,
          responseKeys: statusData ? Object.keys(statusData) : [],
          responseStringified: JSON.stringify(statusData, null, 2)
        });
      }
      
      mappedStatus = mapJBSMMPanelStatus(jbsmmpanelStatus);
      
      console.log('JB SMM Panel status mapped:', {
        orderId: order.id,
        jbsmmpanelOrderId: jbsmmpanelId,
        rawStatus: jbsmmpanelStatus,
        mappedStatus,
        currentStatus: order.status,
        willUpdate: mappedStatus && mappedStatus !== order.status && order.status !== 'refunded'
      });
      
      panelSource = 'jbsmmpanel';
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
      console.log('Updating order status:', {
        orderId: order.id,
        panelSource,
        oldStatus: order.status,
        newStatus: mappedStatus,
        jbsmmpanelOrderId: panelSource === 'jbsmmpanel' ? jbsmmpanelId : undefined
      });
      
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

      const { error: updateError, data: updateResult } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', order.id)
        .select();

      if (updateError) {
        console.error('Failed to update order status in database:', {
          orderId: order.id,
          error: updateError,
          updateData
        });
        throw updateError;
      }

      console.log('Order status updated successfully:', {
        orderId: order.id,
        panelSource,
        oldStatus: order.status,
        newStatus: mappedStatus,
        updateResult
      });

      result.updated = true;
      result.newStatus = mappedStatus;
      
      // Call callback if provided
      if (onStatusUpdate) {
        onStatusUpdate(order.id, mappedStatus, order.status);
      }
    } else {
      // Status unchanged, but still update last_status_check
      const reason = !mappedStatus 
        ? 'mappedStatus is null' 
        : mappedStatus === order.status 
        ? 'status unchanged' 
        : order.status === 'refunded'
        ? 'order is refunded'
        : 'unknown reason';
      
      console.log('Order status not updated:', {
        orderId: order.id,
        panelSource,
        currentStatus: order.status,
        mappedStatus,
        reason
      });
      
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
    console.error(`[orderStatusCheck] Error checking order status for order ${order.id}:`, {
      error: error.message,
      errorName: error.name,
      errorStack: error.stack,
      orderId: order.id,
      orderStatus: order.status,
      smmgenOrderId: order.smmgen_order_id,
      smmcostOrderId: order.smmcost_order_id,
      jbsmmpanelOrderId: order.jbsmmpanel_order_id,
      panelSource: panelSource || 'unknown'
    });
    result.error = error.message;
    result.errorName = error.name;
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
  console.log('[orderStatusCheck] checkOrdersStatusBatch START', {
    totalOrders: orders.length,
    options,
    timestamp: new Date().toISOString(),
    orderIds: orders.map(o => o.id),
    jbsmmpanelOrders: orders.filter(o => o.jbsmmpanel_order_id).map(o => ({
      id: o.id,
      jbsmmpanel_order_id: o.jbsmmpanel_order_id,
      status: o.status,
      last_status_check: o.last_status_check
    }))
  });
  
  const {
    concurrency = 5,
    minIntervalMinutes = 5,
    onStatusUpdate = null,
    onProgress = null
  } = options;

  console.log('[orderStatusCheck] checkOrdersStatusBatch called:', {
    totalOrders: orders.length,
    minIntervalMinutes,
    concurrency,
    orderIds: orders.map(o => o.id),
    jbsmmpanelOrders: orders.filter(o => o.jbsmmpanel_order_id).map(o => ({
      id: o.id,
      jbsmmpanel_order_id: o.jbsmmpanel_order_id,
      status: o.status,
      last_status_check: o.last_status_check
    }))
  });

  // Filter orders that need checking
  console.log('[orderStatusCheck] Filtering orders that need checking...');
  const ordersToCheck = orders.filter(order => {
    const shouldCheck = shouldCheckOrder(order, minIntervalMinutes);
    if (order.jbsmmpanel_order_id) {
      console.log('[orderStatusCheck] JB SMM Panel order check decision:', {
        orderId: order.id,
        jbsmmpanel_order_id: order.jbsmmpanel_order_id,
        jbsmmpanel_order_idType: typeof order.jbsmmpanel_order_id,
        jbsmmpanel_order_idNumber: Number(order.jbsmmpanel_order_id),
        currentStatus: order.status,
        shouldCheck,
        lastStatusCheck: order.last_status_check,
        minIntervalMinutes
      });
    }
    return shouldCheck;
  });
  
  console.log('[orderStatusCheck] Orders filtered:', {
    total: orders.length,
    toCheck: ordersToCheck.length,
    filteredOut: orders.length - ordersToCheck.length,
    jbsmmpanelToCheck: ordersToCheck.filter(o => o.jbsmmpanel_order_id).length
  });

  if (ordersToCheck.length === 0) {
    console.log('No orders need status checking', {
      totalOrders: orders.length,
      filteredOut: orders.length,
      reasons: orders.map(order => {
        const isInternalUuid = order.smmgen_order_id === order.id;
        const hasSmmgenId = order.smmgen_order_id && 
                           order.smmgen_order_id !== "order not placed at smm gen" && 
                           !isInternalUuid;
        const hasSmmcostId = order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost";
        const jbsmmpanelId = order.jbsmmpanel_order_id;
        const hasJbsmmpanelId = jbsmmpanelId && 
          String(jbsmmpanelId).toLowerCase() !== "order not placed at jbsmmpanel" &&
          Number(jbsmmpanelId) > 0;
        const hasValidId = hasSmmgenId || hasSmmcostId || hasJbsmmpanelId;
        const isCompleted = order.status === 'completed' || order.status === 'refunded';
        const recentlyChecked = minIntervalMinutes > 0 && order.last_status_check && 
          (new Date() - new Date(order.last_status_check)) / (1000 * 60) < minIntervalMinutes;
        
        return {
          orderId: order.id,
          hasValidId,
          hasSmmgenId,
          hasSmmcostId,
          hasJbsmmpanelId,
          jbsmmpanel_order_id: order.jbsmmpanel_order_id,
          isCompleted,
          recentlyChecked,
          status: order.status,
          lastStatusCheck: order.last_status_check
        };
      })
    });
    return {
      checked: 0,
      updated: 0,
      errors: [],
      results: []
    };
  }

  console.log(`Checking status for ${ordersToCheck.length} orders (filtered from ${orders.length} total)`, {
    ordersToCheck: ordersToCheck.map(o => ({
      id: o.id,
      status: o.status,
      jbsmmpanel_order_id: o.jbsmmpanel_order_id,
      smmgen_order_id: o.smmgen_order_id,
      smmcost_order_id: o.smmcost_order_id
    }))
  });

  const results = await processBatch(ordersToCheck, concurrency, onStatusUpdate);
  
  // Report progress if callback provided
  if (onProgress) {
    onProgress(ordersToCheck.length, ordersToCheck.length);
  }

  // Batch update last_status_check for orders that were skipped (not checked recently)
  const skippedOrders = orders.filter(order => {
    const hasSmmgenId = order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen";
    const hasSmmcostId = order.smmcost_order_id && order.smmcost_order_id !== "order not placed at smmcost";
    // JB SMM Panel validation: handle both string and number types, check for error strings
    const jbsmmpanelId = order.jbsmmpanel_order_id;
    const hasJbsmmpanelId = jbsmmpanelId && 
      String(jbsmmpanelId).toLowerCase() !== "order not placed at jbsmmpanel" &&
      Number(jbsmmpanelId) > 0;
    return !shouldCheckOrder(order, minIntervalMinutes) && 
      (hasSmmgenId || hasSmmcostId || hasJbsmmpanelId) &&
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

