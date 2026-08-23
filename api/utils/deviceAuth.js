/**
 * Persistent Device Identification and Security Utilities
 * 
 * Provides cryptographically secure device identification, HMAC hashing,
 * authoritative cookie management, anonymous device lifecycle, and server-side ban enforcement.
 */

import crypto from 'crypto';
import { getServiceRoleClient } from './auth.js';
import { getCached, setCached, deleteCached } from './redisClient.js';
import { logSecurityEvent } from './activityLogger.js';

// Configuration
const DEVICE_ID_COOKIE_NAME = '__Host-device_id';
const DEVICE_ID_COOKIE_FALLBACK = 'device_id';
const COOKIE_MAX_AGE_SECONDS = 315360000; // 10 years (3650 days)

/**
 * Get secret key for HMAC calculation
 * @returns {string}
 */
function getDeviceSecret() {
  const secret = process.env.DEVICE_ID_SECRET || process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[SECURITY WARNING] DEVICE_ID_SECRET is not configured in production environment!');
    }
    // Fallback deterministic secret for local development environments
    return 'boostupgh_dev_device_secret_fallback_key_2026';
  }
  return secret;
}

/**
 * Generate a cryptographically secure random device identifier (256-bit entropy)
 * @returns {string} 64-character hex string
 */
export function generateDeviceId() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate incoming device ID format and size
 * Rejects malformed, oversized, or invalid tokens before database operations
 * @param {string} deviceId
 * @returns {boolean}
 */
export function isValidDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') return false;
  const trimmed = deviceId.trim();
  // Valid format: 32 to 128 characters, alphanumeric/hex/dashes
  return /^[a-zA-Z0-9_-]{32,128}$/.test(trimmed);
}

/**
 * Compute HMAC-SHA-256 digest of raw device identifier
 * Never store the raw identifier in the database
 * @param {string} deviceId
 * @returns {string} 64-character hex hash
 */
export function hashDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') {
    throw new Error('Invalid deviceId provided for hashing');
  }
  const secret = getDeviceSecret();
  return crypto.createHmac('sha256', secret).update(deviceId.trim()).digest('hex');
}

/**
 * Parse cookies from request header
 * @param {Object} req
 * @returns {Object} Key-value pairs of cookies
 */
export function parseCookies(req) {
  const list = {};
  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });

  return list;
}

/**
 * Extract authoritative device ID from request cookies
 * Checks __Host-device_id first, then falls back to device_id
 * @param {Object} req
 * @returns {string|null}
 */
export function getDeviceIdFromRequest(req) {
  const cookies = parseCookies(req);
  const rawId = cookies[DEVICE_ID_COOKIE_NAME] || cookies[DEVICE_ID_COOKIE_FALLBACK];
  if (rawId && isValidDeviceId(rawId)) {
    return rawId.trim();
  }
  return null;
}

/**
 * Determine if request is over HTTPS
 * @param {Object} req
 * @returns {boolean}
 */
export function isRequestSecure(req) {
  if (!req) return false;
  if (req.connection?.encrypted || req.socket?.encrypted) return true;
  const proto = req.headers?.['x-forwarded-proto'];
  if (proto && proto.split(',')[0].trim().toLowerCase() === 'https') return true;
  const origin = req.headers?.origin || req.headers?.referer;
  if (origin && origin.startsWith('https://')) return true;
  return process.env.NODE_ENV === 'production';
}

/**
 * Serialize device cookies with strict security flags.
 * Sets both device_id and __Host-device_id for maximum browser & proxy compatibility.
 * @param {string} deviceId
 * @param {boolean} isSecure
 * @returns {string[]} Array of Set-Cookie header strings
 */
