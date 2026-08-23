/**
 * Admin API Endpoint to Unban a User
 * 
 * Path: /api/admin/unban-user
 */

import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { logAdminAction } from '../utils/activityLogger.js';
import { deleteCached, setCached } from '../utils/redisClient.js';

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

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    const supabase = getServiceRoleClient();

    // 2. Fetch the target user profile to get email and name for logging
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('id', userId)
      .single();

    // 3. Unban the user in Supabase auth.users
    const { error: unbanError } = await supabase.auth.admin.updateUserById(
      userId,
      { ban_duration: 'none' }
    );

    if (unbanError) {
      console.error('Error unbanning user in Auth:', unbanError);
    }

    // 4. Remove from banned_users table
    await supabase.from('banned_users').delete().eq('user_id', userId);

    // 5. Clear Redis ban cache
    const banCacheKey = `smm:user:${userId}:banned`;
    await deleteCached(banCacheKey);
    await setCached(banCacheKey, 'false', 60);

    // 6. Log the action
    await logAdminAction({
      user_id: adminUser.id,
      action_type: 'admin_unbanned_user',
      entity_type: 'user',
      entity_id: userId,
      description: `Unbanned user ${profile?.name || ''} (${profile?.email || userId})`,
      metadata: {
        unbanned_user_id: userId,
        unbanned_user_email: profile?.email
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: `Successfully unbanned user.`
    });

  } catch (error) {
    console.error('Exception in unban-user handler:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
