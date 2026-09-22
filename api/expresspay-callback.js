import { getServiceRoleClient } from './utils/auth.js';
import { setCorsHeaders } from './utils/corsHeaders.js';
import { getExpressPayConfig } from './utils/expresspayConfig.js';
import { redis } from './utils/redisClient.js';
import { logSecurityEvent, logUserAction } from './utils/activityLogger.js';

/**
 * expressPay Post-URL Webhook Handler
 * 
 * Invoked asynchronously by expressPay for pending transactions (especially Mobile Money).
 * Merchant must query the expressPay Query API to verify status and return HTTP 200 (OK).
 */
export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow both POST and GET
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Extract order-id and token from body or query
    const body = req.body || {};
    const query = req.query || {};

    const orderId = body['order-id'] || body.order_id || body.orderId || query['order-id'] || query.order_id;
    const token = body.token || query.token;

    console.log('[expressPay Callback] Received notification:', {
      method: req.method,
      orderId,
      token,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      }
    });

    if (!orderId && !token) {
      console.warn('[expressPay Callback] Missing order-id or token');
      // ExpressPay requires 200 OK so it doesn't repeatedly retry malformed calls
      return res.status(200).json({ status: 'ignored', reason: 'Missing order-id or token' });
    }

    const supabase = getServiceRoleClient();

    // 2. Find transaction record
    let txQuery = supabase.from('transactions').select('*');
    if (token) {
      txQuery = txQuery.eq('expresspay_token', token);
    } else if (orderId) {
      txQuery = txQuery.eq('expresspay_order_id', orderId);
    }

    const { data: transaction, error: fetchErr } = await txQuery.maybeSingle();

    if (fetchErr || !transaction) {
      console.warn('[expressPay Callback] Transaction not found:', { orderId, token });
      return res.status(200).json({ status: 'not_found', orderId, token });
    }

    // 3. Idempotency Check: If already approved, return 200 OK
    if (transaction.status === 'approved' || transaction.status === 'completed') {
      console.log('[expressPay Callback] Transaction already approved:', transaction.id);
      return res.status(200).json({ status: 'already_approved', transactionId: transaction.id });
    }

    // 4. Redis Concurrency Lock (25s)
    if (redis) {
      const lockKey = `smm:lock:expresspay:${transaction.id}`;
      const acquired = await redis.set(lockKey, 'locked', { nx: true, ex: 25 });
      if (!acquired) {
        console.log('[expressPay Callback] Concurrent operation in progress, returning 200');
        return res.status(200).json({ status: 'locked', message: 'Processing in progress' });
      }
    }

    // 5. Query expressPay Query API to verify final status
    const config = await getExpressPayConfig(supabase);
    const queryToken = token || transaction.expresspay_token;

    if (!queryToken) {
      console.error('[expressPay Callback] Missing query token for transaction:', transaction.id);
      return res.status(200).json({ status: 'error', reason: 'No token available' });
    }

    const queryParams = new URLSearchParams();
    queryParams.append('merchant-id', config.merchantId);
    queryParams.append('api-key', config.apiKey);
    queryParams.append('token', queryToken);

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
      console.error('[expressPay Callback] Failed to parse Query API response:', queryText);
      return res.status(200).json({ status: 'parse_error' });
    }

    console.log('[expressPay Callback] Query API status check:', queryData);

    const result = parseInt(queryData.result, 10);
    const resultText = queryData['result-text'] || queryData.result_text || 'Unknown';
    const providerTxId = queryData['transaction-id'] || queryData.transaction_id || `EXP_TX_${queryToken}`;

    if (result === 1) {
      // Approved! Credit account via universal atomic procedure
      const { data: approvalResult, error: rpcError } = await supabase.rpc(
        'approve_deposit_transaction_universal_v2',
        {
          p_transaction_id: transaction.id,
          p_payment_method: 'expresspay',
          p_payment_status: 'Approved',
          p_payment_reference: queryToken,
          p_actual_amount: transaction.amount,
          p_provider_event_id: providerTxId,
          p_admin_id: null
        }
      );

      if (rpcError) {
        console.error('[expressPay Callback] RPC approval failed:', rpcError);
        return res.status(200).json({ status: 'db_error', error: rpcError.message });
      }

      await logUserAction({
        userId: transaction.user_id,
        action: 'EXPRESSPAY_WEBHOOK_PROCESSED',
        details: {
          transaction_id: transaction.id,
          order_id: transaction.expresspay_order_id,
          token: queryToken,
          amount: transaction.amount,
          provider_tx_id: providerTxId
        }
      });

      console.log(`[expressPay Callback] Successfully approved deposit ${transaction.id} for user ${transaction.user_id}`);
      return res.status(200).json({ status: 'approved', transactionId: transaction.id });
    } else if (result === 4) {
      // Still pending
      await supabase
        .from('transactions')
        .update({ expresspay_status: 'Pending' })
        .eq('id', transaction.id);

      return res.status(200).json({ status: 'pending', transactionId: transaction.id });
    } else {
      // Failed or declined
      await supabase
        .from('transactions')
        .update({
          status: 'failed',
          expresspay_status: `Declined: ${resultText}`
        })
        .eq('id', transaction.id);

      return res.status(200).json({ status: 'declined', reason: resultText });
    }
  } catch (error) {
    console.error('[expressPay Callback] Error handling callback:', error);
    // Always return HTTP 200 to satisfy expressPay requirements
    return res.status(200).json({ status: 'error', message: error.message });
  }
}