export function serializeDeviceCookies(deviceId, isSecure = true) {
  const cookies = [];

  if (isSecure) {
    cookies.push([
      `__Host-device_id=${encodeURIComponent(deviceId)}`,
      `Path=/`,
      `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
      `SameSite=Lax`,
      `HttpOnly`,
      `Secure`
    ].join('; '));
  }

  const baseCookie = [
    `device_id=${encodeURIComponent(deviceId)}`,
    `Path=/`,
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    `SameSite=Lax`,
    `HttpOnly`
  ];
  if (isSecure) baseCookie.push('Secure');
  cookies.push(baseCookie.join('; '));

  return cookies;
}

export function serializeDeviceCookie(deviceId, isSecure = true) {
  const cookies = serializeDeviceCookies(deviceId, isSecure);
  return cookies[0];
}

/**
 * Append Set-Cookie headers safely to response
 * @param {Object} res
 * @param {string|string[]} cookieInput
 */
export function appendSetCookie(res, cookieInput) {
  if (!res || !cookieInput) return;
  const newCookies = Array.isArray(cookieInput) ? cookieInput : [cookieInput];
  const existing = res.getHeader('Set-Cookie');
  let combined = [];

  if (existing) {
    if (Array.isArray(existing)) combined = [...existing];
    else combined = [existing];
  }

  combined.push(...newCookies);
  res.setHeader('Set-Cookie', combined);
}

/**
 * Resolve device identity from request, create anonymous record if missing,
 * link user if authenticated, and check ban status.
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object (optional, for setting cookie)
 * @param {Object} [options={}]
 * @param {string} [options.userId=null] - Authenticated user ID to associate
 * @returns {Promise<{ deviceId: string, deviceHash: string, isBanned: boolean, deviceRecord: Object|null, isNew: boolean }>}
 */
export async function resolveDevice(req, res = null, options = {}) {
  const { userId = null } = options;
  const isSecure = isRequestSecure(req);
  let deviceId = getDeviceIdFromRequest(req);
  let isNew = false;

  if (!deviceId) {
    deviceId = generateDeviceId();
    isNew = true;
    if (res) {
      const cookies = serializeDeviceCookies(deviceId, isSecure);
      appendSetCookie(res, cookies);
    }
  }

  const deviceHash = hashDeviceId(deviceId);

  // Fast-Path: Check Redis ban cache
  const banCacheKey = `smm:device:${deviceHash}:banned`;
  let isBannedCached = await getCached(banCacheKey);

  if (isBannedCached === 'true') {
    return {
      deviceId,
      deviceHash,
      isBanned: true,
      deviceRecord: null,
      isNew
    };
  }

  // Database lookup / upsert
  let deviceRecord = null;
  let isBanned = false;

  try {
    const supabase = getServiceRoleClient();
    const userAgent = req?.headers?.['user-agent']?.substring(0, 500) || null;
    const ipAddress = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.headers?.['x-real-ip'] || null;

    // Check existing device
    const { data: existingDevice, error: selectError } = await supabase
      .from('user_devices')
      .select('*')
      .eq('device_id_hash', deviceHash)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') {
      console.warn('Error querying user_devices:', selectError.message);
    }

    // Check if target user is banned
    let targetUserIsBanned = false;
    const checkUserId = userId || existingDevice?.user_id;
    if (checkUserId) {
      const { data: bannedEntry } = await supabase
        .from('banned_users')
        .select('user_id')
        .eq('user_id', checkUserId)
        .maybeSingle();

      if (bannedEntry) {
        targetUserIsBanned = true;
      } else {
        const { data: authUser } = await supabase.auth.admin.getUserById(checkUserId);
        if (authUser?.user?.banned_until && new Date(authUser.user.banned_until) > new Date()) {
          targetUserIsBanned = true;
        }
      }
    }

    if (existingDevice) {
      deviceRecord = existingDevice;
      isBanned = !!existingDevice.is_banned || targetUserIsBanned;

      if (targetUserIsBanned && !existingDevice.is_banned) {
        // Enforce ban on device record immediately
        await supabase
          .from('user_devices')
          .update({
            is_banned: true,
            banned_at: new Date().toISOString(),
            ban_reason: 'Associated account suspended'
          })
          .eq('id', existingDevice.id)
          .catch(() => {});
      }

      // Update Redis cache
      await setCached(banCacheKey, isBanned ? 'true' : 'false', isBanned ? 86400 * 7 : 300);

      // If user is authenticated and device record either has no user_id or needs last_seen updated
      const needsUserLink = userId && (!existingDevice.user_id || existingDevice.user_id !== userId);
      const shouldUpdateLastSeen = !existingDevice.last_seen_at || (Date.now() - new Date(existingDevice.last_seen_at).getTime() > 1000 * 60 * 15); // >15 mins

      if (needsUserLink || shouldUpdateLastSeen) {
        const updatePayload = {
          last_seen_at: new Date().toISOString()
        };
        if (needsUserLink && !existingDevice.user_id) {
          updatePayload.user_id = userId;
        }
        if (ipAddress) updatePayload.ip_address = ipAddress;
        if (userAgent) updatePayload.user_agent = userAgent;

        await supabase
          .from('user_devices')
          .update(updatePayload)
          .eq('id', existingDevice.id)
          .catch(() => {});
      }
    } else {
      // Create new device record (atomic upsert on device_id_hash)
      isBanned = targetUserIsBanned;
      const newDevicePayload = {
        device_id_hash: deviceHash,
        user_id: userId || null,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_banned: isBanned,
        banned_at: isBanned ? new Date().toISOString() : null,
        ban_reason: isBanned ? 'Associated account suspended' : null,
        ip_address: ipAddress,
        user_agent: userAgent
      };

      const { data: inserted, error: insertError } = await supabase
        .from('user_devices')
        .upsert(newDevicePayload, { onConflict: 'device_id_hash' })
        .select()
        .maybeSingle();

      if (!insertError && inserted) {
        deviceRecord = inserted;
        isBanned = !!inserted.is_banned;
      }

      await setCached(banCacheKey, isBanned ? 'true' : 'false', isBanned ? 86400 * 7 : 300);
    }
  } catch (dbErr) {
    console.error('Database exception in resolveDevice:', dbErr.message);
  }

  return {
    deviceId,
    deviceHash,
    isBanned,
    deviceRecord,
    isNew
  };
}

/**
 * Server-side enforcement helper. Checks device status and rejects if banned.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} [userId=null] - Authenticated user ID if known
 * @returns {Promise<{ deviceId: string, deviceHash: string, deviceRecord: Object|null }>}
 * @throws {Error} Throws generic 403 error if device is banned
 */
export async function enforceDeviceNotBanned(req, res = null, userId = null) {
  const { deviceId, deviceHash, isBanned, deviceRecord } = await resolveDevice(req, res, { userId });

  if (isBanned) {
    // Log security event for audit trail
    await logSecurityEvent({
      user_id: userId || deviceRecord?.user_id || null,
      action_type: 'DEVICE_ACCESS_DENIED',
      description: 'Request rejected from restricted device',
      metadata: {
        device_hash_prefix: deviceHash.substring(0, 12) + '...',
        device_id_record: deviceRecord?.id || null
      },
      req
    }).catch(() => {});

    // Return generic error without leaking details
    const banError = new Error('Access to this service is currently unavailable.');
    banError.statusCode = 403;
    banError.code = 'DEVICE_RESTRICTED';
    throw banError;
  }

  return { deviceId, deviceHash, deviceRecord };
}

/**
 * Ban a device in the database and invalidate Redis cache
 * @param {Object} params
 * @param {string} params.deviceHash - HMAC hash of device (or record ID)
 * @param {string} [params.reason='Restricted by admin'] - Ban reason
 * @param {string} [params.adminId=null] - Admin user ID who performed action
 * @param {string} [params.userId=null] - Associated user ID
 * @returns {Promise<{ success: boolean, updatedCount: number }>}
 */
export async function banDeviceInDatabase({ deviceHash, deviceId = null, reason = 'Restricted by admin', adminId = null, userId = null }) {
  const supabase = getServiceRoleClient();
  const banPayload = {
    is_banned: true,
    banned_at: new Date().toISOString(),
    ban_reason: reason,
    banned_by: adminId || null
  };

  let query = supabase.from('user_devices').update(banPayload);

  if (deviceId) {
    query = query.eq('id', deviceId);
  } else if (deviceHash) {
    query = query.eq('device_id_hash', deviceHash);
  } else if (userId) {
    query = query.eq('user_id', userId);
  } else {
    throw new Error('Must provide deviceHash, deviceId, or userId to ban device');
  }

  const { data, error } = await query.select('id, device_id_hash');

  if (error) {
    throw new Error(`Failed to ban device: ${error.message}`);
  }

  // Update Redis cache for all affected device hashes
  if (data && data.length > 0) {
    for (const record of data) {
      if (record.device_id_hash) {
        await setCached(`smm:device:${record.device_id_hash}:banned`, 'true', 86400 * 30);
      }
    }
  }

  return { success: true, updatedCount: data?.length || 0 };
}

/**
 * Unban a device in the database and clear Redis cache
 * @param {Object} params
 * @param {string} [params.deviceHash] - HMAC hash of device
 * @param {string} [params.deviceId] - user_devices record UUID
 * @param {string} [params.userId] - Associated user ID
 * @param {string} [params.adminId=null] - Admin user ID
 * @returns {Promise<{ success: boolean, updatedCount: number }>}
 */
export async function unbanDeviceInDatabase({ deviceHash = null, deviceId = null, userId = null, adminId = null }) {
  const supabase = getServiceRoleClient();
  const unbanPayload = {
    is_banned: false,
    banned_at: null,
    ban_reason: null,
    banned_by: null
  };

  let query = supabase.from('user_devices').update(unbanPayload);

  if (deviceId) {
    query = query.eq('id', deviceId);
  } else if (deviceHash) {
    query = query.eq('device_id_hash', deviceHash);
  } else if (userId) {
    query = query.eq('user_id', userId);
  } else {
    throw new Error('Must provide deviceHash, deviceId, or userId to unban device');
  }

  const { data, error } = await query.select('id, device_id_hash');

  if (error) {
    throw new Error(`Failed to unban device: ${error.message}`);
  }

  // Update Redis cache for all affected device hashes
  if (data && data.length > 0) {
    for (const record of data) {
      if (record.device_id_hash) {
        const cacheKey = `smm:device:${record.device_id_hash}:banned`;
        await deleteCached(cacheKey);
        await setCached(cacheKey, 'false', 60);
      }
    }
  }

  return { success: true, updatedCount: data?.length || 0 };
}
