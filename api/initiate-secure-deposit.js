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
import { checkDepositRateLimit } from './utils/depositRateLimit.js';

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
  // Enable CORS
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://boostupgh.com',
    'https://www.boostupgh.com',
    'http://localhost:3000'
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://boostupgh.com');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

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

    // Parse and validate amount with proper precision handling
    const depositAmount = Math.round(parseFloat(amount) * 100) / 100; // Round to 2 decimal places
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

    // Rate limiting check (5 rejected deposits per hour)
    const rateLimit = await checkDepositRateLimit(user.id, req);
    if (rateLimit.blocked) {
      return res.status(429).json({ error: rateLimit.message });
    }

    const supabase = getServiceRoleClient();

    // For moolre_web, generate a placeholder first — the canonical reference needs the transaction ID.
    // We'll update it server-side after insert so we never need a client-side DB write.
    const isPlaceholderRef = method === 'moolre_web';
    const depositReference = isPlaceholderRef
      ? `moolre_web_init_${user.id}_${Date.now()}` // temporary placeholder
      : (reference || `${method}_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

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

    // For moolre_web: now that we have the transaction ID, generate the canonical
    // reference and update it server-side using the service role key.
    // This avoids the client-side RLS UPDATE block that silently fails for non-admin users.
    let finalReference = depositReference;
    if (isPlaceholderRef) {
      finalReference = `MOOLRE_WEB_${transaction.id}_${Date.now()}`;
      const { error: refUpdateError } = await supabase
        .from('transactions')
        .update({ moolre_reference: finalReference })
        .eq('id', transaction.id);

      if (refUpdateError) {
        // This would be a serious error — clean up and fail
        console.error('Failed to set moolre_web reference — rolling back transaction:', refUpdateError);
        await supabase.from('transactions').delete().eq('id', transaction.id);
        return res.status(500).json({
          error: 'Failed to initialize moolre_web reference',
          details: refUpdateError.message
        });
      }
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
        reference: finalReference,
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
        reference: finalReference,
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