/**
 * Admin API Endpoint to Revoke All Active Sessions for a User
 * 
 * Path: /api/admin/revoke-user-sessions
 */

import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { logAdminAction } from '../utils/activityLogger.js';
import { setCached } from '../utils/redisClient.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user: adminUser } = await verifyAdmin(req);
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    const supabase = getServiceRoleClient();

    // 1. Invalidate active token sessions immediately in cache
    const currentUnix = Math.floor(Date.now() / 1000);
    await setCached(`smm:user:${userId}:sessions_revoked_at`, currentUnix.toString(), 3600);

    // 2. Sign out all sessions for the target user in Supabase Auth
    const { error: signOutError } = await supabase.auth.admin.signOut(userId);

    if (signOutError) {
      console.error('Error signing out user:', signOutError);
      return res.status(500).json({
        error: 'Failed to revoke user sessions',
        details: signOutError.message
      });
    }

    // 2. Fetch user profile for logging
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', userId)
      .maybeSingle();

    // 3. Log the admin action
    await logAdminAction({
      user_id: adminUser.id,
      action_type: 'USER_SESSION_REVOCATION',
      entity_type: 'user',
      entity_id: userId,
      description: `Revoked all active sessions and refresh tokens for ${profile?.name || ''} (${profile?.email || userId})`,
      metadata: {
        action: 'USER_SESSION_REVOCATION',
        target_user_id: userId,
        target_user_email: profile?.email || null,
        revoked_by: adminUser.email || adminUser.id
      },
      severity: 'security',
      req
    });

    return res.status(200).json({
      success: true,
      message: 'All active user sessions revoked successfully.'
    });
  } catch (error) {
    console.error('Error revoking sessions:', error);
    return res.status(500).json({
      error: 'Failed to revoke sessions',
      message: error.message
    });
  }
}
