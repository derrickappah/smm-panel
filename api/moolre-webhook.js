/**
 * Moolre Payment Webhook Handler
 *
 * This endpoint receives server-to-server push callbacks from Moolre when a
 * mobile money payment is completed, failed, or pending.
 *
 * Configure this URL as your Moolre webhook/callback URL:
 *   https://your-domain.com/api/moolre-webhook
 *
 * Moolre sends a POST with this shape:
 * {
 *   "status": 1,
 *   "code": "P01",
 *   "message": "Transaction Successful",
 *   "data": {
 *     "txstatus":      1,            // 1=Success, 0=Pending, 2=Failed
 *     "payer":         "233250130550",
 *     "terminalid":    "",
 *     "accountnumber": "420500413146",
 *     "name":          "Nancy Naaki",
 *     "amount":        "15.21",
 *     "value":         "15.21",      // net amount after fees
 *     "transactionid": "32712684",   // Moolre's internal ID
 *     "externalref":   "vbundle_C23...", // OUR reference stored as moolre_reference
 *     "thirdpartyref": "48149622075",
 *     "secret":        "c80b20ce-...", // shared secret for verification
 *     "ts":            "2024-11-27 21:11:29"
 *   },
 *   "go": null
 * }
 *
 * Environment Variables Required:
 *   MOOLRE_WEBHOOK_SECRET  – the shared secret configured in your Moolre dashboard
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Moolre only sends POST webhooks
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Early logging for debugging - log raw request to console at least
  console.log('[MOOLRE-WEBHOOK] Request received:', {
    headers: req.headers,
    body: req.body
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Parse payload
  // ────────────────────────────────────────────────────────────────────────────
  const payload = req.body;

  // Support both flat payloads and the nested { data: {...} } format
  const data = payload?.data || payload;

  const {
    txstatus,
    externalref,
    transactionid: moolreTransactionId,
    amount: rawAmount,
    value: rawValue,
    payer,
    secret: incomingSecret,
    ts
  } = data || {};

  console.log('[MOOLRE-WEBHOOK] Received callback:', {
    txstatus,
    externalref,
    moolreTransactionId,
    rawAmount,
    payer,
    hasSecret: !!incomingSecret,
    ts
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Validate required fields
  // ────────────────────────────────────────────────────────────────────────────
  if (externalref === undefined || externalref === null) {
    console.error('[MOOLRE-WEBHOOK] Missing externalref in payload');
    // Return 200 so Moolre doesn't keep retrying malformed payloads
    return res.status(200).json({ received: true, error: 'Missing externalref' });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Verify shared secret
  // ────────────────────────────────────────────────────────────────────────────
  const expectedSecret = process.env.MOOLRE_WEBHOOK_SECRET;

  if (expectedSecret) {
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.error('[MOOLRE-WEBHOOK] Secret mismatch — possible spoofed webhook', {
        received: incomingSecret?.substring(0, 8) + '...'
      });

      // Log failure to system_events for debugging
      const supabaseErrorLog = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      await supabaseErrorLog.rpc('log_system_event', {
        p_type: 'moolre_webhook_auth_failed',
        p_severity: 'warning',
        p_source: 'moolre-webhook',
        p_description: `Moolre webhook secret mismatch. Received: ${incomingSecret?.substring(0, 8)}...`,
        p_metadata: { 
          externalref: data?.externalref,
          txstatus: data?.txstatus,
          received_secret_prefix: incomingSecret?.substring(0, 8)
        }
      }).catch(() => {});

      // Return 200 so Moolre doesn't retry; we silently discard spoofed webhooks
      return res.status(200).json({ received: true, error: 'Invalid secret' });
    }
  } else {
    // Secret not configured — log a warning but continue (dev/test mode)
    console.warn('[MOOLRE-WEBHOOK] MOOLRE_WEBHOOK_SECRET is not set — skipping secret verification');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Determine payment outcome
  //    txstatus: 1 = Successful, 0 = Pending, 2 = Failed
  // ────────────────────────────────────────────────────────────────────────────
  const txstatusNum = Number(txstatus);
  const isSuccessful = txstatusNum === 1;
  const isFailed     = txstatusNum === 2;
  const isPending    = txstatusNum === 0;

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Connect to Supabase using service_role
  // ────────────────────────────────────────────────────────────────────────────
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[MOOLRE-WEBHOOK] Supabase credentials not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Look up transaction by externalref (stored as moolre_reference)
  // ────────────────────────────────────────────────────────────────────────────
  const { data: transactions, error: fetchError } = await supabase
    .from('transactions')
    .select('id, user_id, type, amount, status, deposit_method, moolre_reference, moolre_id')
    .eq('moolre_reference', externalref)
    .order('created_at', { ascending: false })
    .limit(1);

  if (fetchError || !transactions || transactions.length === 0) {
    console.error('[MOOLRE-WEBHOOK] Transaction not found for externalref:', externalref, fetchError);
    
    // Log missing transaction for debugging
    await supabase.rpc('log_system_event', {
      p_type: 'moolre_webhook_tx_not_found',
      p_severity: 'warning',
      p_source: 'moolre-webhook',
      p_description: `Moolre webhook received but transaction not found for externalref: ${externalref}`,
      p_metadata: { externalref, txstatus: txstatusNum, fetchError }
    }).catch(() => {});

    // Return 200 — Moolre should not retry for unknown references
    return res.status(200).json({ received: true, error: 'Transaction not found' });
  }

  const transaction = transactions[0];

  console.log('[MOOLRE-WEBHOOK] Found transaction:', {
    id: transaction.id,
    status: transaction.status,
    amount: transaction.amount,
    externalref,
    txstatus: txstatusNum
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. Store log entry for this webhook event (regardless of outcome)
  // ────────────────────────────────────────────────────────────────────────────
  await supabase.rpc('log_system_event', {
    p_type: 'moolre_webhook_received',
    p_severity: 'info',
    p_source: 'moolre-webhook',
    p_description: `Moolre webhook received: txstatus=${txstatusNum} for ref=${externalref}`,
    p_metadata: {
      externalref,
      txstatus: txstatusNum,
      moolre_transaction_id: moolreTransactionId ? String(moolreTransactionId) : null,
      amount: rawAmount,
      payer,
      transaction_id: transaction.id,
      current_status: transaction.status
    },
    p_entity_type: 'transaction',
    p_entity_id: transaction.id
  }).catch(err => console.warn('[MOOLRE-WEBHOOK] Failed to log system event:', err.message));

  // ────────────────────────────────────────────────────────────────────────────
  // 8. Idempotency — skip if already finalized
  // ────────────────────────────────────────────────────────────────────────────
  if (transaction.status === 'approved' || transaction.status === 'rejected') {
    console.log('[MOOLRE-WEBHOOK] Transaction already finalized, skipping:', transaction.status);
    return res.status(200).json({
      received: true,
      message: `Transaction already ${transaction.status}`,
      transaction_id: transaction.id
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 9. Handle PENDING — just update the moolre_id if we have it
  // ────────────────────────────────────────────────────────────────────────────
  if (isPending) {
    if (moolreTransactionId && !transaction.moolre_id) {
      await supabase
        .from('transactions')
        .update({ moolre_id: String(moolreTransactionId), moolre_status: 'pending' })
        .eq('id', transaction.id);
    }

    return res.status(200).json({
      received: true,
      message: 'Payment pending',
      transaction_id: transaction.id
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 10. Handle SUCCESSFUL payment
  // ────────────────────────────────────────────────────────────────────────────
  if (isSuccessful) {
    // Amount validation — use `value` (net after fees) if available, else `amount`
    const paidAmount = parseFloat(rawValue || rawAmount || 0);
    const storedAmount = parseFloat(transaction.amount || 0);

    if (paidAmount > 0 && storedAmount > 0) {
      // Adaptive tolerance
      const tolerance = storedAmount < 1.0
        ? 0.01
        : storedAmount < 10.0
          ? 0.05
          : Math.max(0.10, storedAmount * 0.01);

      const diff = Math.abs(paidAmount - storedAmount);

      if (diff > tolerance) {
        console.error('[MOOLRE-WEBHOOK] Amount mismatch!', {
          paid: paidAmount, stored: storedAmount, diff, tolerance,
          transaction_id: transaction.id
        });

        await supabase.rpc('log_system_event', {
          p_type: 'payment_amount_mismatch',
          p_severity: 'critical',
          p_source: 'moolre-webhook',
          p_description: `Amount mismatch! Moolre paid ${paidAmount} GHS, stored ${storedAmount} GHS for txn ${transaction.id}`,
          p_metadata: {
            paid_amount: paidAmount, stored_amount: storedAmount,
            diff, externalref, transaction_id: transaction.id,
            user_id: transaction.user_id
          },
          p_entity_type: 'transaction',
          p_entity_id: transaction.id
        }).catch(() => {});

        return res.status(200).json({
          received: true,
          error: 'Amount mismatch — transaction held for review',
          transaction_id: transaction.id
        });
      }
    }

    // Call atomic approval function (handles balance update + audit log atomically)
    const { data: result, error: rpcError } = await supabase.rpc(
      'approve_deposit_transaction_universal_v2',
      {
        p_transaction_id:   transaction.id,
        p_payment_method:   transaction.deposit_method || 'moolre',
        p_payment_status:   'success',
        p_payment_reference: externalref,
        p_actual_amount:    paidAmount > 0 ? paidAmount : storedAmount,
        p_provider_event_id: moolreTransactionId ? String(moolreTransactionId) : null
      }
    );

    if (rpcError) {
      console.error('[MOOLRE-WEBHOOK] Approval RPC error:', rpcError);
      // Return 500 so Moolre retries
      return res.status(500).json({
        error: 'Failed to approve transaction',
        details: rpcError.message
      });
    }

    const approval = result?.[0];

    if (!approval?.success) {
      if (approval?.message?.includes('already approved')) {
        return res.status(200).json({ received: true, message: 'Already approved', transaction_id: transaction.id });
      }
      console.error('[MOOLRE-WEBHOOK] Approval function failed:', approval?.message);
      return res.status(500).json({ error: approval?.message || 'Approval failed' });
    }

    console.log('[MOOLRE-WEBHOOK] ✅ Payment approved:', {
      transaction_id: transaction.id,
      user_id: transaction.user_id,
      amount: paidAmount,
      new_balance: approval.new_balance
    });

    return res.status(200).json({
      received: true,
      message: 'Payment approved',
      transaction_id: transaction.id,
      new_balance: approval.new_balance
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 11. Handle FAILED payment
  // ────────────────────────────────────────────────────────────────────────────
  if (isFailed) {
    const updatePayload = {
      status: 'rejected',
      moolre_status: 'failed'
    };
    if (moolreTransactionId && !transaction.moolre_id) {
      updatePayload.moolre_id = String(moolreTransactionId);
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', transaction.id)
      .eq('status', 'pending'); // Guard against race condition

    if (updateError) {
      console.error('[MOOLRE-WEBHOOK] Failed to reject transaction:', updateError);
      return res.status(500).json({ error: 'Failed to update transaction status' });
    }

    console.log('[MOOLRE-WEBHOOK] ❌ Payment rejected:', transaction.id);

    return res.status(200).json({
      received: true,
      message: 'Payment failure recorded',
      transaction_id: transaction.id
    });
  }

  // Unknown txstatus
  console.warn('[MOOLRE-WEBHOOK] Unknown txstatus:', txstatusNum);
  return res.status(200).json({ received: true, message: 'Unknown txstatus, ignored' });
}
