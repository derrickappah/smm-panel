/**
 * Secure Deposit Initiation API
 *
 * This endpoint creates deposit transactions server-side with proper validation
 * to prevent users from manipulating deposit amounts.
 *
 * SECURITY FEATURES:
 * - Server-side amount validation
 * - Rate limiting (5 deposits/hour per user)
 * - Transaction creation with validated data
 * - Request logging and monitoring
 *
 * Environment Variables Required:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
 * - SUPABASE_ANON_KEY: Your Supabase anon key
 */

import { verifyAuth, getServiceRoleClient } from './utils/auth.js';
import { logUserAction } from './utils/activityLogger.js';

// Deposit limits by payment method
const DEPOSIT_LIMITS = {
  hubtel: { min: 1, max: 5000 },
  paystack: { min: 1, max: 10000 },
  korapay: { min: 1, max: 50000 },
  moolre: { min: 1, max: 1000 },
  moolre_web: { min: 1, max: 1000 }
};

// Rate limiting: 5 deposits per hour per user
const RATE_LIMIT_DEPOSITS_PER_HOUR = 5;

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
    let user;
    try {
      const authResult = await verifyAuth(req);
      user = authResult.user;
    } catch (authError) {
      return res.status(401).json({
        error: 'Authentication required',
        message: authError.message
      });
    }

    const { amount, method, reference } = req.body;

    // Validate required fields
    if (!amount || !method) {
      return res.status(400).json({
        error: 'Missing required fields: amount and method are required'
      });
    }

    // Validate payment method
    if (!DEPOSIT_LIMITS[method]) {
      return res.status(400).json({
        error: 'Invalid payment method',
        supported_methods: Object.keys(DEPOSIT_LIMITS)
      });
    }

    // Parse and validate amount
    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      return res.status(400).json({
        error: 'Invalid amount: must be a positive number'
      });
    }

    // Check deposit limits
    const limits = DEPOSIT_LIMITS[method];
    if (depositAmount < limits.min) {
      return res.status(400).json({
        error: `Minimum deposit amount for ${method} is ₵${limits.min}`,
        min_amount: limits.min,
        max_amount: limits.max
      });
    }

    if (depositAmount > limits.max) {
      return res.status(400).json({
        error: `Maximum deposit amount for ${method} is ₵${limits.max}`,
        min_amount: limits.min,
        max_amount: limits.max
      });
    }

    // Rate limiting check: Count recent deposits in last hour
    const supabase = getServiceRoleClient();
    const oneHourAgo = new Date(Date.now() - 3600000);
    const { data: recentDeposits, error: rateLimitError } = await supabase
      .from('transactions')
      .select('id, created_at')
      .eq('user_id', user.id)
      .eq('type', 'deposit')
      .gte('created_at', oneHourAgo.toISOString())
      .order('created_at', { ascending: false });

    if (rateLimitError) {
      console.error('Rate limiting check error:', rateLimitError);
      // Continue anyway - don't block legitimate users due to DB errors
    } else if (recentDeposits && recentDeposits.length >= RATE_LIMIT_DEPOSITS_PER_HOUR) {
      return res.status(429).json({
        error: 'Too many deposit attempts. Please try again later.',
        limit: RATE_LIMIT_DEPOSITS_PER_HOUR,
        timeframe: 'per hour',
        retry_after: 3600 // seconds
      });
    }

    // Generate unique reference if not provided
    const depositReference = reference || `${method}_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create transaction record server-side with validated data
    const { data: transaction, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: depositAmount, // Server-validated amount
        type: 'deposit',
        status: 'pending',
        deposit_method: method,
        // Store reference in appropriate column based on method
        ...(method === 'paystack' && { paystack_reference: depositReference }),
        ...(method === 'korapay' && { korapay_reference: depositReference }),
        ...(method === 'moolre' && { moolre_reference: depositReference }),
        ...(method === 'moolre_web' && { moolre_reference: depositReference })
      })
      .select('id, amount, type, status, deposit_method, created_at')
      .single();

    if (insertError) {
      console.error('Error creating deposit transaction:', insertError);
      return res.status(500).json({
        error: 'Failed to create deposit transaction',
        details: insertError.message
      });
    }

    // Log the secure deposit initiation
    await logUserAction({
      user_id: user.id,
      action_type: 'secure_deposit_initiated',
      entity_type: 'transaction',
      entity_id: transaction.id,
      description: `Secure deposit initiated: ₵${depositAmount} via ${method}`,
      metadata: {
        amount: depositAmount,
        method: method,
        reference: depositReference,
        transaction_id: transaction.id,
        validated_server_side: true,
        rate_limit_check_passed: true
      },
      req
    });

    // Return success with transaction details
    return res.status(200).json({
      success: true,
      message: 'Deposit transaction created securely',
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        method: transaction.deposit_method,
        status: transaction.status,
        reference: depositReference,
        created_at: transaction.created_at
      },
      limits: {
        min: limits.min,
        max: limits.max
      }
    });

  } catch (error) {
    console.error('Error in secure deposit initiation:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}