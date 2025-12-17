/**
 * Moolre Web Payment Callback Handler
 * 
 * This function handles server-to-server callbacks from Moolre Web after payment completion.
 * It verifies the payment and automatically updates the transaction status and user balance.
 * 
 * Environment Variables Required:
 * - MOOLRE_API_USER: Your Moolre username
 * - MOOLRE_API_PUBKEY: Your Moolre public API key
 * - MOOLRE_ACCOUNT_NUMBER: Your Moolre account number
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (for server-side operations)
 * 
 * Callback URL to configure in Moolre Dashboard:
 * https://your-domain.com/api/moolre-web-callback
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow both POST (webhook) and GET (redirect callback) requests
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Supabase credentials not configured');
      return res.status(500).json({ 
        error: 'Server configuration error' 
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get reference from query params (GET) or body (POST)
    const reference = req.query.ref || req.query.reference || req.body.ref || req.body.reference;

    if (!reference) {
      console.error('Missing reference in callback');
      return res.status(400).json({
        error: 'Missing required field: reference'
      });
    }

    console.log('[MOOLRE WEB CALLBACK] Received callback for reference:', reference);

    // Get Moolre credentials
    const moolreApiUser = process.env.MOOLRE_API_USER;
    const moolreApiPubkey = process.env.MOOLRE_API_PUBKEY;
    const moolreAccountNumber = process.env.MOOLRE_ACCOUNT_NUMBER;
    
    if (!moolreApiUser || !moolreApiPubkey || !moolreAccountNumber) {
      console.error('[MOOLRE WEB CALLBACK] Moolre credentials not configured');
      return res.status(500).json({
        error: 'Moolre is not configured on the server'
      });
    }

    // Verify payment directly with Moolre API
    const moolreResponse = await fetch('https://api.moolre.com/open/transact/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-USER': moolreApiUser,
        'X-API-PUBKEY': moolreApiPubkey
      },
      body: JSON.stringify({
        type: 1,
        idtype: 1, // 1 = Unique externalref, 2 = Moolre Generated ID
        id: reference, // The externalref to check
        accountnumber: moolreAccountNumber
      })
    });

    const moolreData = await moolreResponse.json();

    if (!moolreResponse.ok || moolreData.status === 0) {
      console.error('[MOOLRE WEB CALLBACK] Moolre verification error:', moolreData);
      return res.status(moolreResponse.status || 500).json({
        error: moolreData.message || 'Failed to verify Moolre payment',
        code: moolreData.code
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

    const verifyData = {
      success: true,
      status: paymentStatus,
      txstatus: txstatus,
      data: moolreData.data,
      code: moolreData.code,
      message: moolreData.message,
      reference: moolreData.data?.externalref || reference
    };

    // Find transaction by reference
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id, user_id, type, amount, status, deposit_method, moolre_web_reference, moolre_web_status, created_at')
      .eq('moolre_web_reference', reference)
      .order('created_at', { ascending: false })
      .limit(1);

    if (txError || !transactions || transactions.length === 0) {
      console.error('[MOOLRE WEB CALLBACK] Transaction not found for reference:', reference);
      return res.status(404).json({
        error: 'Transaction not found'
      });
    }

    const transaction = transactions[0];

    // Check payment status
    const paymentStatus = verifyData.status;
    const txstatus = verifyData.txstatus; // 1=Success, 0=Pending, 2=Failed
    const isSuccessful = paymentStatus === 'success' || txstatus === 1;
    const isFailed = paymentStatus === 'failed' || txstatus === 2;

    console.log('[MOOLRE WEB CALLBACK] Payment status:', {
      reference,
      transactionId: transaction.id,
      paymentStatus,
      txstatus,
      isSuccessful,
      isFailed,
      currentStatus: transaction.status
    });

    // Handle successful payment
    if (isSuccessful && transaction.status !== 'approved') {
      console.log('[MOOLRE WEB CALLBACK] Processing successful payment for transaction:', transaction.id);

      // Update transaction to approved
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'approved',
          moolre_web_status: 'success',
          moolre_web_reference: reference
        })
        .eq('id', transaction.id);

      if (updateError) {
        console.error('[MOOLRE WEB CALLBACK] Error updating transaction:', updateError);
        return res.status(500).json({
          error: 'Payment verified but failed to update transaction'
        });
      }

      // Update user balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', transaction.user_id)
        .single();

      if (profileError) {
        console.error('[MOOLRE WEB CALLBACK] Error fetching profile:', profileError);
        return res.status(500).json({
          error: 'Payment verified but failed to fetch profile'
        });
      }

      const currentBalance = parseFloat(profile.balance || 0);
      const newBalance = currentBalance + parseFloat(transaction.amount);

      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', transaction.user_id);

      if (balanceError) {
        console.error('[MOOLRE WEB CALLBACK] Error updating balance:', balanceError);
        return res.status(500).json({
          error: 'Payment verified but failed to update balance'
        });
      }

      console.log('[MOOLRE WEB CALLBACK] Successfully processed payment:', {
        transactionId: transaction.id,
        userId: transaction.user_id,
        amount: transaction.amount,
        newBalance
      });

      // Return success response
      return res.status(200).json({
        success: true,
        message: 'Payment processed successfully',
        transactionId: transaction.id,
        status: 'approved'
      });
    }

    // Handle failed payment
    if (isFailed && transaction.status !== 'rejected') {
      console.log('[MOOLRE WEB CALLBACK] Processing failed payment for transaction:', transaction.id);

      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'rejected',
          moolre_web_status: 'failed',
          moolre_web_reference: reference
        })
        .eq('id', transaction.id);

      if (updateError) {
        console.error('[MOOLRE WEB CALLBACK] Error updating failed transaction:', updateError);
      }

      return res.status(200).json({
        success: true,
        message: 'Payment failure recorded',
        transactionId: transaction.id,
        status: 'rejected'
      });
    }

    // Payment is still pending or already processed
    return res.status(200).json({
      success: true,
      message: 'Payment status checked',
      transactionId: transaction.id,
      status: transaction.status
    });

  } catch (error) {
    console.error('[MOOLRE WEB CALLBACK] Error processing callback:', error);
    // Return 200 to prevent Moolre from retrying if it's a transient error
    return res.status(200).json({ 
      received: true, 
      error: error.message 
    });
  }
}
