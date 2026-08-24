/**
 * Admin API Endpoint to Update User Balance (Credit / Debit / Set)
 * 
 * Path: /api/admin/update-user-balance
 */

import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { logAdminAction } from '../utils/activityLogger.js';

export default async function handler(req, res) {
  // CORS Headers
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
    let authResult;
    try {
      authResult = await verifyAdmin(req);
    } catch (authError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: authError.message
      });
    }

    const { userId, action = 'add', amount, reason = '' } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: 'Amount must be a non-negative number' });
    }

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    // 2. Fetch current user profile
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, balance')
      .eq('id', userId)
      .single();

    if (profileError || !targetProfile) {
      return res.status(404).json({ error: 'Target user profile not found' });
    }

    const currentBalance = Number(targetProfile.balance || 0);
    let newBalance = currentBalance;

    if (action === 'add') {
      newBalance = currentBalance + parsedAmount;
    } else if (action === 'deduct') {
      newBalance = Math.max(0, currentBalance - parsedAmount);
    } else if (action === 'set') {
      newBalance = parsedAmount;
    } else {
      return res.status(400).json({ error: 'Invalid action. Must be add, deduct, or set' });
    }

    // Round to 2 decimal places
    newBalance = Math.round(newBalance * 100) / 100;

    // 3. Update profile balance
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update user balance:', updateError);
      return res.status(500).json({ error: 'Failed to update balance in database' });
    }

    // 4. Log in balance_audit_log if table exists
    try {
      await supabase.from('balance_audit_log').insert({
        admin_id: authResult.user.id,
        user_id: userId,
        action,
        previous_balance: currentBalance,
        new_balance: newBalance,
        amount_changed: parsedAmount,
        reason: reason || `Admin balance update (${action})`
      });
    } catch (auditErr) {
      // Non-fatal if audit table does not exist
      console.warn('Balance audit logging warning:', auditErr);
    }

    // 5. Log activity
    try {
      await logAdminAction({
        user_id: authResult.user.id,
        action_type: 'ADMIN_BALANCE_OVERRIDE',
        entity_type: 'profile',
        entity_id: userId,
        description: `Admin balance adjustment for ${targetProfile.name || targetProfile.email}: ${action} ₵${parsedAmount} (Previous: ₵${currentBalance}, New: ₵${newBalance})`,
        metadata: {
          action: 'ADMIN_BALANCE_OVERRIDE',
          user_id: userId,
          target_email: targetProfile.email,
          adjustment_type: action,
          amount_changed: parsedAmount,
          previous_balance: `₵${currentBalance}`,
          new_balance: `₵${newBalance}`,
          reason: reason || 'Manual Admin Adjustment',
          performed_by: authResult.user.email || authResult.user.id
        },
        severity: 'security',
        req
      });
    } catch (logErr) {
      console.error('Failed to log admin balance update:', logErr);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully updated balance for ${targetProfile.name || targetProfile.email}`,
      user: {
        id: updatedProfile.id,
        name: updatedProfile.name,
        email: updatedProfile.email,
        previousBalance: currentBalance,
        newBalance: updatedProfile.balance
      }
    });

  } catch (err) {
    console.error('Update user balance endpoint error:', err);
    return res.status(500).json({
      error: 'Internal server error during balance update',
      message: err.message
    });
  }
}
