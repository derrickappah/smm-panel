/**
 * Manual Hubtel Deposit Verification Endpoint
 * 
 * SECURITY: Requires admin authentication.
 * 
 * Allows admins to manually verify and sync a Hubtel deposit transaction by querying
 * the Hubtel RMSC Transaction Status API and updating transaction status & balance if valid.
 */

import { verifyAdmin, getServiceRoleClient } from './utils/auth.js';
import { logAdminAction, logSecurityEvent } from './utils/activityLogger.js';
import { setCorsHeaders } from './utils/corsHeaders.js';
import { redis } from './utils/redisClient.js';

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
        description: `Failed manual Hubtel verification attempt: ${authError.message}`,
        metadata: {
          transaction_id: req.body?.transactionId || null,
          clientReference: req.body?.clientReference || req.body?.reference || null,
          error: authError.message
        },
        req
      });

      return res.status(401).json({
        error: 'Unauthorized',
        message: authError.message
      });
    }

    const { transactionId, clientReference, reference } = req.body;

    if (!transactionId && !clientReference && !reference) {
      return res.status(400).json({ error: 'Either transactionId or clientReference is required' });
    }

    const supabase = getServiceRoleClient();

    // 1. Fetch transaction record
    let query = supabase.from('transactions').select('*');
    if (transactionId) {
      query = query.eq('id', transactionId);
    } else {
      const ref = clientReference || reference;
      query = query.or(`client_reference.eq.${ref},checkout_id.eq.${ref},hubtel_transaction_id.eq.${ref}`);
    }

    const { data: transaction, error: txError } = await query.maybeSingle();

    if (txError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.type !== 'deposit') {
      return res.status(400).json({ error: 'Transaction is not a deposit' });
    }

    // Determine reference to check with Hubtel
    const targetRef = (clientReference || reference || transaction.client_reference || '').trim();

    if (!targetRef) {
      return res.status(400).json({
        error: 'No Hubtel reference found for this transaction. Please provide a Client Reference manually.',
        transactionId: transaction.id
      });
    }

    // If already approved, return early
    if (transaction.status === 'Paid' || transaction.status === 'approved') {
      return res.status(200).json({
        success: true,
        status: 'approved',
        message: 'Transaction is already approved',
        updateResult: {
          newStatus: 'approved',
          oldStatus: transaction.status,
          balanceUpdated: true
        },
        transaction
      });
    }

    // Atomic Redis Lock for 30s to prevent concurrent execution races
    if (redis) {
      const lockKey = `smm:lock:deposit:${transaction.id}`;
      const acquired = await redis.set(lockKey, 'locked', { nx: true, ex: 30 });
      if (!acquired) {
        return res.status(409).json({
          error: 'Deposit verification for this transaction is currently being processed. Please wait.',
          transaction_id: transaction.id
        });
      }
    }

    // 2. Query Hubtel RMSC Status API
    const clientId = (process.env.HUBTEL_API_ID || process.env.HUBTEL_CLIENT_ID || '').trim();
    const clientSecret = (process.env.HUBTEL_API_KEY || process.env.HUBTEL_CLIENT_SECRET || '').trim();
    const posId = (process.env.HUBTEL_POS_ID || process.env.HUBTEL_MERCHANT_ACCOUNT || '').trim();

    if (!clientId || !clientSecret || !posId) {
      console.error('Missing Hubtel credentials in environment variables');
      return res.status(500).json({ error: 'Payment provider configuration error: Missing Hubtel credentials' });
    }

    const authString = `${clientId}:${clientSecret}`;
    const encodedAuth = Buffer.from(authString).toString('base64');
    const authHeader = `Basic ${encodedAuth}`;

    const hubtelUrl = `https://rmsc.hubtel.com/v1/merchantaccount/merchants/${posId}/transactions/status?clientReference=${encodeURIComponent(targetRef)}`;

    let hubtelData = null;
    try {
      const statusResponse = await fetch(hubtelUrl, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      });

      if (statusResponse.ok) {
        hubtelData = await statusResponse.json();
      } else {
        const errText = await statusResponse.text();
        console.warn(`Hubtel Status API returned HTTP ${statusResponse.status}: ${errText}`);
      }
    } catch (apiErr) {
      console.error('Error calling Hubtel Status API:', apiErr);
      return res.status(502).json({ error: 'Failed to verify with Hubtel payment provider', details: apiErr.message });
    }

    if (!hubtelData) {
      return res.status(502).json({
        error: 'No response or error received from Hubtel Status API',
        clientReference: targetRef
      });
    }

    // Parse authoritative status from Hubtel
    let apiData = hubtelData.data || hubtelData.Data || hubtelData;
    if (Array.isArray(apiData) && apiData.length > 0) {
      apiData = apiData[0];
    }
    const responseData = apiData || {};

    const transactionStatus = apiData.TransactionStatus || apiData.InvoiceStatus || apiData.status || apiData.Status || hubtelData.status || hubtelData.Status;
    const responseCode = hubtelData.responseCode || hubtelData.ResponseCode;
    const verifiedAmount = parseFloat(apiData.AmountAfterFees || apiData.TransactionAmount || apiData.amount || apiData.Amount || apiData.amountPaid || apiData.AmountPaid || 0);

    const expectedAmount = parseFloat(transaction.amount);
    const amountMatches = verifiedAmount >= expectedAmount * 0.99; // 1% tolerance for processing fee rounding

    // Only an explicit success status counts. ResponseCode '0000' only means the
    // lookup succeeded — Pending/Failed transactions also return '0000'.
    const normalizedStatus = String(transactionStatus || '').trim().toLowerCase();
    const isSuccessful = ['paid', 'success', 'successful'].includes(normalizedStatus) && amountMatches;

    const eventId = responseData.transactionId || responseData.TransactionId || responseData.checkoutId || responseData.CheckoutId || responseData.InvoiceToken || hubtelData?.transactionId || null;

    if (isSuccessful) {
      const creditAmount = verifiedAmount > 0 ? verifiedAmount : expectedAmount;
      const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction_universal_v2', {
        p_transaction_id: transaction.id,
        p_payment_method: 'hubtel',
        p_payment_status: 'Paid',
        p_payment_reference: targetRef,
        p_actual_amount: creditAmount,
        p_provider_event_id: eventId ? String(eventId) : null
      });

      if (rpcError) {
        console.error('[MANUAL-VERIFY HUBTEL] Database approval error:', rpcError);
        return res.status(500).json({ error: 'Failed to approve deposit: ' + rpcError.message });
      }

      const approvalResult = result && result.length > 0 ? result[0] : null;

      await supabase
        .from('transactions')
        .update({
          client_reference: targetRef,
          payment_method: responseData.PaymentMethod || responseData.MobileChannelName || transaction.payment_method || 'hubtel',
          hubtel_transaction_id: eventId ? String(eventId) : transaction.hubtel_transaction_id,
          raw_status_check: hubtelData,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      await logAdminAction({
        action_type: 'MANUAL_HUBTEL_APPROVAL',
        admin_id: adminUser.id,
        target_id: transaction.id,
        description: `Admin manually verified and approved Hubtel deposit: ₵${creditAmount}`,
        metadata: {
          transaction_id: transaction.id,
          clientReference: targetRef,
          amount: creditAmount,
          hubtelData
        },
        req
      });

      return res.status(200).json({
        success: true,
        status: 'approved',
        message: 'Deposit verified and approved successfully',
        reference: targetRef,
        hubtelStatus: transactionStatus || 'Paid',
        updateResult: {
          success: true,
          oldStatus: transaction.status,
          newStatus: 'approved',
          balanceUpdated: true,
          newBalance: approvalResult?.new_balance
        },
        hubtelResponse: hubtelData
      });
    } else if (transactionStatus === 'Failed' || transactionStatus === 'Rejected') {
      await supabase
        .from('transactions')
        .update({
          status: 'rejected',
          client_reference: targetRef,
          raw_status_check: hubtelData,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      await logAdminAction({
        action_type: 'MANUAL_HUBTEL_REJECTION',
        admin_id: adminUser.id,
        target_id: transaction.id,
        description: `Admin verified Hubtel deposit as failed/rejected`,
        metadata: {
          transaction_id: transaction.id,
          clientReference: targetRef,
          transactionStatus,
          hubtelData
        },
        req
      });

      return res.status(200).json({
        success: true,
        status: 'rejected',
        message: 'Deposit verified and marked as rejected (payment failed)',
        reference: targetRef,
        hubtelStatus: transactionStatus,
        updateResult: {
          success: true,
          oldStatus: transaction.status,
          newStatus: 'rejected'
        },
        hubtelResponse: hubtelData
      });
    } else {
      // Pending, Unpaid, or other non-terminal status
      await supabase
        .from('transactions')
        .update({
          client_reference: targetRef,
          raw_status_check: hubtelData,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      return res.status(200).json({
        success: true,
        status: transaction.status,
        message: `Hubtel payment status: ${transactionStatus || 'Unpaid / Pending'}`,
        reference: targetRef,
        hubtelStatus: transactionStatus || 'Unpaid',
        updateResult: {
          success: true,
          oldStatus: transaction.status,
          newStatus: transaction.status
        },
        hubtelResponse: hubtelData
      });
    }
  } catch (error) {
    console.error('[MANUAL-VERIFY HUBTEL] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
