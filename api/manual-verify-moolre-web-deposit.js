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
 * Body: { transactionId: "uuid" } or { reference: "moolre_id" }
 */

import { verifyAdmin, getServiceRoleClient } from './utils/auth.js';
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
    // Authenticate admin user
    let adminUser;
    try {
      const authResult = await verifyAdmin(req);
      adminUser = authResult.user;
    } catch (authError) {
      // Log failed admin authentication attempt
      await logSecurityEvent({
        action_type: 'manual_verification_failed',
        description: `Failed manual Moolre Web verification attempt: ${authError.message}`,
        metadata: {
          transaction_id: req.body?.transactionId || null,
          reference: req.body?.reference || null,
          error: authError.message
        },
        req
      });
      
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

    // Security: Require moolre_id to be stored in transaction, or if manual reference provided,
    // it must match the transaction's moolre_reference
    if (!transaction.moolre_id && !reference) {
      return res.status(400).json({
        error: 'No Moolre ID found for this transaction. The transaction must have a stored Moolre ID or you must provide a valid Moolre ID.',
        transactionId: transaction.id
      });
    }

    // If transaction has moolre_id stored, ONLY use that (most secure)
    // If not, allow manual reference but we'll validate it strictly
    let moolreId;
    let isManualReference = false;
    
    if (transaction.moolre_id) {
      // Use stored Moolre ID - most secure
      moolreId = transaction.moolre_id;
      // If a reference was also provided, verify it matches
      if (reference && reference !== transaction.moolre_id) {
        return res.status(400).json({
          error: 'The provided Moolre ID does not match the stored Moolre ID for this transaction.',
          transactionId: transaction.id,
          storedMoolreId: transaction.moolre_id,
          providedMoolreId: reference
        });
      }
    } else {
      // Manual reference provided - will validate after API call
      moolreId = reference;
      isManualReference = true;
    }

    console.log(`[MANUAL-VERIFY-MOOLRE-WEB] Verifying Moolre Web payment:`, {
      transactionId: transaction.id,
      moolreId: moolreId
    });

    // Verify payment with Moolre API using Moolre ID
    const moolreResponse = await fetch('https://api.moolre.com/open/transact/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-USER': MOOLRE_API_USER,
        'X-API-PUBKEY': MOOLRE_API_PUBKEY
      },
      body: JSON.stringify({
        type: 1,
        idtype: 2, // 2 = Moolre Generated ID
        id: moolreId,
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

    // Validate that the Moolre transaction matches this deposit
    const moolreAmount = parseFloat(moolreData.data?.amount || 0);
    const transactionAmount = parseFloat(transaction.amount || 0);
    
    // Check amount match (allow small floating point differences)
    if (Math.abs(moolreAmount - transactionAmount) > 0.01) {
      console.error('[MANUAL-VERIFY-MOOLRE-WEB] Amount mismatch:', {
        transactionId: transaction.id,
        expectedAmount: transactionAmount,
        moolreAmount: moolreAmount,
        moolreId: moolreId
      });
      return res.status(400).json({
        success: false,
        error: `Amount mismatch: Expected ₵${transactionAmount.toFixed(2)}, but Moolre transaction shows ₵${moolreAmount.toFixed(2)}`,
        transactionAmount: transactionAmount,
        moolreAmount: moolreAmount,
        moolreId: moolreId
      });
    }

    // Check transaction time (strict: within 15 minutes to prevent matching wrong transactions)
    const moolreTimestamp = moolreData.data?.timestamp || moolreData.data?.created_at || moolreData.data?.date;
    if (moolreTimestamp) {
      const moolreDate = new Date(moolreTimestamp);
      const transactionDate = new Date(transaction.created_at);
      const timeDiffMinutes = Math.abs(moolreDate - transactionDate) / (1000 * 60);
      
      // Strict: Only allow 15 minutes difference to prevent matching wrong transactions
      if (timeDiffMinutes > 15) {
        console.error('[MANUAL-VERIFY-MOOLRE-WEB] Time mismatch:', {
          transactionId: transaction.id,
          transactionTime: transactionDate.toISOString(),
          moolreTime: moolreDate.toISOString(),
          timeDiffMinutes: timeDiffMinutes.toFixed(2),
          moolreId: moolreId
        });
        return res.status(400).json({
          success: false,
          error: `Transaction time mismatch: Moolre transaction time does not match deposit creation time (difference: ${timeDiffMinutes.toFixed(2)} minutes, maximum allowed: 15 minutes)`,
          transactionTime: transactionDate.toISOString(),
          moolreTime: moolreDate.toISOString(),
          timeDiffMinutes: timeDiffMinutes.toFixed(2),
          moolreId: moolreId
        });
      }
    } else {
      // If timestamp is missing from Moolre response, we can't validate time
      // This is a security risk, so we require reference match
      if (!transaction.moolre_reference || !moolreData.data?.externalref) {
        console.error('[MANUAL-VERIFY-MOOLRE-WEB] Cannot validate: Missing timestamp and reference:', {
          transactionId: transaction.id,
          hasTransactionReference: !!transaction.moolre_reference,
          hasMoolreExternalref: !!moolreData.data?.externalref
        });
        return res.status(400).json({
          success: false,
          error: 'Cannot verify: Moolre response is missing timestamp. Reference validation is required but reference is also missing.',
          transactionId: transaction.id,
          moolreId: moolreId
        });
      }
    }

    // CRITICAL: Verify externalref matches transaction's moolre_reference if available
    // This is the primary security check to ensure the Moolre transaction belongs to this deposit
    if (transaction.moolre_reference && moolreData.data?.externalref) {
      // Both references exist - they MUST match
      if (transaction.moolre_reference !== moolreData.data.externalref) {
        console.error('[MANUAL-VERIFY-MOOLRE-WEB] Reference mismatch - security validation failed:', {
          transactionId: transaction.id,
          expectedReference: transaction.moolre_reference,
          moolreReference: moolreData.data.externalref,
          moolreId: moolreId,
          isManualReference: isManualReference
        });
        return res.status(400).json({
          success: false,
          error: 'Security validation failed: The Moolre transaction reference does not match this deposit. This Moolre ID does not belong to this transaction.',
          expectedReference: transaction.moolre_reference,
          moolreReference: moolreData.data.externalref,
          moolreId: moolreId
        });
      }
    } else if (!transaction.moolre_reference && !moolreData.data?.externalref) {
      // Both references missing - rely on amount and strict time validation (15 minutes)
      // This is acceptable if amount matches exactly and time is within 15 minutes
      console.warn('[MANUAL-VERIFY-MOOLRE-WEB] Both transaction and Moolre response missing reference - relying on amount and strict time validation (15 minutes)');
      // Time validation already done above, so if we reach here, time is valid
    } else if (!transaction.moolre_reference && moolreData.data?.externalref) {
      // Transaction missing reference but Moolre has it - store it for future use
      // This is acceptable if amount and time match
      console.log('[MANUAL-VERIFY-MOOLRE-WEB] Transaction missing reference but Moolre has externalref - will store it after validation');
    } else if (transaction.moolre_reference && !moolreData.data?.externalref) {
      // Transaction has reference but Moolre doesn't - this is unusual but acceptable if amount/time match
      console.warn('[MANUAL-VERIFY-MOOLRE-WEB] Transaction has reference but Moolre response missing externalref - relying on amount and time validation');
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
      moolreId: moolreId,
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
          p_payment_reference: moolreId
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

    // Update moolre_id if it wasn't set (from API response)
    const moolreIdFromResponse = moolreData.data?.id;
    if (moolreIdFromResponse && !transaction.moolre_id) {
      await supabase
        .from('transactions')
        .update({ moolre_id: moolreIdFromResponse })
        .eq('id', transaction.id);
    }

    // Also update moolre_reference if available and not set
    const moolreReferenceFromResponse = moolreData.data?.externalref;
    if (moolreReferenceFromResponse && !transaction.moolre_reference) {
      await supabase
        .from('transactions')
        .update({ moolre_reference: moolreReferenceFromResponse })
        .eq('id', transaction.id);
    }

    // Log successful manual verification
    await logAdminAction({
      user_id: adminUser.id,
      action_type: 'deposit_manually_verified',
      entity_type: 'transaction',
      entity_id: transaction.id,
      description: `Manual Moolre Web deposit verification: ${paymentStatus}`,
      metadata: {
        transaction_id: transaction.id,
        moolre_id: moolreId,
        moolre_status: paymentStatus,
        txstatus: txstatus,
        old_status: updateResult?.oldStatus || transaction.status,
        new_status: updateResult?.newStatus || transaction.status,
        amount: transaction.amount,
        deposit_method: 'moolre_web',
        balance_updated: updateResult?.balanceUpdated || false
      },
      req
    });

    return res.status(200).json({
      success: true,
      moolreId: moolreId,
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
