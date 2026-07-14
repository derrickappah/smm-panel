import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { logAdminAction } from '../utils/activityLogger.js';

export default async function handler(req, res) {
  // Setup CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    // 1. Verify caller is an admin
    let adminUser;
    try {
      const authResult = await verifyAdmin(req);
      adminUser = authResult.user;
    } catch (authError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: authError.message
      });
    }

    const { transactionId, moolreId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing required parameter: transactionId' });
    }

    const supabase = getServiceRoleClient();

    // 2. Fetch the target transaction details
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Guard: Only allow deposit transactions
    if (transaction.type !== 'deposit') {
      return res.status(400).json({ error: 'Transaction is not a deposit' });
    }

    // Guard: Only allow expired deposits to be approved via this flow
    if (transaction.status !== 'expired') {
      return res.status(400).json({
        error: `Cannot approve transaction with status '${transaction.status}'. Only 'expired' deposits can be approved via this flow.`
      });
    }

    // Resolve Moolre ID and ID type (1 = external reference, 2 = Moolre generated ID)
    let idType = 2; // Default to Moolre Generated ID
    let moolreIdValue = null;

    if (moolreId) {
      moolreIdValue = moolreId;
      if (moolreId.startsWith('MOOLRE_') || moolreId.startsWith('MOOLRE_WEB_')) {
        idType = 1;
      }
    } else if (transaction.moolre_id) {
      idType = 2;
      moolreIdValue = transaction.moolre_id;
    } else if (transaction.moolre_reference) {
      idType = 1;
      moolreIdValue = transaction.moolre_reference;
    } else {
      return res.status(400).json({
        error: 'No Moolre ID or Moolre Reference found for this transaction. Please provide one.'
      });
    }

    // 3. Verify Moolre API credentials
    const MOOLRE_API_USER = process.env.MOOLRE_API_USER;
    const MOOLRE_API_PUBKEY = process.env.MOOLRE_API_PUBKEY;
    const MOOLRE_ACCOUNT_NUMBER = process.env.MOOLRE_ACCOUNT_NUMBER;

    if (!MOOLRE_API_USER || !MOOLRE_API_PUBKEY || !MOOLRE_ACCOUNT_NUMBER) {
      return res.status(500).json({ error: 'Moolre credentials not configured on the server' });
    }

    console.log(`[APPROVE-EXPIRED-DEPOSIT] Verifying transaction ${transactionId} against Moolre Lookup: ${moolreIdValue} (idtype: ${idType})`);

    // 4. Verify transaction exists in Moolre merchant statement/API
    const moolreResponse = await fetch('https://api.moolre.com/open/transact/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-USER': MOOLRE_API_USER,
        'X-API-PUBKEY': MOOLRE_API_PUBKEY
      },
      body: JSON.stringify({
        type: 1,
        idtype: idType,
        id: moolreIdValue,
        accountnumber: MOOLRE_ACCOUNT_NUMBER
      })
    });

    const moolreData = await moolreResponse.json();

    if (!moolreResponse.ok || moolreData.status === 0) {
      console.error('[APPROVE-EXPIRED-DEPOSIT] Moolre verification failed:', moolreData);
      return res.status(400).json({
        error: `Moolre verification failed: ${moolreData.message || 'Transaction not found in Moolre statement'}`
      });
    }

    const verifiedTx = moolreData.data;
    if (!verifiedTx) {
      return res.status(400).json({ error: 'Moolre API returned empty transaction data' });
    }

    // 5. Verify the Tx ID matches
    const moolreTxId = String(verifiedTx.id || verifiedTx.transactionid || verifiedTx.transaction_id || '');
    const expectedMoolreId = idType === 2 ? moolreIdValue : moolreTxId;
    if (moolreTxId && expectedMoolreId && moolreTxId !== String(expectedMoolreId)) {
      return res.status(400).json({
        error: `Security verification failed: Moolre transaction ID mismatch. Expected ${expectedMoolreId}, got ${moolreTxId}`
      });
    }

    // 6. Verify status from Moolre is success (txstatus === 1)
    const txstatus = verifiedTx.txstatus;
    if (txstatus !== 1) {
      return res.status(400).json({
        error: `Security verification failed: Moolre transaction is not successful (status: ${txstatus}). Only successful payments can be approved.`
      });
    }

    // 7. Verify the amount matches
    const moolreAmount = parseFloat(verifiedTx.amount || verifiedTx.value || 0);
    const depositAmount = parseFloat(transaction.amount || 0);

    // Adaptive tolerance logic
    let tolerance;
    if (depositAmount < 1.00) {
      tolerance = 0.01;
    } else if (depositAmount < 10.00) {
      tolerance = 0.05;
    } else {
      tolerance = Math.max(0.10, depositAmount * 0.01);
    }

    if (Math.abs(moolreAmount - depositAmount) > tolerance) {
      console.error('[APPROVE-EXPIRED-DEPOSIT] Amount mismatch:', {
        expected: depositAmount,
        actual: moolreAmount,
        tolerance
      });
      return res.status(400).json({
        error: `Amount mismatch: Expected ₵${depositAmount.toFixed(2)}, but Moolre transaction shows ₵${moolreAmount.toFixed(2)}`
      });
    }

    // 8. Verify the transaction has not already been credited to another deposit
    const duplicateCheckId = moolreTxId || moolreIdValue;
    const { data: duplicateTx, error: dupError } = await supabase
      .from('transactions')
      .select('id, user_id, amount, status')
      .eq('status', 'approved')
      .or(`moolre_id.eq.${duplicateCheckId},provider_event_id.eq.${duplicateCheckId}`);

    if (dupError) {
      console.error('[APPROVE-EXPIRED-DEPOSIT] Duplicate check error:', dupError);
      return res.status(500).json({ error: 'Failed to verify transaction uniqueness in database' });
    }

    if (duplicateTx && duplicateTx.length > 0) {
      return res.status(400).json({
        error: `This Moolre transaction has already been credited to deposit transaction: ${duplicateTx[0].id}`
      });
    }

    // 9. All checks pass - approve the transaction using the universal atomic function
    const method = transaction.deposit_method || 'moolre';
    const { data: rpcResult, error: rpcError } = await supabase.rpc('approve_deposit_transaction_universal_v2', {
      p_transaction_id: transactionId,
      p_payment_method: method,
      p_payment_status: 'success',
      p_payment_reference: verifiedTx.externalref || transaction.moolre_reference || moolreIdValue,
      p_actual_amount: moolreAmount,
      p_provider_event_id: duplicateCheckId,
      p_admin_id: adminUser.id
    });

    if (rpcError) {
      console.error('[APPROVE-EXPIRED-DEPOSIT] RPC error:', rpcError);
      return res.status(500).json({
        error: 'Database error: Failed to approve transaction and update wallet balance',
        details: rpcError.message
      });
    }

    const approvalResult = rpcResult && rpcResult.length > 0 ? rpcResult[0] : null;
    if (!approvalResult || !approvalResult.success) {
      return res.status(400).json({
        error: approvalResult?.message || 'Transaction approval failed'
      });
    }

    // Save the actual Moolre ID to the transaction in the database
    if (moolreTxId) {
      await supabase
        .from('transactions')
        .update({ moolre_id: moolreTxId })
        .eq('id', transactionId);
    }

    // 10. Log the admin action
    await logAdminAction({
      user_id: adminUser.id,
      action_type: 'admin_approved_expired_deposit',
      entity_type: 'transaction',
      entity_id: transactionId,
      description: `Admin approved expired deposit transaction ${transactionId} after verifying Moolre payment ${duplicateCheckId} for ₵${moolreAmount.toFixed(2)}.`,
      metadata: {
        transaction_id: transactionId,
        moolre_id: duplicateCheckId,
        amount: moolreAmount,
        old_status: approvalResult.old_status,
        new_status: approvalResult.new_status,
        user_id: transaction.user_id,
        old_balance: approvalResult.old_balance,
        new_balance: approvalResult.new_balance
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Expired deposit approved successfully and user wallet credited.',
      transactionId,
      oldStatus: approvalResult.old_status,
      newStatus: approvalResult.new_status,
      oldBalance: approvalResult.old_balance,
      newBalance: approvalResult.new_balance,
      amountCredited: moolreAmount
    });

  } catch (error) {
    console.error('[APPROVE-EXPIRED-DEPOSIT] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
