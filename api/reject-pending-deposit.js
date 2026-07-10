/**
 * Secure Endpoint to Reject Pending Deposits
 * 
 * This endpoint allows the frontend to securely mark a deposit transaction
 * as rejected if the payment verification times out. It verifies the transaction
 * belongs to the user and ensures it's actually in a pending state before
 * updating using the service role.
 * 
 * This resolves RLS violations that happen when the frontend tries to update
 * the transactions table directly.
 */

import { verifyAuth, getServiceRoleClient } from './utils/auth.js';
import { logSecurityEvent } from './utils/activityLogger.js';

export default async function handler(req, res) {
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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

    const { transactionId, reason } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transactionId parameter' });
    }

    // Initialize Service Role Client for secure update
    const serviceClient = getServiceRoleClient();

    // Verify transaction exists and is pending
    const { data: transaction, error: fetchError } = await serviceClient
      .from('transactions')
      .select('id, user_id, status, created_at, type')
      .eq('id', transactionId)
      .single();

    if (fetchError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Ensure user owns the transaction
    if (transaction.user_id !== user.id) {
      await logSecurityEvent({
        action_type: 'unauthorized_reject_attempt',
        description: `User attempted to reject transaction belonging to someone else`,
        metadata: {
          transaction_id: transactionId,
          acting_user_id: user.id,
          actual_user_id: transaction.user_id
        },
        req
      });
      return res.status(403).json({ error: 'Not authorized to reject this transaction' });
    }

    // Only reject if it's currently pending
    if (transaction.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Transaction is not in a pending state',
        status: transaction.status
      });
    }

    // Update using service client to bypass RLS violations safely
    const { error: updateError } = await serviceClient
      .from('transactions')
      .update({
        status: 'rejected'
      })
      .eq('id', transactionId)
      .eq('status', 'pending'); // Final guard clause

    if (updateError) {
      console.error('Error securely rejecting transaction:', updateError);
      return res.status(500).json({ error: 'Failed to update transaction status safely' });
    }

    // Log the event
    await serviceClient.rpc('log_system_event', {
      p_type: 'deposit_timeout_rejected',
      p_severity: 'info',
      p_source: 'api/reject-pending-deposit',
      p_description: `Deposit ${transactionId} rejected due to timeout. Reason: ${reason || 'Unknown'}`,
      p_metadata: {
        transaction_id: transactionId,
        user_id: user.id,
        reason: reason || 'timeout'
      },
      p_entity_type: 'transaction',
      p_entity_id: transactionId
    }).catch(e => console.warn('Failed to log deposit_timeout_rejected event', e));

    return res.status(200).json({
      success: true,
      message: 'Transaction successfully marked as rejected'
    });

  } catch (error) {
    console.error('Error securely rejecting pending deposit:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
