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
    const { service_id, package_id, link, quantity, total_cost, smmgen_order_id } = req.body;

    // Validate required fields
    if (!link || typeof link !== 'string' || link.trim() === '') {
      return res.status(400).json({
        error: 'Missing or invalid required field: link'
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

    // Call the atomic database function to place order and deduct balance
    const { data: result, error: rpcError } = await supabase.rpc('place_order_with_balance_deduction', {
      p_user_id: user.id,
      p_service_id: service_id || null,
      p_package_id: package_id || null,
      p_link: link.trim(),
      p_quantity: quantityNum,
      p_total_cost: totalCostNum,
      p_smmgen_order_id: smmgen_order_id || null
    });

    if (rpcError) {
      console.error('Database function error:', rpcError);
      return res.status(500).json({
        error: 'Failed to place order',
        details: rpcError.message || rpcError.code
      });
    }

    // The function returns an array with one row
    const orderResult = result && result.length > 0 ? result[0] : null;

    if (!orderResult) {
      return res.status(500).json({
        error: 'Database function returned no result'
      });
    }

    // Check if order placement was successful
    if (!orderResult.success) {
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

    // Log full error for debugging
    console.error('Error in place-order:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
