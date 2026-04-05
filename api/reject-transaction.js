/**
 * Reject Transaction API
 *
 * Server-side endpoint to mark a pending deposit transaction as rejected.
 * This replaces the client-side supabase.from('transactions').update({ status: 'rejected' })
 * call in PaymentCallback.jsx, removing the need for any client-side write access to transactions.
 *
 * SECURITY:
 * - Requires valid user JWT (checks ownership)
 * - Only the transaction owner can reject their own transaction
 * - Only 'pending' deposit transactions can be rejected (not approved ones)
 * - Uses service_role key server-side — no client write access to transactions needed
 */

import { verifyAuth, getServiceRoleClient } from './utils/auth.js';
import { logUserAction } from './utils/activityLogger.js';

export default async function handler(req, res) {
  // CORS
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

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Authenticate caller
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

    const { transaction_id, payment_method } = req.body;

    // 2. Validate input
    if (!transaction_id) {
      return res.status(400).json({ error: 'Missing required field: transaction_id' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(transaction_id)) {
      return res.status(400).json({ error: 'Invalid transaction_id format. Must be a valid UUID.' });
    }

    const supabase = getServiceRoleClient();

    // 3. Fetch the transaction — verify ownership and eligibility
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('id, user_id, type, status, deposit_method, amount')
      .eq('id', transaction_id)
      .single();

    if (fetchError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // 4. Ownership check — user can only reject their own transaction; admins can reject any
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = callerProfile?.role === 'admin';

    if (!isAdmin && transaction.user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied: this transaction does not belong to you' });
    }

    // 5. Type check — only deposit transactions can be rejected via this endpoint
    if (transaction.type !== 'deposit') {
      return res.status(400).json({
        error: 'Only deposit transactions can be rejected via this endpoint',
        type: transaction.type
      });
    }

    // 6. Status check — only pending transactions can be rejected
    // Guard against marking an already-approved transaction as rejected (balance protection)
    if (transaction.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot reject a transaction with status '${transaction.status}'. Only 'pending' transactions can be rejected.`,
        current_status: transaction.status
      });
    }

    // 7. Build payment-method-specific update payload
    const updatePayload = { status: 'rejected' };
    if (payment_method === 'korapay') {
      updatePayload.korapay_status = 'failed';
    } else if (payment_method === 'moolre' || payment_method === 'moolre_web') {
      updatePayload.moolre_status = 'failed';
    } else if (payment_method === 'paystack') {
      updatePayload.paystack_status = 'failed';
    }

    // 8. Perform the update using service_role (bypasses RLS safely)
    const { error: updateError } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', transaction_id)
      .eq('status', 'pending'); // Double-guard against race conditions

    if (updateError) {
      console.error('Error rejecting transaction:', updateError);
      return res.status(500).json({
        error: 'Failed to reject transaction',
        details: updateError.message
      });
    }

    // 9. Log the rejection
    await logUserAction({
      user_id: user.id,
      action_type: isAdmin ? 'admin_deposit_rejected' : 'deposit_rejected_by_callback',
      entity_type: 'transaction',
      entity_id: transaction_id,
      description: isAdmin
        ? `Admin manually rejected deposit transaction`
        : `Payment failed — deposit transaction rejected via payment callback`,
      metadata: {
        transaction_id,
        amount: transaction.amount,
        deposit_method: transaction.deposit_method,
        payment_method: payment_method || null,
        rejected_server_side: true,
        rejected_by_admin: isAdmin
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Transaction rejected successfully',
      transaction_id,
      new_status: 'rejected'
    });

  } catch (error) {
    console.error('Error in reject-transaction:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
