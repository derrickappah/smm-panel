/**
 * API Endpoint for Atomic Paystack Deposit Approval
 * 
 * This endpoint uses the approve_deposit_transaction database function to atomically
 * approve a deposit transaction and update user balance, preventing race conditions.
 * 
 * SECURITY: Requires authentication. Users can only approve their own pending deposits,
 * or admins can approve any deposit.
 * 
 * Environment Variables Required:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (for server-side operations)
 * - SUPABASE_ANON_KEY: Your Supabase anon key (for JWT verification)
 * 
 * Request Body:
 * {
 *   "transaction_id": "uuid-of-transaction",
 *   "reference": "paystack-reference" (optional, will be stored if provided),
 *   "paystack_status": "success" (optional, defaults to "success")
 * }
 * 
 * Headers:
 * - Authorization: Bearer <supabase_jwt_token>
 */

import { verifyTransactionOwner, getServiceRoleClient } from './utils/auth.js';

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
    const { transaction_id, reference, paystack_status } = req.body;

    // Validate required fields
    if (!transaction_id) {
      return res.status(400).json({
        error: 'Missing required field: transaction_id',
        transaction_id: null,
        reference: reference || null
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(transaction_id)) {
      return res.status(400).json({
        error: 'Invalid transaction_id format. Must be a valid UUID.',
        transaction_id: transaction_id,
        reference: reference || null
      });
    }

    // Authenticate user and verify transaction ownership (or admin)
    let transaction;
    let isAdmin = false;
    try {
      const authResult = await verifyTransactionOwner(req, transaction_id);
      transaction = authResult.transaction;
      isAdmin = authResult.isAdmin;
    } catch (authError) {
      // Handle authentication errors
      if (authError.message === 'Missing or invalid authorization header' ||
        authError.message === 'Missing authentication token' ||
        authError.message === 'Invalid or expired token') {
        return res.status(401).json({
          error: 'Authentication required',
          message: authError.message,
          transaction_id: transaction_id,
          reference: reference || null
        });
      }

      // Handle authorization errors
      if (authError.message.includes('Access denied') ||
        authError.message === 'Transaction not found') {
        return res.status(403).json({
          error: authError.message,
          transaction_id: transaction_id,
          reference: reference || null
        });
      }

      throw authError;
    }

    // Additional check: Only allow approval of pending deposits
    if (transaction.type !== 'deposit') {
      return res.status(400).json({
        error: 'Transaction is not a deposit',
        transaction_id: transaction_id,
        reference: reference || null
      });
    }

    // Only allow users to approve their own pending deposits (admins can approve any)
    if (!isAdmin && transaction.status !== 'pending') {
      return res.status(400).json({
        error: 'Can only approve pending deposits',
        current_status: transaction.status,
        transaction_id: transaction_id,
        reference: reference || null
      });
    }

    // Get service role client for RPC call
    const supabase = getServiceRoleClient();

    // Verify the payment if the caller is not an admin
    if (!isAdmin) {
      const activeRef = reference || transaction.paystack_reference;
      if (!activeRef) {
        return res.status(400).json({
          error: 'Missing payment reference. Verification is required.',
          transaction_id: transaction_id,
          reference: null
        });
      }

      const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
      if (!PAYSTACK_SECRET_KEY) {
        return res.status(500).json({
          error: 'Paystack integration is misconfigured: missing API key.',
          transaction_id: transaction_id,
          reference: activeRef
        });
      }

      try {
        // Fetch payment verification from Paystack API
        const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${activeRef}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (!verifyRes.ok) {
          const errBody = await verifyRes.json().catch(() => ({}));
          return res.status(400).json({
            error: 'Failed to verify transaction with Paystack.',
            message: errBody.message || 'Verification endpoint returned an error.',
            transaction_id: transaction_id,
            reference: activeRef
          });
        }

        const paystackData = await verifyRes.json();
        const isSuccessful = paystackData.status && paystackData.data && paystackData.data.status === 'success';
        const gatewayAmount = paystackData.data?.amount ? paystackData.data.amount / 100 : null;

        if (!isSuccessful) {
          return res.status(400).json({
            error: 'Paystack payment is not successful',
            paystack_status: paystackData.data?.status || 'failed',
            transaction_id: transaction_id,
            reference: activeRef
          });
        }

        // Validate amount
        const expectedAmount = parseFloat(transaction.amount || 0);
        const tolerance = 0.01;
        if (!gatewayAmount || Math.abs(gatewayAmount - expectedAmount) > tolerance) {
          console.error(`SECURITY WARNING: Amount mismatch in deposit approval for ${transaction_id}. Paid: ${gatewayAmount}, Expected: ${expectedAmount}`);
          return res.status(400).json({
            error: 'Payment verification failed: Amount mismatch.',
            transaction_id: transaction_id,
            reference: activeRef
          });
        }

        // Prevent duplicate reference replay
        const { data: dupCheck, error: dupCheckError } = await supabase
          .from('transactions')
          .select('id')
          .eq('paystack_reference', activeRef)
          .neq('id', transaction_id)
          .maybeSingle();

        if (dupCheck) {
          return res.status(400).json({
            error: 'Security block: This payment reference has already been credited to another transaction.',
            transaction_id: transaction_id,
            reference: activeRef
          });
        }

      } catch (verifyError) {
        console.error('Error during Paystack verification request:', verifyError);
        return res.status(500).json({
          error: 'Internal error during payment verification: ' + verifyError.message,
          transaction_id: transaction_id,
          reference: activeRef
        });
      }
    }

    // First, ensure reference is stored if provided
    if (reference) {
      try {
        const { error: refError } = await supabase
          .from('transactions')
          .update({ paystack_reference: reference })
          .eq('id', transaction_id);

        if (refError && refError.code !== 'PGRST116') {
          // PGRST116 means no rows found, which is okay - we'll handle it in the function
          console.warn('Warning: Could not store reference before approval:', refError);
        } else {
          console.log('Reference stored successfully:', reference);
        }
      } catch (refStoreError) {
        console.warn('Warning: Error storing reference:', refStoreError);
        // Continue anyway - the database function will try to store it
      }
    }

    // Call the atomic database function
    const status = paystack_status || 'success';
    const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction', {
      p_transaction_id: transaction_id,
      p_paystack_status: status,
      p_paystack_reference: reference || null
    });

    if (rpcError) {
      console.error('Database function error:', rpcError);
      return res.status(500).json({
        error: 'Failed to approve transaction',
        details: rpcError.message || rpcError.code,
        transaction_id: transaction_id,
        reference: reference || null
      });
    }

    // The function returns an array with one row
    const approvalResult = result && result.length > 0 ? result[0] : null;

    if (!approvalResult) {
      return res.status(500).json({
        error: 'Database function returned no result',
        transaction_id: transaction_id,
        reference: reference || null
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
        reference: reference || null
      });
    }

    // Success
    return res.status(200).json({
      success: true,
      message: approvalResult.message,
      old_status: approvalResult.old_status,
      new_status: approvalResult.new_status,
      old_balance: approvalResult.old_balance,
      new_balance: approvalResult.new_balance,
      transaction_id: transaction_id,
      reference: reference || null
    });

  } catch (error) {
    // Handle authentication/authorization errors that weren't caught earlier
    if (error.message === 'Missing or invalid authorization header' ||
      error.message === 'Missing authentication token' ||
      error.message === 'Invalid or expired token') {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        transaction_id: req.body?.transaction_id || null,
        reference: req.body?.reference || null
      });
    }

    if (error.message.includes('Access denied') ||
      error.message === 'Transaction not found') {
      return res.status(403).json({
        error: error.message,
        transaction_id: req.body?.transaction_id || null,
        reference: req.body?.reference || null
      });
    }

    console.error('Error in approve-paystack-deposit:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
      transaction_id: req.body?.transaction_id || null,
      reference: req.body?.reference || null
    });
  }
}
