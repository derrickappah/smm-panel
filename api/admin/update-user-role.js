/**
 * Admin API Endpoint to Update User Role (user, admin, reseller, support)
 * 
 * Path: /api/admin/update-user-role
 */

import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { logAdminAction } from '../utils/activityLogger.js';
import { redis } from '../utils/redisClient.js';

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

    const { userId, newRole } = req.body;

    if (!userId || !newRole) {
      return res.status(400).json({ error: 'Missing required fields: userId and newRole' });
    }

    const allowedRoles = ['user', 'admin', 'reseller', 'support'];
    if (!allowedRoles.includes(newRole.toLowerCase())) {
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${allowedRoles.join(', ')}` });
    }

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    // 2. Fetch target profile
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('id', userId)
      .single();

    if (profileError || !targetProfile) {
      return res.status(404).json({ error: 'Target user profile not found' });
    }

    const oldRole = targetProfile.role || 'user';

    // Prevent demoting self from admin if single admin
    if (userId === authResult.user.id && newRole !== 'admin') {
      return res.status(400).json({ error: 'You cannot demote your own admin account' });
    }

    // 3. Update profile role
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({ role: newRole.toLowerCase(), updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update user role:', updateError);
      return res.status(500).json({ error: 'Failed to update user role in database' });
    }

    // Invalidate and update Redis role cache immediately
    if (redis) {
      try {
        await redis.set(`smm:user:${userId}:role`, newRole.toLowerCase(), { ex: 300 });
      } catch (cacheErr) {
        console.warn('Role cache update warning:', cacheErr);
      }
    }

    // 4. Log admin action
    try {
      const isPrivilegeEscalation = newRole.toLowerCase() === 'admin' && oldRole.toLowerCase() !== 'admin';
      await logAdminAction({
        user_id: authResult.user.id,
        action_type: isPrivilegeEscalation ? 'PRIVILEGE_ESCALATION_ADMIN' : 'UPDATE_USER_ROLE',
        entity_type: 'profile',
        entity_id: userId,
        description: `Changed role for ${targetProfile.name || targetProfile.email} from ${oldRole} to ${newRole}`,
        metadata: { userId, targetEmail: targetProfile.email, oldRole, newRole, escalatedBy: authResult.user.email },
        severity: isPrivilegeEscalation ? 'security' : 'info',
        req
      });
    } catch (logErr) {
      console.error('Failed to log admin role update:', logErr);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully changed role for ${targetProfile.name || targetProfile.email} to ${newRole}`,
      user: {
        id: updatedProfile.id,
        name: updatedProfile.name,
        email: updatedProfile.email,
        oldRole,
        newRole: updatedProfile.role
      }
    });

  } catch (err) {
    console.error('Update user role endpoint error:', err);
    return res.status(500).json({
      error: 'Internal server error during role update',
      message: err.message
    });
  }
}
