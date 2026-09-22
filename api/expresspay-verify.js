import { getServiceRoleClient } from './utils/auth.js';
import { setCorsHeaders } from './utils/corsHeaders.js';
import { getExpressPayConfig } from './utils/expresspayConfig.js';
import { redis } from './utils/redisClient.js';
import { logUserAction } from './utils/activityLogger.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, order_id, transaction_id } = req.body;

    if (!token && !order_id && !transaction_id) {
      return res.status(400).json({ error: 'Missing token or order_id parameter' });
    }

    const supabase = getServiceRoleClient();

    // 1. Locate the transaction in the database
    let query = supabase.from('transactions').select('*');
    if (token) {
      query = query.eq('expresspay_token', token);
    } else if (order_id) {
      query = query.eq('expresspay_order_id', order_id);
    } else if (transaction_id) {
      query = query.eq('id', transaction_id);
    }

    const { data: transaction, error: txError } = await query.maybeSingle();

    if (txError || !transaction) {
      console.warn('[expressPay Verify] Transaction not found:', { token, order_id, transaction_id });
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // 2. Idempotency: If already approved, return success immediately
    if (transaction.status === 'approved' || transaction.status === 'completed') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', transaction.user_id)
        .maybeSingle();

      return res.status(200).json({
        success: true,
        status: 'approved',
        message: 'Deposit already verified and credited',
        transaction_id: transaction.id,
        amount: transaction.amount,
        balance: profile?.balance || null
      });
    }

    // 3. Concurrency Lock via Redis (if available)
    if (redis) {
      const lockKey = `smm:lock:expresspay:${transaction.id}`;
      const acquired = await redis.set(lockKey, 'locked', { nx: true, ex: 20 });
      if (!acquired) {
        return res.status(409).json({
          error: 'Verification is currently in progress. Please wait a moment.'
        });
      }
    }

    // 4. Query expressPay Query API
    const config = await getExpressPayConfig(supabase);
    const verifyToken = token || transaction.expresspay_token;

    if (!verifyToken) {
      return res.status(400).json({ error: 'expressPay transaction token is missing' });
    }

    const queryParams = new URLSearchParams();
    queryParams.append('merchant-id', config.merchantId);
    queryParams.append('api-key', config.apiKey);
    queryParams.append('token', verifyToken);

    console.log('[expressPay Verify] Querying expressPay:', {
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
      console.error('[expressPay Verify] Invalid JSON from Query API:', queryText);
      return res.status(502).json({ error: 'Failed to parse response from expressPay Query API' });
    }

    console.log('[expressPay Verify] expressPay Query API response:', queryData);

    const result = parseInt(queryData.result, 10);
    const resultText = queryData['result-text'] || queryData.result_text || 'Unknown';
    const providerTxId = queryData['transaction-id'] || queryData.transaction_id || `EXP_TX_${verifyToken}`;

    // Result codes:
    // 1 = Approved
    // 2 = Declined
    // 3 = Error in transaction data or system error
    // 4 = Pending
    if (result === 1) {
      // 5. Approve transaction & credit user balance atomically
      const { data: approvalResult, error: rpcError } = await supabase.rpc(
        'approve_deposit_transaction_universal_v2',
        {
          p_transaction_id: transaction.id,
          p_payment_method: 'expresspay',
          p_payment_status: 'Approved',
          p_payment_reference: verifyToken,
          p_actual_amount: transaction.amount,
          p_provider_event_id: providerTxId,
          p_admin_id: null
        }
      );

      if (rpcError) {
        console.error('[expressPay Verify] RPC Approval error:', rpcError);
        return res.status(500).json({ error: 'Failed to credit account: ' + rpcError.message });
      }

      await logUserAction({
        userId: transaction.user_id,
        action: 'EXPRESSPAY_DEPOSIT_VERIFIED',
        details: {
          transaction_id: transaction.id,
          order_id: transaction.expresspay_order_id,
          amount: transaction.amount,
          token: verifyToken,
          provider_tx_id: providerTxId
        }
      });

      return res.status(200).json({
        success: true,
        status: 'approved',
        message: 'Payment approved and balance credited successfully!',
        transaction_id: transaction.id,
        amount: transaction.amount,
        details: approvalResult
      });
    } else if (result === 4) {
      // Pending
      await supabase
        .from('transactions')
        .update({
          expresspay_status: 'Pending'
        })
        .eq('id', transaction.id);

      return res.status(200).json({
        success: false,
        status: 'pending',
        message: 'Your payment is currently pending confirmation from your mobile network. Balance will be updated automatically once processed.'
      });
    } else {
      // Declined / Error
      await supabase
        .from('transactions')
        .update({
          status: 'failed',
          expresspay_status: `Declined: ${resultText}`
        })
        .eq('id', transaction.id);

      return res.status(200).json({
        success: false,
        status: 'failed',
        message: `Payment not approved: ${resultText}`
      });
    }
  } catch (error) {
    console.error('[expressPay Verify] Internal Server Error:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred during payment verification.'
    });
  }
}
