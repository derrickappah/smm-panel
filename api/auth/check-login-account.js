/**
 * Pre-Login Verification & Device Binding Endpoint
 * 
 * Path: /api/auth/check-login-account
 * 
 * Checks if the target account or incoming device is banned.
 * If the account is banned, immediately binds the device to the banned account
 * and marks the device as banned in user_devices + Redis cache.
 */

import { setCorsHeaders } from '../utils/corsHeaders.js';
import { getServiceRoleClient } from '../utils/auth.js';
import { resolveDevice, banDeviceInDatabase } from '../utils/deviceAuth.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    // 1. First check if current device itself is already banned
    const { deviceId, deviceHash, isBanned, deviceRecord } = await resolveDevice(req, res);

    if (isBanned) {
      return res.status(403).json({
        allowed: false,
        isBanned: true,
        error: 'Access to this service is currently unavailable.'
      });
    }

    if (!cleanEmail) {
      return res.status(200).json({ allowed: true });
    }

    // 2. Lookup if the account with this email is banned
    const supabase = getServiceRoleClient();

    // Check profiles by email
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', cleanEmail)
      .maybeSingle();

    let isAccountBanned = false;
    let targetUserId = profile?.id;

    if (targetUserId) {
      const { data: bannedUser } = await supabase
        .from('banned_users')
        .select('user_id')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (bannedUser) {
        isAccountBanned = true;
      } else {
        const { data: authUser } = await supabase.auth.admin.getUserById(targetUserId);
        if (authUser?.user?.banned_until && new Date(authUser.user.banned_until) > new Date()) {
          isAccountBanned = true;
        }
      }
    }

    // 3. If account is banned, immediately mark THIS device as restricted!
    if (isAccountBanned) {
      await banDeviceInDatabase({
        deviceHash,
        userId: targetUserId,
        reason: 'Attempted login with suspended account'
      });

      return res.status(403).json({
        allowed: false,
        isBanned: true,
        error: 'Access to this service is currently unavailable.'
      });
    }

    return res.status(200).json({ allowed: true });
  } catch (error) {
    console.error('Check login account exception:', error);
    return res.status(200).json({ allowed: true });
  }
}
