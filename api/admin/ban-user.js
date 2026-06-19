/**
 * Admin API Endpoint to Ban a User and reject their pending deposit transactions.
 * 
 * Path: /api/admin/ban-user
 */

import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { logAdminAction } from '../utils/activityLogger.js';

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

    const { userId, reason, rejectPending = true } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    const supabase = getServiceRoleClient();

    // 2. Fetch the target user profile to get email, IP, and fingerprint for harvesting/logging
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, name, registration_ip, device_fingerprint')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Guard: Prevent banning another admin or ourselves
    const { data: targetAdminCheck } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (targetAdminCheck?.role === 'admin') {
      return res.status(403).json({ error: 'Access denied: Cannot ban another administrator' });
    }

    const banReason = reason || 'Deposit exploit / suspicious activity';

    // 3. Ban the user in Supabase auth.users
    // We set ban_duration: '87600h' (10 years)
    const { error: banError } = await supabase.auth.admin.updateUserById(
      userId,
      { ban_duration: '87600h' }
    );

    if (banError) {
      console.error('Error banning user in Auth:', banError);
      return res.status(500).json({
        error: 'Failed to ban user in auth system',
        details: banError.message
      });
    }

    // 4. Manually harvest and insert identifiers into banned_identifiers to be absolutely sure
    const bannedItems = [];

    // Add device fingerprint
    if (profile.device_fingerprint && profile.device_fingerprint.trim()) {
      bannedItems.push({
        type: 'fingerprint',
        value: profile.device_fingerprint.trim(),
        reason: `Linked to banned user ${profile.email || userId}. Reason: ${banReason}`
      });
    }

    // Upsert banned identifiers
    if (bannedItems.length > 0) {
      const { error: upsertError } = await supabase
        .from('banned_identifiers')
        .upsert(bannedItems, { onConflict: 'value' });

      if (upsertError) {
        console.error('Error inserting banned identifiers:', upsertError);
      }
    }

    // 5. Reject pending transactions if requested
    let rejectedCount = 0;
    if (rejectPending) {
      // Find all pending deposit transactions for this user
      const { data: pendingTx, error: txFetchError } = await supabase
        .from('transactions')
        .select('id, deposit_method, payment_method')
        .eq('user_id', userId)
        .eq('type', 'deposit')
        .eq('status', 'pending');

      if (!txFetchError && pendingTx && pendingTx.length > 0) {
        rejectedCount = pendingTx.length;
        
        for (const tx of pendingTx) {
          const method = tx.deposit_method || tx.payment_method;
          const updatePayload = { status: 'rejected' };
          
          if (method === 'korapay') {
            updatePayload.korapay_status = 'failed';
          } else if (method === 'moolre' || method === 'moolre_web') {
            updatePayload.moolre_status = 'failed';
          } else if (method === 'paystack') {
            updatePayload.paystack_status = 'failed';
          }

          await supabase
            .from('transactions')
            .update(updatePayload)
            .eq('id', tx.id);
        }
      }
    }

    // 6. Log the action
    await logAdminAction({
      user_id: adminUser.id,
      action_type: 'admin_banned_user',
      entity_type: 'user',
      entity_id: userId,
      description: `Banned user ${profile.name} (${profile.email || userId}) for: ${banReason}. Rejected ${rejectedCount} pending deposit(s).`,
      metadata: {
        banned_user_id: userId,
        banned_user_email: profile.email,
        reason: banReason,
        rejected_transactions_count: rejectedCount,
        harvested_identifiers_count: bannedItems.length
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: `Successfully banned user and rejected ${rejectedCount} pending deposit(s).`,
      banned_identifiers_count: bannedItems.length,
      rejected_transactions_count: rejectedCount
    });

  } catch (error) {
    console.error('Exception in ban-user handler:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
