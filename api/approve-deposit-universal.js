import { createClient } from '@supabase/supabase-js';
import { verifyTransactionOwner } from './utils/auth.js';
import { logAdminAction, logSecurityEvent } from './utils/activityLogger.js';

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
    const { transaction_id, payment_method, payment_status, payment_reference } = req.body;

    // Validate transaction_id first before authentication
    if (!transaction_id) {
      return res.status(400).json({
        error: 'Missing required field: transaction_id',
        transaction_id: null,
        payment_method: payment_method || null,
        payment_reference: payment_reference || null
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(transaction_id)) {
      return res.status(400).json({
        error: 'Invalid transaction_id format. Must be a valid UUID.',
        transaction_id: transaction_id,
        payment_method: payment_method || null,
        payment_reference: payment_reference || null
      });
    }

    // Authenticate user and verify transaction ownership (users can approve their own, admins can approve any)
    let transaction;
    let isAdmin;
    let user;
    try {
      const authResult = await verifyTransactionOwner(req, transaction_id);
      transaction = authResult.transaction;
      isAdmin = authResult.isAdmin;
      user = authResult.user;
    } catch (authError) {
      // Log failed authentication attempt
      await logSecurityEvent({
        action_type: 'deposit_approval_failed',
        description: `Failed deposit approval attempt: ${authError.message}`,
        metadata: {
          transaction_id,
          payment_method: payment_method || null,
          error: authError.message
        },
        req
      });
      
      // Handle authentication errors
      if (authError.message === 'Missing or invalid authorization header' ||
        authError.message === 'Missing authentication token' ||
        authError.message === 'Invalid or expired token') {
        return res.status(401).json({
          error: 'Authentication required',
          message: authError.message
        });
      }
      
      // Handle authorization errors
      if (authError.message.includes('Access denied') || 
          authError.message === 'Transaction not found') {
        return res.status(403).json({
          error: authError.message,
          transaction_id: transaction_id
        });
      }
      
      throw authError;
    }

    // Additional check: Only allow approval of pending deposits
    if (transaction.type !== 'deposit') {
      return res.status(400).json({
        error: 'Transaction is not a deposit',
        transaction_id: transaction_id,
        payment_method: payment_method || null,
        payment_reference: payment_reference || null
      });
    }

    // Only allow users to approve their own pending deposits (admins can approve any)
    if (!isAdmin && transaction.status !== 'pending') {
      return res.status(400).json({
        error: 'Can only approve pending deposits',
        current_status: transaction.status,
        transaction_id: transaction_id,
        payment_method: payment_method || null,
        payment_reference: payment_reference || null
      });
    }

    // Validate payment method
    const validPaymentMethods = ['paystack', 'korapay', 'moolre', 'moolre_web'];
    const method = payment_method || 'paystack';
    if (!validPaymentMethods.includes(method)) {
      return res.status(400).json({
        error: `Invalid payment_method. Must be one of: ${validPaymentMethods.join(', ')}`,
        transaction_id: transaction_id,
        payment_method: payment_method,
        payment_reference: payment_reference || null
      });
    }

    // Get Supabase credentials
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials not configured');
      return res.status(500).json({
        error: 'Server configuration error. Please contact support.',
        transaction_id: transaction_id,
        payment_method: method,
        payment_reference: payment_reference || null
      });
    }

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Call the universal atomic database function
    const status = payment_status || 'success';
    const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction_universal', {
      p_transaction_id: transaction_id,
      p_payment_method: method,
      p_payment_status: status,
      p_payment_reference: payment_reference || null
    });

    if (rpcError) {
      console.error('Database function error:', rpcError);
      return res.status(500).json({
        error: 'Failed to approve transaction',
        details: rpcError.message || rpcError.code,
        transaction_id: transaction_id,
        payment_method: method,
        payment_reference: payment_reference || null
      });
    }

    // The function returns an array with one row
    const approvalResult = result && result.length > 0 ? result[0] : null;

    if (!approvalResult) {
      return res.status(500).json({
        error: 'Database function returned no result',
        transaction_id: transaction_id,
        payment_method: method,
        payment_reference: payment_reference || null
      });
    }

    // Check if approval was successful
    if (!approvalResult.success) {
      return res.status(400).json({
        error: approvalResult.message || 'Transaction approval failed',
        success: false,
        message: approvalResult.message,
        old_status: approvalResult.old_status,
        new_status: approvalResult.new_status,
        transaction_id: transaction_id,
        payment_method: method,
        payment_reference: payment_reference || null
      });
    }

    // Log successful deposit approval
    await logAdminAction({
      user_id: user.id,
      action_type: isAdmin ? 'deposit_approved_admin' : 'deposit_approved_user',
      entity_type: 'transaction',
      entity_id: transaction_id,
      description: `Deposit ${approvalResult.new_status === 'approved' ? 'approved' : 'updated'} via ${method}`,
      metadata: {
        transaction_id,
        payment_method: method,
        payment_status: status,
        payment_reference: payment_reference || null,
        old_status: approvalResult.old_status,
        new_status: approvalResult.new_status,
        old_balance: approvalResult.old_balance,
        new_balance: approvalResult.new_balance,
        amount: transaction.amount,
        is_admin: isAdmin
      },
      req
    });

    // Success
    return res.status(200).json({
      success: true,
      message: approvalResult.message,
      old_status: approvalResult.old_status,
      new_status: approvalResult.new_status,
      old_balance: approvalResult.old_balance,
      new_balance: approvalResult.new_balance,
      transaction_id: transaction_id,
      payment_method: method,
      payment_reference: payment_reference || null
    });

  } catch (error) {
    console.error('Error in approve-deposit-universal:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
      transaction_id: req.body?.transaction_id || null,
      payment_method: req.body?.payment_method || null,
      payment_reference: req.body?.payment_reference || null
    });
  }
}

