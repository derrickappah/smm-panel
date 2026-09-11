import { getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { redis } from '../utils/redisClient.js';
import { logSecurityEvent } from '../utils/activityLogger.js';
import crypto from 'crypto';

// In-memory fallback tracking for when Redis is unavailable
const memoryResetCounts = new Map();

if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of memoryResetCounts.entries()) {
      if (now - record.firstAttempt > 600000) {
        memoryResetCounts.delete(key);
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

function maskEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return user[0] + '*@' + domain;
  return user[0] + '*'.repeat(user.length - 2) + user.slice(-1) + '@' + domain;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { phone_number, code, new_password } = req.body;
    const normPhone = normalizePhone(phone_number);
    const userCode = (code || '').trim();
    const password = (new_password || '').trim();

    if (!normPhone || normPhone.length < 10) {
      return res.status(400).json({ error: 'A valid 10-digit WhatsApp / phone number is required.' });
    }

    if (!userCode || userCode.length !== 6) {
      return res.status(400).json({ error: 'A 6-digit OTP code is required.' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const hasNumber = /\d/.test(password);
    const hasLetter = /[a-zA-Z]/.test(password);
    if (!hasNumber || !hasLetter) {
      return res.status(400).json({ error: 'Password must contain both letters and numbers for account security.' });
    }

    // Rate limiting: Brute-force protection - max 5 attempts per phone number per 10 mins
    let isBruteForced = false;
    const bruteForceKey = 'smm:reset:verify:' + normPhone;

    if (redis) {
      try {
        const attempts = await redis.incr(bruteForceKey);
        if (attempts === 1) await redis.expire(bruteForceKey, 600);
        if (attempts > 5) isBruteForced = true;
      } catch (redisErr) {
        console.warn('[RESET PASSWORD BRUTE FORCE] Redis error, using memory fallback:', redisErr.message);
      }
    }

    if (!redis || !isBruteForced) {
      const now = Date.now();
      const memRecord = memoryResetCounts.get(normPhone);
      if (memRecord) {
        if (now - memRecord.firstAttempt > 600000) {
          memoryResetCounts.set(normPhone, { count: 1, firstAttempt: now });
        } else {
          memRecord.count += 1;
          if (memRecord.count > 5) isBruteForced = true;
        }
      } else {
        memoryResetCounts.set(normPhone, { count: 1, firstAttempt: now });
      }
    }

    if (isBruteForced) {
      return res.status(429).json({
        error: 'Too many failed attempts. Your reset code has been invalidated. Please request a new code.'
      });
    }

    const supabase = getServiceRoleClient();

    // Query recent OTP generated for this phone number
    const { data: events, error: eventErr } = await supabase
      .from('system_events')
      .select('id, metadata, created_at')
      .eq('event_type', 'otp_generated')
      .or('metadata->>identifier.eq.' + normPhone + ',metadata->>identifier.eq.+233' + normPhone.substring(1) + ',metadata->>identifier.eq.233' + normPhone.substring(1))
      .order('created_at', { ascending: false })
      .limit(1);

    if (eventErr || !events || events.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP code. Please request a new reset code.' });
    }

    const matchingEvent = events[0];
    const meta = matchingEvent.metadata || {};
    const storedHash = meta.otp_hash || '';
    const storedSalt = meta.salt || '';
    const dbAttempts = Number(meta.attempts || 0);

    if (meta.invalidated || dbAttempts >= 5) {
      return res.status(429).json({
        error: 'Too many verification attempts. Your reset code has been invalidated. Please request a new code.'
      });
    }

    const computedHash = crypto.createHash('sha256').update(storedSalt + userCode).digest('hex');
    const notExpired = new Date(meta.expires_at) > new Date();
    const notVerified = !meta.verified;

    let hashesMatch = false;
    try {
      const computedBuf = Buffer.from(computedHash, 'hex');
      const storedBuf = Buffer.from(storedHash, 'hex');
      if (computedBuf.length === storedBuf.length && computedBuf.length > 0) {
        hashesMatch = crypto.timingSafeEqual(computedBuf, storedBuf);
      }
    } catch (e) {
      hashesMatch = false;
    }

    if (!hashesMatch || !notExpired || !notVerified) {
      const newAttempts = dbAttempts + 1;
      const isNowInvalidated = newAttempts >= 5;

      try {
        await supabase.from('system_events').update({
          metadata: {
            ...meta,
            attempts: newAttempts,
            invalidated: isNowInvalidated
          }
        }).eq('id', matchingEvent.id);
      } catch (dbErr) {
        console.error('[RESET PASSWORD] Failed to update event attempts:', dbErr);
      }

      if (isNowInvalidated) {
        try {
          await logSecurityEvent({
            action_type: 'password_reset_brute_force_detected',
            description: 'Password reset brute force threshold exceeded for ' + normPhone,
            metadata: { phone: normPhone, attempts: newAttempts },
            req
          });
        } catch (e) {}

        return res.status(429).json({
          error: 'Too many failed verification attempts. Your reset code has been invalidated. Please request a new code.'
        });
      }

      return res.status(400).json({ error: 'Invalid or expired OTP code. Please check and try again.' });
    }

    // OTP is valid! Find user account by phone number in public.profiles (order by newest account in case of legacy duplicates)
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('id, email, name, created_at')
      .or('phone_number.eq.' + normPhone + ',phone_number.eq.+233' + normPhone.substring(1) + ',phone_number.eq.233' + normPhone.substring(1))
      .order('created_at', { ascending: false })
      .limit(1);

    if (profileErr || !profiles || profiles.length === 0) {
      return res.status(404).json({
        error: 'No registered user account found associated with this phone number.'
      });
    }

    const userProfile = profiles[0];
    const userId = userProfile.id;

    // Update user password in Supabase auth.users using Admin API
    const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(userId, {
      password: password
    });

    if (updateAuthErr) {
      console.error('[RESET PASSWORD] Failed to update password via admin API:', updateAuthErr);
      return res.status(500).json({ error: 'Failed to update password. Please try again later.' });
    }

    // Invalidate the OTP so it cannot be used again
    try {
      await supabase.from('system_events').update({
        metadata: { ...meta, verified: true, used_at: new Date().toISOString() }
      }).eq('id', matchingEvent.id);
    } catch (dbErr) {
      console.error('[RESET PASSWORD] Failed to mark OTP as verified:', dbErr);
    }

    // Clear rate limit counters
    if (redis) {
      try {
        await redis.del(bruteForceKey);
      } catch (redisErr) {}
    }

    // Log security event
    try {
      await logSecurityEvent({
        action_type: 'password_reset_success',
        description: 'Password reset successfully via phone OTP for user ' + userProfile.email,
        user_id: userId,
        metadata: { phone: normPhone, email: userProfile.email },
        req
      });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully! You can now log in with your new password.',
      email_hint: maskEmail(userProfile.email)
    });
  } catch (err) {
    console.error('[RESET PASSWORD] Unexpected error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
}
