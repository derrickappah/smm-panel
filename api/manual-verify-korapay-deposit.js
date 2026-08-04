/**
 * Manual Korapay Deposit Verification Endpoint
 * 
 * SECURITY: Requires admin authentication.
 * 
 * Allows admins to manually verify and sync a Korapay deposit transaction by querying Korapay API
 * and updating transaction status & balance if valid.
 */

import { verifyAdmin, getServiceRoleClient } from './utils/auth.js';
import { logAdminAction, logSecurityEvent } from './utils/activityLogger.js';

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
    let adminUser;
    try {
      const authResult = await verifyAdmin(req);
      adminUser = authResult.user;
    } catch (authError) {
      await logSecurityEvent({
        action_type: 'manual_verification_failed',
        description: `Failed manual Korapay verification attempt: ${authError.message}`,
        metadata: {
          transaction_id: req.body?.transactionId || null,
          reference: req.body?.reference || null,
          error: authError.message
        },
        req
      });

      return res.status(401).json({
        error: 'Unauthorized',
        message: authError.message
      });
    }

    const { transactionId, reference } = req.body;

    if (!transactionId && !reference) {
      return res.status(400).json({ error: 'Either transactionId or reference is required' });
    }

    const korapaySecretKey = (process.env.KORAPAY_SECRET_KEY || '').trim();
    if (!korapaySecretKey) {
      return res.status(500).json({ error: 'KORAPAY_SECRET_KEY is not configured on server' });
    }

    const supabase = getServiceRoleClient();

    // Query transaction
    let query = supabase.from('transactions').select('*');
    if (transactionId) {
      query = query.eq('id', transactionId);
    } else {
      query = query.or(`client_reference.eq.${reference},korapay_reference.eq.${reference}`);
    }

    const { data: transaction, error: fetchError } = await query.maybeSingle();

    if (fetchError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const targetRef = transaction.korapay_reference || transaction.client_reference || reference;
    if (!targetRef) {
      return res.status(400).json({ error: 'Transaction has no Korapay reference' });
    }

    // Call Korapay charge verify API
    const korapayResponse = await fetch(`https://api.korapay.com/merchant/api/v1/charges/${targetRef}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${korapaySecretKey}`,
        'Content-Type': 'application/json'
      }
    });

    const korapayData = await korapayResponse.json();

    if (!korapayResponse.ok) {
      return res.status(200).json({
        success: false,
        message: korapayData.message || 'Could not verify transaction with Korapay',
        korapayData
      });
    }

    const chargeData = korapayData.data || {};
    const korapayStatus = chargeData.status;
    const isSuccessful = korapayStatus === 'success';

    let newStatus = transaction.status;
    if (isSuccessful) {
      newStatus = 'approved';
    } else if (korapayStatus === 'failed') {
      newStatus = 'rejected';
    }

    // Update transaction
    await supabase
      .from('transactions')
      .update({
        status: newStatus,
        korapay_reference: targetRef,
        korapay_status: korapayStatus,
        raw_status_check: korapayData,
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id);

    // Credit balance if approved and was not already approved
    if (newStatus === 'approved' && transaction.status !== 'approved') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', transaction.user_id)
        .single();

      if (profile) {
        const newBalance = (parseFloat(profile.balance) || 0) + parseFloat(transaction.amount);
        await supabase
          .from('profiles')
          .update({ balance: newBalance })
          .eq('id', transaction.user_id);

        await logAdminAction({
          admin_id: adminUser.id,
          action_type: 'manual_verify_deposit_success',
          target_user_id: transaction.user_id,
          description: `Admin manually verified & approved Korapay deposit of ₵${transaction.amount}`,
          metadata: { transaction_id: transaction.id, reference: targetRef, korapayData },
          req
        });
      }
    }

    return res.status(200).json({
      success: true,
      status: newStatus,
      amount: transaction.amount,
      korapayStatus,
      reference: targetRef
    });

  } catch (error) {
    console.error('Error in manual Korapay verify:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
