/**
 * API Endpoint for Atomic Paystack Deposit Approval
 * 
 * This endpoint uses the approve_deposit_transaction database function to atomically
 * approve a deposit transaction and update user balance, preventing race conditions.
 * 
 * Environment Variables Required:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (for server-side operations)
 * 
 * Request Body:
 * {
 *   "transaction_id": "uuid-of-transaction",
 *   "reference": "paystack-reference" (optional, will be stored if provided),
 *   "paystack_status": "success" (optional, defaults to "success")
 * }
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    // Get Supabase credentials
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials not configured');
      return res.status(500).json({
        error: 'Server configuration error. Please contact support.',
        transaction_id: transaction_id,
        reference: reference || null
      });
    }

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

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
    console.error('Error in approve-paystack-deposit:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
      transaction_id: req.body?.transaction_id || null,
      reference: req.body?.reference || null
    });
  }
}
