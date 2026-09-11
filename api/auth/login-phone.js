import { getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { redis } from '../utils/redisClient.js';
import { resolveDevice, banDeviceInDatabase } from '../utils/deviceAuth.js';
import { logSecurityEvent } from '../utils/activityLogger.js';
import { createClient } from '@supabase/supabase-js';

// In-memory fallback tracking for when Redis is unavailable
const memoryLoginCounts = new Map();

if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of memoryLoginCounts.entries()) {
      if (now - record.firstAttempt > 900000) {
        memoryLoginCounts.delete(key);
      }
    }
  }, 60000);
  if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
}

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
    const { phone_number, password, captchaToken, captcha_token } = req.body || {};
    const normPhone = normalizePhone(phone_number);
    const userPassword = (password || '').trim();
    const useCaptcha = captchaToken || captcha_token || undefined;

    if (!normPhone || normPhone.length !== 10) {
      return res.status(400).json({ error: 'A valid 10-digit WhatsApp / phone number is required.' });
    }

    if (!userPassword) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    // 1. Check device restriction
    const { deviceId, deviceHash, isBanned: deviceBanned, deviceRecord } = await resolveDevice(req, res);
    if (deviceBanned) {
      try {
        await logSecurityEvent({
          user_id: deviceRecord?.user_id || null,
          action_type: 'BANNED_DEVICE_PRELOGIN_BLOCKED',
          description: 'Pre-login access blocked for restricted device on phone login',
          metadata: {
            device_id_hash_prefix: deviceHash ? deviceHash.substring(0, 12) + '...' : null,
            phone: normPhone
          },
          req
        });
      } catch (e) {}

      return res.status(403).json({
        error: 'Access to this service is currently unavailable.'
      });
    }

    // 2. Rate limiting & Brute force protection: Max 5 failed attempts per phone per 15 minutes
    const bruteForceKey = 'smm:login:phone:' + normPhone;
    let isRateLimited = false;

    if (redis) {
      try {
        const attempts = await redis.get(bruteForceKey);
        if (attempts && parseInt(attempts, 10) >= 5) {
          isRateLimited = true;
        }
      } catch (redisErr) {
        console.warn('[LOGIN PHONE RATE LIMIT] Redis error, using memory fallback:', redisErr.message);
      }
    }

    if (!redis || !isRateLimited) {
      const now = Date.now();
      const memRecord = memoryLoginCounts.get(normPhone);
      if (memRecord) {
        if (now - memRecord.firstAttempt > 900000) {
          memoryLoginCounts.delete(normPhone);
        } else if (memRecord.count >= 5) {
          isRateLimited = true;
        }
      }
    }

    if (isRateLimited) {
      return res.status(429).json({
        error: 'Too many failed login attempts. Please wait 15 minutes before trying again, or reset your password.'
      });
    }

    const supabase = getServiceRoleClient();

    // 3. Lookup user profiles associated with this phone number
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('id, email, phone_number, created_at')
      .or('phone_number.eq.' + normPhone + ',phone_number.eq.+233' + normPhone.substring(1) + ',phone_number.eq.233' + normPhone.substring(1))
      .order('created_at', { ascending: false });

    if (profileErr || !profiles || profiles.length === 0) {
      // Record failed attempt to prevent timing-based user enumeration
      await recordFailedAttempt(normPhone, bruteForceKey);
      return res.status(400).json({ error: 'Invalid phone number or password.' });
    }

    // 4. Initialize client for standard password authentication
    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
    const anonSupabase = createClient(supabaseUrl, supabaseAnonKey);

    let authenticatedSession = null;
    let authenticatedUser = null;
    let authError = null;

    // Iterate through matching profiles (supports legacy accounts with duplicate phone numbers)
    for (const profile of profiles) {
      if (!profile.email) continue;

      // Check if account is banned
      const { data: bannedRecord } = await supabase
        .from('banned_users')
        .select('user_id')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (bannedRecord) {
        // Ban device immediately
        await banDeviceInDatabase({
          deviceHash,
          userId: profile.id,
          reason: 'Attempted login with suspended account via phone'
        });

        try {
          await logSecurityEvent({
            user_id: profile.id,
            action_type: 'BANNED_ACCOUNT_LOGIN_BLOCKED',
            description: `Login attempt on suspended account via phone ${normPhone}`,
            metadata: { user_id: profile.id, phone: normPhone },
            req
          });
        } catch (e) {}

        return res.status(403).json({ error: 'Access to this service is currently unavailable.' });
      }

      // Attempt sign in with email and password
      const { data: authData, error: signInErr } = await anonSupabase.auth.signInWithPassword({
        email: profile.email,
        password: userPassword,
        options: {
          captchaToken: useCaptcha,
          captcha_token: useCaptcha
        }
      });

      if (!signInErr && authData?.session) {
        authenticatedSession = authData.session;
        authenticatedUser = authData.user;
        break;
      } else {
        authError = signInErr;
      }
    }

    if (!authenticatedSession) {
      await recordFailedAttempt(normPhone, bruteForceKey);

      try {
        await logSecurityEvent({
          action_type: 'LOGIN_FAILED',
          description: 'Failed phone login attempt for ' + normPhone,
          metadata: { phone: normPhone, error: authError?.message || 'Invalid credentials' },
          req
        });
      } catch (e) {}

      if (authError?.message?.includes('Email not confirmed')) {
        return res.status(400).json({ error: 'Please check your email and confirm your account before signing in.' });
      }

      return res.status(400).json({ error: 'Invalid phone number or password.' });
    }

    // 5. Successful login! Clear rate limit counter
    if (redis) {
      try {
        await redis.del(bruteForceKey);
      } catch (e) {}
    }
    memoryLoginCounts.delete(normPhone);

    try {
      await logSecurityEvent({
        user_id: authenticatedUser.id,
        action_type: 'LOGIN_SUCCESS',
        description: 'Successful login via phone number ' + normPhone,
        metadata: { phone: normPhone, email: authenticatedUser.email },
        req
      });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      session: authenticatedSession,
      user: authenticatedUser
    });
  } catch (err) {
    console.error('[LOGIN PHONE] Unexpected error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
}

async function recordFailedAttempt(normPhone, bruteForceKey) {
  if (redis) {
    try {
      const count = await redis.incr(bruteForceKey);
      if (count === 1) {
        await redis.expire(bruteForceKey, 900); // 15 mins
      }
    } catch (e) {}
  }

  const now = Date.now();
  const memRecord = memoryLoginCounts.get(normPhone);
  if (memRecord) {
    memRecord.count += 1;
  } else {
    memoryLoginCounts.set(normPhone, { count: 1, firstAttempt: now });
  }
}
