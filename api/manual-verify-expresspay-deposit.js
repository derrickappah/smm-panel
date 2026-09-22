/**
 * Manual expressPay Deposit Verification Endpoint
 * 
 * SECURITY: Requires admin authentication.
 * 
 * Allows admins to manually verify and sync an expressPay deposit transaction by querying expressPay API
 * and updating transaction status & balance if valid.
 */

import { verifyAdmin, getServiceRoleClient } from './utils/auth.js';
import { logAdminAction, logSecurityEvent } from './utils/activityLogger.js';
import { getExpressPayConfig } from './utils/expresspayConfig.js';
import { setCorsHeaders } from './utils/corsHeaders.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let adminUser;
    try {
      const authResult = await verifyAdmin(req);
      adminUser = authResult.user;
    } catch (authError) {
      await logSecurityEvent({
        action_type: 'manual_verification_failed',
        description: `Failed manual expressPay verification attempt: ${authError.message}`,
        metadata: {
          transaction_id: req.body?.transactionId || null,
          token: req.body?.token || null,
          error: authError.message
        },
        req
      });

      return res.status(401).json({
        error: 'Unauthorized',
        message: authError.message
      });
    }

    const { transactionId, token, orderId } = req.body;

    if (!transactionId && !token && !orderId) {
      return res.status(400).json({ error: 'Either transactionId, token, or orderId is required' });
    }

    const supabase = getServiceRoleClient();

    // 1. Fetch transaction record
    let query = supabase.from('transactions').select('*');
    if (transactionId) {
      query = query.eq('id', transactionId);
    } else if (token) {
      query = query.eq('expresspay_token', token);
    } else if (orderId) {
      query = query.eq('expresspay_order_id', orderId);
    }

    const { data: transaction, error: txError } = await query.maybeSingle();

    if (txError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.type !== 'deposit') {
      return res.status(400).json({ error: 'Transaction is not a deposit' });
    }

    if (transaction.status === 'approved' || transaction.status === 'completed') {
      return res.status(200).json({
        success: true,
        status: 'approved',
        message: 'Transaction is already approved',
        transaction
      });
    }

    // 2. Query expressPay API
    const config = await getExpressPayConfig(supabase);
    const verifyToken = token || transaction.expresspay_token;

    if (!verifyToken) {
      return res.status(400).json({
        error: 'Transaction does not have an expressPay token recorded. Unable to verify with expressPay.'
      });
    }

    const queryParams = new URLSearchParams();
    queryParams.append('merchant-id', config.merchantId);
    queryParams.append('api-key', config.apiKey);
    queryParams.append('token', verifyToken);

    console.log('[Admin Manual Verify expressPay] Querying expressPay:', {
      url: config.queryUrl,
      token: verifyToken
    });

    const expressPayRes = await fetch(config.queryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: queryParams.toString()
    });

    const queryText = await expressPayRes.text();
    let queryData;
    try {
      queryData = JSON.parse(queryText);
    } catch (parseErr) {
      return res.status(502).json({
        error: 'Invalid response from expressPay gateway',
        raw: queryText
      });
    }

    const result = parseInt(queryData.result, 10);
    const resultText = queryData['result-text'] || queryData.result_text || 'Unknown';
    const providerTxId = queryData['transaction-id'] || queryData.transaction_id || `EXP_TX_${verifyToken}`;

    if (result === 1) {
      // 3. Approved! Credit user balance atomically
      const { data: approvalResult, error: rpcError } = await supabase.rpc(
        'approve_deposit_transaction_universal_v2',
        {
          p_transaction_id: transaction.id,
          p_payment_method: 'expresspay',
          p_payment_status: 'Approved',
          p_payment_reference: verifyToken,
          p_actual_amount: transaction.amount,
          p_provider_event_id: providerTxId,
          p_admin_id: adminUser.id
        }
      );

      if (rpcError) {
        return res.status(500).json({ error: 'Database approval error: ' + rpcError.message });
      }

      await logAdminAction({
        action_type: 'MANUAL_EXPRESSPAY_APPROVAL',
        admin_id: adminUser.id,
        target_id: transaction.id,
        description: `Admin manually verified and approved expressPay deposit for transaction ${transaction.id}`,
        metadata: {
          transaction_id: transaction.id,
          user_id: transaction.user_id,
          amount: transaction.amount,
          token: verifyToken,
          provider_tx_id: providerTxId
        }
      });

      return res.status(200).json({
        success: true,
        status: 'approved',
        message: 'Deposit verified and user credited successfully',
        transaction_id: transaction.id,
        amount: transaction.amount,
        details: approvalResult
      });
    } else {
      return res.status(400).json({
        success: false,
        status: result === 4 ? 'pending' : 'failed',
        message: `expressPay status: ${resultText} (code: ${result})`,
        gateway_data: queryData
      });
    }
  } catch (error) {
    console.error('[Admin Manual Verify expressPay] Internal error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
