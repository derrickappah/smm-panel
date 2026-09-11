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
import { logSecurityEvent } from '../utils/activityLogger.js';

function normalizePhone(phone) {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (!cleaned) return '';
  if (cleaned.length === 12 && cleaned.startsWith('233')) {
    cleaned = '0' + cleaned.substring(3);
  } else if (cleaned.length === 9) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, phone_number, identifier } = req.body || {};
    const rawIdentifier = (identifier || phone_number || email || '').trim();
    const isEmail = rawIdentifier.includes('@');
    const cleanEmail = isEmail ? rawIdentifier.toLowerCase() : '';
    const normPhone = !isEmail ? normalizePhone(rawIdentifier) : '';

    // 1. First check if current device itself is already banned
    const { deviceId, deviceHash, isBanned, deviceRecord } = await resolveDevice(req, res);

    if (isBanned) {
      try {
        await logSecurityEvent({
          user_id: deviceRecord?.user_id || null,
          action_type: 'BANNED_DEVICE_PRELOGIN_BLOCKED',
          description: 'Pre-login access blocked for restricted device',
          metadata: {
            device_id_hash_prefix: deviceHash ? deviceHash.substring(0, 12) + '...' : null,
            attempted_identifier: rawIdentifier || null
          },
          req
        });
      } catch (e) {}

      return res.status(403).json({
        allowed: false,
        isBanned: true,
        error: 'Access to this service is currently unavailable.'
      });
    }

    if (!cleanEmail && (!normPhone || normPhone.length < 10)) {
      return res.status(200).json({ allowed: true });
    }

    // 2. Lookup if the account with this email or phone is banned
    const supabase = getServiceRoleClient();

    let query = supabase.from('profiles').select('id, email');
    if (cleanEmail) {
      query = query.eq('email', cleanEmail);
    } else {
      query = query
        .or('phone_number.eq.' + normPhone + ',phone_number.eq.+233' + normPhone.substring(1) + ',phone_number.eq.233' + normPhone.substring(1))
        .order('created_at', { ascending: false })
        .limit(1);
    }

    const { data: profile } = await query.maybeSingle();

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

      try {
        await logSecurityEvent({
          user_id: targetUserId || null,
          action_type: 'BANNED_ACCOUNT_LOGIN_BLOCKED',
          description: `Login attempt on suspended account ${rawIdentifier}, associated device was restricted.`,
          metadata: {
            user_id: targetUserId,
            identifier: rawIdentifier,
            device_id_hash_prefix: deviceHash ? deviceHash.substring(0, 12) + '...' : null
          },
          req
        });
      } catch (e) {}

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
