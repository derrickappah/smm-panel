// Utility functions for checking and updating order statuses in batches
// Optimized for performance with parallel processing and last-check tracking

import { supabase } from './supabase';
import { getSMMGenOrderStatus } from './smmgen';
import { getSMMCostOrderStatus } from './smmcost';
import { getJBSMMPanelOrderStatus } from './jbsmmpanel';
import { getWorldOfSMMOrderStatus } from './worldofsmm';
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
 * Map World of SMM status to our status format
 * @param {string} worldofsmmStatus - Status from World of SMM API
 * @returns {string|null} Mapped status or null if unknown
 */
const mapWorldOfSMMStatus = (worldofsmmStatus) => {
  if (!worldofsmmStatus) return null;

  const statusString = String(worldofsmmStatus).trim();
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
 * Map JB SMM Panel status to our status format
 * Handles both numeric codes and string status values
 * @param {string|number} jbsmmpanelStatus - Status from JB SMM Panel API
 * @returns {string|null} Mapped status or null if unknown
 */
const mapJBSMMPanelStatus = (jbsmmpanelStatus) => {
  if (jbsmmpanelStatus === null || jbsmmpanelStatus === undefined) return null;

  // Handle numeric status codes first (common SMM panel format)
  if (typeof jbsmmpanelStatus === 'number') {
    const statusMap = {
      0: 'pending',
      1: 'processing',
      2: 'completed',
      3: 'partial',
      4: 'canceled',
      5: 'refunded'
    };
    if (statusMap.hasOwnProperty(jbsmmpanelStatus)) {
      return statusMap[jbsmmpanelStatus];
    }
    // If not a known numeric code, convert to string and continue
    jbsmmpanelStatus = String(jbsmmpanelStatus);
  }

  const statusString = String(jbsmmpanelStatus).trim();
  if (!statusString) return null;

  const statusLower = statusString.toLowerCase();

  // Exact matches first (most specific)
  if (statusLower === 'pending') return 'pending';
  if (statusLower === 'in progress' || statusLower === 'in-progress' || statusLower === 'inprogress') return 'in progress';
  if (statusLower === 'completed' || statusLower === 'complete') return 'completed';
  if (statusLower === 'partial') return 'partial';
  if (statusLower === 'processing' || statusLower === 'process') return 'processing';
  if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower === 'cancel') return 'canceled';
  if (statusLower === 'refunds' || statusLower === 'refunded' || statusLower === 'refund') return 'refunds';

  // Partial matches (less specific, check after exact matches)
  // Order matters: check longer/more specific phrases first
  if (statusLower.includes('in progress') || statusLower.includes('in-progress')) return 'in progress';
  if (statusLower.includes('completed') || statusLower.includes('complete')) return 'completed';
  if (statusLower.includes('partial')) return 'partial';
  if (statusLower.includes('processing') || statusLower.includes('process')) return 'processing';
  if (statusLower.includes('cancel')) return 'canceled';
  if (statusLower.includes('refund')) return 'refunds';
  if (statusLower.includes('pending')) return 'pending';

  return null;
};

/**
 * Check if an order should be checked for status updates
 * @param {Object} order - Order object
 * @param {number} minIntervalMinutes - Minimum minutes since last check (default: 5)
 * @returns {boolean} True if order should be checked
 */
