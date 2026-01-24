/**
 * Secure Order Placement API Endpoint
 * 
 * This endpoint handles order placement server-side with proper authentication
 * and uses atomic database operations to prevent race conditions.
 * 
 * Environment Variables Required:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (for server-side operations)
 * - SUPABASE_ANON_KEY: Your Supabase anon key (for JWT verification)
 * 
 * Request Body:
 * {
 *   "service_id": "uuid" (optional, for regular orders),
 *   "package_id": "uuid" (optional, for package orders),
 *   "link": "target-url",
 *   "quantity": 1000,
 *   "total_cost": 10.50,
 *   "smmgen_order_id": "order-id" (optional)
 * }
 * 
 * Headers:
 * - Authorization: Bearer <supabase_jwt_token>
 */

import { verifyAuth, getServiceRoleClient } from './utils/auth.js';
import { logUserAction } from './utils/activityLogger.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const { user, supabase: userSupabase } = await verifyAuth(req);

    // Get request body
    const { service_id, package_id, link, quantity, total_cost, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id } = req.body;

    // Validate required fields
    if (!link || typeof link !== 'string' || link.trim() === '') {
      return res.status(400).json({
        error: 'Missing or invalid required field: link'
      });
    }

    // URL Validation (Defensive)
    const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
    if (!urlPattern.test(link)) {
      return res.status(400).json({
        error: 'Invalid URL format'
      });
    }

    if (quantity === undefined || quantity === null) {
      return res.status(400).json({
        error: 'Missing required field: quantity'
      });
    }

    const quantityNum = Number(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0 || !Number.isInteger(quantityNum)) {
      return res.status(400).json({
        error: 'Invalid quantity: must be a positive integer'
      });
    }

    if (total_cost === undefined || total_cost === null) {
      return res.status(400).json({
        error: 'Missing required field: total_cost'
      });
    }

    const totalCostNum = Number(total_cost);
    if (isNaN(totalCostNum) || totalCostNum <= 0) {
      return res.status(400).json({
        error: 'Invalid total_cost: must be a positive number'
      });
    }

    // Validate that either service_id or package_id is provided
    if (!service_id && !package_id) {
      return res.status(400).json({
        error: 'Either service_id or package_id must be provided'
      });
    }

    // Validate UUID format if provided
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (service_id && !uuidRegex.test(service_id)) {
      return res.status(400).json({
        error: 'Invalid service_id format. Must be a valid UUID.'
      });
    }

    if (package_id && !uuidRegex.test(package_id)) {
      return res.status(400).json({
        error: 'Invalid package_id format. Must be a valid UUID.'
      });
    }

    // Get service role client for RPC call
    const supabase = getServiceRoleClient();

    // Ensure smmgen_order_id is a string (database expects TEXT)
    const smmgenOrderIdString = smmgen_order_id
      ? String(smmgen_order_id)
      : null;

    // Ensure smmcost_order_id is a string (recommended: TEXT column, like smmgen_order_id)
    // This allows storing numeric IDs *or* a failure message like "order not placed at smmcost".
    const smmcostOrderIdString = smmcost_order_id !== undefined && smmcost_order_id !== null
      ? String(smmcost_order_id)
      : null;

    // Ensure jbsmmpanel_order_id is converted to integer (database expects INTEGER)
    // For INTEGER columns, we store NULL for failures (can't store failure message strings like TEXT columns)
    let jbsmmpanelOrderIdInt = null;
    if (jbsmmpanel_order_id !== undefined && jbsmmpanel_order_id !== null) {
      // Skip failure messages (strings containing "not placed")
      if (typeof jbsmmpanel_order_id === 'string' && jbsmmpanel_order_id.toLowerCase().includes('not placed')) {
        jbsmmpanelOrderIdInt = null; // Store NULL for failures (INTEGER column can't store strings)
      } else if (typeof jbsmmpanel_order_id === 'number') {
        jbsmmpanelOrderIdInt = jbsmmpanel_order_id;
      } else if (typeof jbsmmpanel_order_id === 'string') {
        const parsed = parseInt(jbsmmpanel_order_id, 10);
        if (!isNaN(parsed) && parsed > 0) {
          jbsmmpanelOrderIdInt = parsed;
        }
      }
    }

    // Log what we received and converted
    console.log('API received order IDs:', {
      smmcost_order_id: {
        original: smmcost_order_id,
        originalType: typeof smmcost_order_id,
        converted: smmcostOrderIdString,
        convertedType: typeof smmcostOrderIdString
      },
      jbsmmpanel_order_id: {
        original: jbsmmpanel_order_id,
        originalType: typeof jbsmmpanel_order_id,
        converted: jbsmmpanelOrderIdInt,
        convertedType: typeof jbsmmpanelOrderIdInt
      }
    });

    // 1b. Rate Limit Check (Defensive)
    const { count: recentOrderCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 60000).toISOString());

    if (recentOrderCount > 10) {
      await supabase.rpc('log_system_event', {
        p_type: 'rate_limit_exceeded',
        p_severity: 'warning',
        p_source: 'place-order',
        p_description: `User ${user.id} exceeded order rate limit (${recentOrderCount} in last min)`,
        p_metadata: { user_id: user.id, count: recentOrderCount }
      });
      return res.status(429).json({ error: 'Too many orders. Please wait a minute.' });
    }

    // Idempotency check: Check if an order with the same parameters already exists
    // This prevents duplicate orders even if frontend checks are bypassed
    const duplicateCheckQuery = supabase
      .from('orders')
      .select('id, smmgen_order_id, created_at')
      .eq('user_id', user.id)
      .eq('link', link.trim())
      .eq('quantity', quantityNum)
      .gte('created_at', new Date(Date.now() - 60000).toISOString()); // Last 60 seconds

    if (service_id) {
      duplicateCheckQuery.eq('service_id', service_id);
    } else if (package_id) {
      duplicateCheckQuery.eq('promotion_package_id', package_id);
    }

    const { data: existingOrders, error: duplicateCheckError } = await duplicateCheckQuery
      .order('created_at', { ascending: false })
      .limit(1);

    if (duplicateCheckError) {
      console.warn('Error checking for duplicate orders:', duplicateCheckError);
      // Continue with order placement if check fails
    } else if (existingOrders && existingOrders.length > 0) {
      const existingOrder = existingOrders[0];
      const existingSmmgenId = existingOrder.smmgen_order_id;

      // If order exists and has a valid SMMGen ID, return it
      if (existingSmmgenId && existingSmmgenId !== "order not placed at smm gen") {
        console.log('Duplicate order detected at API level - returning existing order:', {
          order_id: existingOrder.id,
          smmgen_order_id: existingSmmgenId,
          user_id: user.id,
          link: link.trim(),
          quantity: quantityNum
        });

        // Log duplicate attempt
        await logUserAction({
          user_id: user.id,
          action_type: 'duplicate_order_prevented',
          entity_type: 'order',
          entity_id: existingOrder.id,
          description: `Duplicate order prevented: Order with same parameters already exists`,
          metadata: {
            existing_order_id: existingOrder.id,
            existing_smmgen_order_id: existingSmmgenId,
            service_id: service_id || null,
            package_id: package_id || null,
            link: link.trim(),
            quantity: quantityNum,
            total_cost: totalCostNum
          },
          req
        });

        return res.status(409).json({
          error: 'Duplicate order detected',
          message: 'An order with the same parameters was recently placed. Please check your order history.',
          success: false,
          existing_order_id: existingOrder.id,
          existing_smmgen_order_id: existingSmmgenId
        });
      }

      // If order exists but SMMGen order failed, log it but allow retry
      console.warn('Duplicate order detected but SMMGen order failed previously. Allowing retry:', {
        order_id: existingOrder.id,
        user_id: user.id,
        link: link.trim(),
        quantity: quantityNum
      });
    }

    // Log the parameters being sent to the database function
    console.log('Calling place_order_with_balance_deduction with:', {
      p_user_id: user.id,
      p_link: link.trim(),
      p_quantity: quantityNum,
      p_total_cost: totalCostNum,
      p_service_id: service_id || null,
      p_package_id: package_id || null,
      p_smmgen_order_id: smmgenOrderIdString,
      p_smmcost_order_id: smmcostOrderIdString,
      p_jbsmmpanel_order_id: jbsmmpanelOrderIdInt,
      smmgen_order_id_type: typeof smmgenOrderIdString,
      smmcost_order_id_type: typeof smmcostOrderIdString,
      jbsmmpanel_order_id_type: typeof jbsmmpanelOrderIdInt
    });

    // Call the atomic database function to place order and deduct balance
    // Note: Parameters are ordered with required params first, then optional params with defaults
    const { data: result, error: rpcError } = await supabase.rpc('place_order_with_balance_deduction', {
      p_user_id: user.id,
      p_link: link.trim(),
      p_quantity: quantityNum,
      p_total_cost: totalCostNum,
      p_service_id: service_id || null,
      p_package_id: package_id || null,
      p_smmgen_order_id: smmgenOrderIdString,
      p_smmcost_order_id: smmcostOrderIdString,
      p_jbsmmpanel_order_id: jbsmmpanelOrderIdInt
    });

    if (rpcError) {
      console.error('Database function error:', {
        error: rpcError,
        message: rpcError.message,
        code: rpcError.code,
        details: rpcError.details,
        hint: rpcError.hint,
        body: req.body,
        functionParams: {
          p_user_id: user.id,
          p_link: link.trim(),
          p_quantity: quantityNum,
          p_total_cost: totalCostNum,
          p_service_id: service_id || null,
          p_package_id: package_id || null,
          p_smmgen_order_id: smmgenOrderIdString,
          p_smmcost_order_id: smmcostOrderIdString,
          p_jbsmmpanel_order_id: jbsmmpanelOrderIdInt
        }
      });
      return res.status(500).json({
        error: 'Failed to place order',
        details: rpcError.message || rpcError.code || 'Unknown database error',
        hint: rpcError.hint || 'Check if place_order_with_balance_deduction includes p_jbsmmpanel_order_id parameter (INTEGER)'
      });
    }

    // The function returns an array with one row
    const orderResult = result && result.length > 0 ? result[0] : null;

    if (!orderResult) {
      console.error('Database function returned no result:', {
        result,
        resultLength: result?.length,
        body: req.body
      });
      return res.status(500).json({
        error: 'Database function returned no result',
        details: 'The order placement function did not return a result'
      });
    }

    // Check if order placement was successful
    if (!orderResult.success) {
      // Log failed order placement
      await logUserAction({
        user_id: user.id,
        action_type: 'order_placement_failed',
        description: `Order placement failed: ${orderResult.message || 'Unknown error'}`,
        metadata: {
          service_id: service_id || null,
          package_id: package_id || null,
          link: link.trim(),
          quantity: quantityNum,
          total_cost: totalCostNum,
          error: orderResult.message
        },
        req
      });

      return res.status(400).json({
        error: orderResult.message || 'Order placement failed',
        success: false,
        message: orderResult.message
      });
    }

    // Get the created order details
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderResult.order_id)
      .single();

    if (orderError) {
      console.warn('Failed to fetch order details:', orderError);
      // Order was created but we can't fetch details - still return success
    }

    // Log successful order placement
    await logUserAction({
      user_id: user.id,
      action_type: 'order_placed',
      entity_type: 'order',
      entity_id: orderResult.order_id,
      description: `Order placed: ${quantityNum} items for ${totalCostNum}`,
      metadata: {
        order_id: orderResult.order_id,
        service_id: service_id || null,
        package_id: package_id || null,
        link: link.trim(),
        quantity: quantityNum,
        total_cost: totalCostNum,
        old_balance: orderResult.old_balance,
        new_balance: orderResult.new_balance,
        smmgen_order_id: smmgenOrderIdString
      },
      req
    });

    // Success
    return res.status(200).json({
      success: true,
      message: orderResult.message,
      order: orderData || { id: orderResult.order_id },
      order_id: orderResult.order_id,
      old_balance: orderResult.old_balance,
      new_balance: orderResult.new_balance
    });

  } catch (error) {
    // Handle authentication errors
    if (error.message === 'Missing or invalid authorization header' ||
      error.message === 'Missing authentication token' ||
      error.message === 'Invalid or expired token') {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }

    console.error('Error in place-order:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
