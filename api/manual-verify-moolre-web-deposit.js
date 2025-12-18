/**
 * Manual Moolre Web Deposit Verification Endpoint
 * 
 * SECURITY: Requires admin authentication for manual verification.
 * 
 * This endpoint allows admins to manually verify and update Moolre Web deposit statuses.
 * It verifies the payment with Moolre API and updates the transaction status accordingly.
 * 
 * Environment Variables Required:
 * - MOOLRE_API_USER: Your Moolre username
 * - MOOLRE_API_PUBKEY: Your Moolre public API key
 * - MOOLRE_ACCOUNT_NUMBER: Your Moolre account number
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
 * 
 * Usage:
 * POST /api/manual-verify-moolre-web-deposit
 * Headers: Authorization: Bearer <supabase_jwt_token>
 * Body: { transactionId: "uuid" } or { reference: "moolre_reference" }
 */

import { verifyAdmin, getServiceRoleClient } from './utils/auth.js';

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
    // Authenticate admin user
    try {
      await verifyAdmin(req);
    } catch (authError) {
      if (authError.message === 'Missing or invalid authorization header' ||
          authError.message === 'Missing authentication token' ||
          authError.message === 'Invalid or expired token') {
        return res.status(401).json({
          error: 'Authentication required',
          message: authError.message
        });
      }
      
      if (authError.message === 'Admin access required') {
        return res.status(403).json({
          error: 'Admin access required for manual verification'
        });
      }
      
      throw authError;
    }

    const MOOLRE_API_USER = process.env.MOOLRE_API_USER;
    const MOOLRE_API_PUBKEY = process.env.MOOLRE_API_PUBKEY;
    const MOOLRE_ACCOUNT_NUMBER = process.env.MOOLRE_ACCOUNT_NUMBER;
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!MOOLRE_API_USER || !MOOLRE_API_PUBKEY || !MOOLRE_ACCOUNT_NUMBER) {
      return res.status(500).json({ 
        error: 'Moolre credentials not configured' 
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ 
        error: 'Supabase credentials not configured' 
      });
    }

    const { transactionId, reference } = req.body;

    if (!transactionId && !reference) {
      return res.status(400).json({ 
        error: 'Either transactionId or reference is required' 
      });
    }

    // Initialize Supabase client with service role key
    const supabase = getServiceRoleClient();

    // Find transaction
    let transaction = null;
    
    if (transactionId) {
      const { data: txById, error: idError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .eq('type', 'deposit')
        .maybeSingle();

      if (idError) {
        console.error('[MANUAL-VERIFY-MOOLRE-WEB] Error fetching transaction by ID:', idError);
        return res.status(500).json({
          error: 'Failed to fetch transaction',
          details: idError.message
        });
      }

      if (!txById) {
        return res.status(404).json({
          error: 'Transaction not found'
        });
      }

      transaction = txById;
    } else if (reference) {
      const { data: txByRef, error: refError } = await supabase
        .from('transactions')
        .select('*')
        .eq('moolre_reference', reference)
        .eq('type', 'deposit')
        .eq('deposit_method', 'moolre_web')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (refError) {
        console.error('[MANUAL-VERIFY-MOOLRE-WEB] Error fetching transaction by reference:', refError);
        return res.status(500).json({
          error: 'Failed to fetch transaction',
          details: refError.message
        });
      }

      if (!txByRef) {
        return res.status(404).json({
          error: 'Transaction not found for reference'
        });
      }

      transaction = txByRef;
    }

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found'
      });
    }

    // Get Moolre reference
    const moolreReference = transaction.moolre_reference || reference;

    if (!moolreReference) {
      return res.status(400).json({
        error: 'No Moolre reference found for this transaction. Please provide a reference.',
        transactionId: transaction.id
      });
    }

    console.log(`[MANUAL-VERIFY-MOOLRE-WEB] Verifying Moolre Web payment:`, {
      transactionId: transaction.id,
      reference: moolreReference
    });

    // Verify payment with Moolre API
    const moolreResponse = await fetch('https://api.moolre.com/open/transact/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-USER': MOOLRE_API_USER,
        'X-API-PUBKEY': MOOLRE_API_PUBKEY
      },
      body: JSON.stringify({
        type: 1,
        idtype: 1, // 1 = Unique externalref
        id: moolreReference,
        accountnumber: MOOLRE_ACCOUNT_NUMBER
      })
    });

    const moolreData = await moolreResponse.json();

    if (!moolreResponse.ok || moolreData.status === 0) {
      console.error('[MANUAL-VERIFY-MOOLRE-WEB] Moolre verification error:', moolreData);
      return res.status(moolreResponse.status || 500).json({
        success: false,
        error: moolreData.message || 'Failed to verify Moolre payment',
        code: moolreData.code,
        details: moolreData
      });
    }

    // Parse transaction status
    // txstatus: 1=Success, 0=Pending, 2=Failed
    const txstatus = moolreData.data?.txstatus;
    let paymentStatus = 'pending';
    if (txstatus === 1) {
      paymentStatus = 'success';
    } else if (txstatus === 2) {
      paymentStatus = 'failed';
    }

    console.log(`[MANUAL-VERIFY-MOOLRE-WEB] Moolre verification result:`, {
      transactionId: transaction.id,
      reference: moolreReference,
      paymentStatus,
      txstatus
    });

    // Update transaction based on Moolre status
    let updateResult = null;
    let balanceUpdated = false;

    if (paymentStatus === 'success') {
      // Payment was successful - use atomic function to approve transaction and update balance
      if (transaction.status === 'approved') {
        // Already approved, balance should already be updated
        console.log('[MANUAL-VERIFY-MOOLRE-WEB] Transaction already approved, skipping update');
        balanceUpdated = true;
        updateResult = {
          success: true,
          message: 'Transaction already approved',
          oldStatus: transaction.status,
          newStatus: 'approved',
          balanceUpdated: true
        };
      } else {
        // Use atomic function to approve transaction and update balance atomically
        console.log('[MANUAL-VERIFY-MOOLRE-WEB] Using atomic function to approve transaction and update balance');
        const { data: rpcResult, error: rpcError } = await supabase.rpc('approve_deposit_transaction_universal', {
          p_transaction_id: transaction.id,
          p_payment_method: 'moolre_web',
          p_payment_status: 'success',
          p_payment_reference: moolreReference
        });

        if (rpcError) {
          console.error('[MANUAL-VERIFY-MOOLRE-WEB] RPC error:', rpcError);
          throw new Error(`Failed to approve transaction: ${rpcError.message}`);
        }

        const approvalResult = rpcResult && rpcResult.length > 0 ? rpcResult[0] : null;

        if (!approvalResult || !approvalResult.success) {
          throw new Error(approvalResult?.message || 'Transaction approval failed');
        }

        balanceUpdated = true;
        updateResult = {
          success: true,
          message: approvalResult.message,
          oldStatus: approvalResult.old_status,
          newStatus: approvalResult.new_status,
          oldBalance: approvalResult.old_balance,
          newBalance: approvalResult.new_balance,
          balanceUpdated: true
        };
      }
    } else if (paymentStatus === 'failed') {
      // Payment failed - reject transaction
      if (transaction.status !== 'rejected') {
        const { error: updateError } = await supabase
          .from('transactions')
          .update({ 
            status: 'rejected',
            moolre_status: paymentStatus
          })
          .eq('id', transaction.id);

        if (updateError) {
          throw new Error(`Failed to reject transaction: ${updateError.message}`);
        }

        updateResult = {
          success: true,
          message: 'Transaction rejected (payment failed)',
          oldStatus: transaction.status,
          newStatus: 'rejected',
          balanceUpdated: false
        };
      } else {
        updateResult = {
          success: true,
          message: 'Transaction already rejected',
          oldStatus: transaction.status,
          newStatus: 'rejected',
          balanceUpdated: false
        };
      }
    } else {
      // Payment still pending - just update status
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ moolre_status: paymentStatus })
        .eq('id', transaction.id);

      if (updateError) {
        throw new Error(`Failed to update transaction status: ${updateError.message}`);
      }

      updateResult = {
        success: true,
        message: 'Transaction status updated (still pending)',
        oldStatus: transaction.status,
        newStatus: transaction.status,
        balanceUpdated: false
      };
    }

    // Update moolre_reference if it wasn't set
    if (!transaction.moolre_reference && moolreReference) {
      await supabase
        .from('transactions')
        .update({ moolre_reference: moolreReference })
        .eq('id', transaction.id);
    }

    return res.status(200).json({
      success: true,
      reference: moolreReference,
      moolreStatus: paymentStatus,
      txstatus: txstatus,
      updateResult: updateResult,
      data: moolreData.data
    });

  } catch (error) {
    console.error('[MANUAL-VERIFY-MOOLRE-WEB] Error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: error.stack
    });
  }
}