export const shouldCheckOrder = (order, minIntervalMinutes = 5) => {
  // Check if order has SMMGen, SMMCost, JB SMM Panel, or World of SMM order ID
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
  const hasWorldofsmmId = order.worldofsmm_order_id && String(order.worldofsmm_order_id).toLowerCase() !== "order not placed at worldofsmm";

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
  if (!hasSmmgenId && !hasSmmcostId && !hasJbsmmpanelId && !hasWorldofsmmId) {
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
 * Recursively search for status field in nested objects and arrays
 * @param {*} obj - Object or array to search
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth (default: 3)
 * @returns {*} Status value or null if not found
 */
const findStatusInObject = (obj, depth = 0, maxDepth = 3) => {
  if (!obj || typeof obj !== 'object' || depth > maxDepth) return null;

  // Check common status field names
  if (obj.status !== undefined && obj.status !== null) return obj.status;
  if (obj.Status !== undefined && obj.Status !== null) return obj.Status;
  if (obj.STATUS !== undefined && obj.STATUS !== null) return obj.STATUS;

  // If it's an array, check first element
  if (Array.isArray(obj) && obj.length > 0) {
    return findStatusInObject(obj[0], depth + 1, maxDepth);
  }

  // Recursively search nested objects
  for (const key in obj) {
    if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && obj[key] !== null) {
      const found = findStatusInObject(obj[key], depth + 1, maxDepth);
      if (found !== null) return found;
    }
  }

  return null;
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

  let statusData = null;
  let mappedStatus = null;
  let panelSource = null;

  try {

    // Check if order has SMMGen, SMMCost, JB SMM Panel, or World of SMM order ID
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
    const hasWorldofsmmId = order.worldofsmm_order_id && String(order.worldofsmm_order_id).toLowerCase() !== "order not placed at worldofsmm";

    // Prioritize: WorldOfSMM > SMMCost > JB SMM Panel > SMMGen
    if (hasWorldofsmmId) {
      // Get status from World of SMM
      statusData = await getWorldOfSMMOrderStatus(order.worldofsmm_order_id);
      const worldofsmmStatus = statusData?.status || statusData?.Status;
      mappedStatus = mapWorldOfSMMStatus(worldofsmmStatus);
      panelSource = 'worldofsmm';
    } else if (hasSmmcostId) {
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
        hasStatusData: !!statusData,
        statusDataType: typeof statusData,
        statusDataIsArray: Array.isArray(statusData),
        statusDataKeys: statusData && typeof statusData === 'object' && !Array.isArray(statusData) ? Object.keys(statusData) : null,
        statusDataArrayLength: Array.isArray(statusData) ? statusData.length : null,
        statusDataPreview: statusData ? (typeof statusData === 'object' ? JSON.stringify(statusData, null, 2).substring(0, 300) : String(statusData).substring(0, 300)) : null,
        fullStatusData: statusData // Keep full data for detailed inspection
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
      // First, try direct field access (most common cases)
      let jbsmmpanelStatus =
        statusData?.status ||
        statusData?.Status ||
        statusData?.STATUS ||
        statusData?.order?.status ||
        statusData?.order?.Status ||
        statusData?.data?.status ||
        statusData?.data?.Status ||
        statusData?.result?.status ||
        statusData?.result?.Status ||
        null;

      // Handle array responses (check first element if array)
      if (!jbsmmpanelStatus && Array.isArray(statusData) && statusData.length > 0) {
        jbsmmpanelStatus = statusData[0]?.status ||
          statusData[0]?.Status ||
          statusData[0]?.STATUS ||
          null;
      }

      // Handle nested arrays (e.g., data: [{status: 'pending'}])
      if (!jbsmmpanelStatus && Array.isArray(statusData?.data) && statusData.data.length > 0) {
        jbsmmpanelStatus = statusData.data[0]?.status ||
          statusData.data[0]?.Status ||
          statusData.data[0]?.STATUS ||
          null;
      }

      // If still not found, use recursive search
      if (!jbsmmpanelStatus) {
        jbsmmpanelStatus = findStatusInObject(statusData);
      }

      // Preserve numeric status codes (don't convert to string yet - let mapping function handle it)
      // But ensure we have a value to work with
      if (jbsmmpanelStatus === null || jbsmmpanelStatus === undefined) {
        // Last resort: search for status keywords in stringified response
        const responseString = JSON.stringify(statusData);
        const statusKeywords = ['pending', 'processing', 'completed', 'partial', 'canceled', 'refunded'];
        for (const keyword of statusKeywords) {
          if (responseString.toLowerCase().includes(keyword)) {
            console.warn('[orderStatusCheck] Found status keyword in response string:', {
              orderId: order.id,
              keyword,
              responsePreview: responseString.substring(0, 200)
            });
            // Don't use this as the status - it's too unreliable
            // But log it for debugging
            break;
          }
        }
      }

      // Log detailed extraction information
      console.log('[orderStatusCheck] JB SMM Panel status extraction:', {
        orderId: order.id,
        jbsmmpanelOrderId: jbsmmpanelId,
        rawStatus: jbsmmpanelStatus,
        rawStatusType: typeof jbsmmpanelStatus,
        rawStatusValue: jbsmmpanelStatus,
        isNumeric: typeof jbsmmpanelStatus === 'number',
        isString: typeof jbsmmpanelStatus === 'string',
        statusDataKeys: statusData && typeof statusData === 'object' ? Object.keys(statusData) : null,
        statusDataIsArray: Array.isArray(statusData),
        statusDataArrayLength: Array.isArray(statusData) ? statusData.length : null,
        hasNestedData: !!(statusData?.data),
        nestedDataIsArray: Array.isArray(statusData?.data),
        fullResponseStructure: statusData ? JSON.stringify(statusData, null, 2).substring(0, 500) : null
      });

      // If status is still null, log the full response structure for debugging
      if (jbsmmpanelStatus === null || jbsmmpanelStatus === undefined) {
        console.error('[orderStatusCheck] JB SMM Panel status not found in response. Full response structure:', {
          orderId: order.id,
          jbsmmpanelOrderId: jbsmmpanelId,
          response: statusData,
          responseKeys: statusData && typeof statusData === 'object' ? Object.keys(statusData) : [],
          responseStringified: JSON.stringify(statusData, null, 2),
          responseType: typeof statusData,
          isArray: Array.isArray(statusData)
        });
      }

      // Map the extracted status to our internal format
      mappedStatus = mapJBSMMPanelStatus(jbsmmpanelStatus);

      // Detailed logging for mapping process
      console.log('[orderStatusCheck] JB SMM Panel status mapping:', {
        orderId: order.id,
        jbsmmpanelOrderId: jbsmmpanelId,
        rawStatus: jbsmmpanelStatus,
        rawStatusType: typeof jbsmmpanelStatus,
        rawStatusStringified: jbsmmpanelStatus !== null && jbsmmpanelStatus !== undefined ? String(jbsmmpanelStatus) : null,
        mappedStatus,
        mappingSuccess: mappedStatus !== null,
        currentStatus: order.status,
        statusChanged: mappedStatus !== null && mappedStatus !== order.status,
        willUpdate: mappedStatus && mappedStatus !== order.status && order.status !== 'refunded',
        updateBlocked: order.status === 'refunded' ? 'order is refunded' :
          mappedStatus === null ? 'mapping returned null' :
            mappedStatus === order.status ? 'status unchanged' :
              'unknown reason'
      });

      // Log warning if mapping failed
      if (jbsmmpanelStatus !== null && jbsmmpanelStatus !== undefined && mappedStatus === null) {
        console.warn('[orderStatusCheck] JB SMM Panel status mapping failed - unknown status value:', {
          orderId: order.id,
          jbsmmpanelOrderId: jbsmmpanelId,
          rawStatus: jbsmmpanelStatus,
          rawStatusType: typeof jbsmmpanelStatus,
          suggestion: 'Status value not recognized. May need to add mapping for this status value.'
        });
      }

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
      worldofsmmOrderId: order.worldofsmm_order_id,
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
    onProgress = null,
    useServerSideBulkCheck = false
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
        const hasWorldofsmmId = order.worldofsmm_order_id && String(order.worldofsmm_order_id).toLowerCase() !== "order not placed at worldofsmm";
        const hasValidId = hasSmmgenId || hasSmmcostId || hasJbsmmpanelId || hasWorldofsmmId;
        const isCompleted = order.status === 'completed' || order.status === 'refunded';
        const recentlyChecked = minIntervalMinutes > 0 && order.last_status_check &&
          (new Date() - new Date(order.last_status_check)) / (1000 * 60) < minIntervalMinutes;

        return {
          orderId: order.id,
          hasValidId,
          hasSmmgenId,
          hasSmmcostId,
          hasJbsmmpanelId,
          hasWorldofsmmId,
          jbsmmpanel_order_id: order.jbsmmpanel_order_id,
          worldofsmm_order_id: order.worldofsmm_order_id,
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

  // Use server-side bulk check by default or if requested
  // We prioritize server-side check now for both users and admins
  const shouldUseServerSide = useServerSideBulkCheck || true; // Force true by default for now

  if (shouldUseServerSide && ordersToCheck.length > 0) {
    try {
      console.log(`[orderStatusCheck] Using server-side bulk check to /api/check-orders-status for ${ordersToCheck.length} orders`);

      // Get current session for authentication
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session found. Authentication required.');
      }

      // Batch size for server-side check (matching safety limit on backend)
      const BATCH_SIZE = 50;
      const orderIds = ordersToCheck.map(o => o.id);
      const totalBatches = Math.ceil(orderIds.length / BATCH_SIZE);

      const aggregateResult = {
        checked: 0,
        updated: 0,
        errors: [],
        results: []
      };

      console.log(`[orderStatusCheck] Splitting ${orderIds.length} orders into ${totalBatches} batches of ${BATCH_SIZE}`);

      // Process batches sequentially to avoid overwhelming the server and handle timeouts gracefully
      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const currentBatchIds = orderIds.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        console.log(`[orderStatusCheck] Processing batch ${batchNum}/${totalBatches} (${currentBatchIds.length} orders)`);

        try {
          const response = await fetch('/api/check-orders-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            credentials: 'include',
            body: JSON.stringify({ orderIds: currentBatchIds })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error during batch ${batchNum}: ${response.status}`);
          }

          const serverResult = await response.json();
          console.log(`[orderStatusCheck] Batch ${batchNum} completed:`, serverResult);

          // Aggregate results
          aggregateResult.checked += serverResult.checked || currentBatchIds.length;
          aggregateResult.updated += serverResult.updated || 0;
          if (serverResult.errors) aggregateResult.errors.push(...serverResult.errors);
          if (serverResult.details) aggregateResult.results.push(...serverResult.details);

          // Trigger UI updates for this batch
          if (onStatusUpdate && serverResult.details) {
            serverResult.details.forEach(detail => {
              const resultStatus = detail.new || detail.status;
              if (resultStatus) {
                onStatusUpdate(detail.id, resultStatus, detail.old);
              }
            });
          }

          if (onProgress) {
            onProgress(aggregateResult.checked, ordersToCheck.length);
          }
        } catch (batchErr) {
          console.error(`[orderStatusCheck] Error in batch ${batchNum}:`, batchErr);
          aggregateResult.errors.push({
            batch: batchNum,
            error: batchErr.message,
            orderIds: currentBatchIds
          });
        }
      }

      console.log('[orderStatusCheck] All batches completed. Aggregate Result:', aggregateResult);

      return aggregateResult;
    } catch (err) {
      console.error('[orderStatusCheck] Server-side bulk check failed, falling back to client-side:', err);
      // Continue to client-side orchestration as fallback if server fails
    }
  }

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
    const hasWorldofsmmId = order.worldofsmm_order_id && String(order.worldofsmm_order_id).toLowerCase() !== "order not placed at worldofsmm";
    return !shouldCheckOrder(order, minIntervalMinutes) &&
      (hasSmmgenId || hasSmmcostId || hasJbsmmpanelId || hasWorldofsmmId) &&
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

