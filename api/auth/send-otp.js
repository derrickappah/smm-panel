import { getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { redis } from '../utils/redisClient.js';
import crypto from 'crypto';

// In-memory fallback tracking for when Redis is unavailable
const memoryOtpCounts = new Map();

// Periodic cleanup of stale memory entries (older than 10 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of memoryOtpCounts.entries()) {
      if (now - record.firstAttempt > 600000) {
        memoryOtpCounts.delete(key);
      }
    }
  }, 60000);
}

// Format phone number for SMS Gateways (e.g., converts 024XXXXXXX to 23324XXXXXXX)
function formatPhoneForGateway(phone) {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '233' + cleaned.substring(1);
  }
  return cleaned;
}

// Normalize Ghanaian phone number to 0XXXXXXXXX
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

// Send SMS via Moolre Gateway
async function sendViaMoolre(phone, otpCode, purpose, vasKey, senderId) {
  if (!vasKey) return { success: false, provider: 'moolre', error: 'Moolre VAS Key not configured' };
  const recipientPhone = formatPhoneForGateway(phone);
  const smsRef = `ref_otp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const smsPayload = {
    type: 1,
    senderid: senderId || 'Boostupgh',
    messages: [
      {
        recipient: recipientPhone,
        message: purpose === 'reset_password'
          ? `Your BoostUp GH password reset code is: ${otpCode}. Valid for 10 minutes. Do not share this code.`
          : `Your BoostUp GH verification code is: ${otpCode}. Valid for 10 minutes.`,
        ref: smsRef
      }
    ]
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('https://api.moolre.com/open/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-VASKEY': vasKey
      },
      body: JSON.stringify(smsPayload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await res.json();
    console.log('[MOOLRE SMS DISPATCH RESPONSE]', data);

    if (res.ok && data.status === 1) {
      return { success: true, provider: 'moolre', ref: smsRef, data };
    } else {
      return { success: false, provider: 'moolre', error: data.message || 'Moolre SMS delivery failed', data };
    }
  } catch (err) {
    const errMsg = err.name === 'AbortError' ? 'Moolre SMS request timed out (6s)' : (err.message || 'Error connecting to Moolre SMS gateway');
    console.error('[MOOLRE SMS ERROR]', errMsg);
    return { success: false, provider: 'moolre', error: errMsg };
  }
}

// Send SMS via Hubtel Gateway
async function sendViaHubtel(phone, otpCode, purpose, clientId, clientSecret, senderId) {
  if (!clientId || !clientSecret) return { success: false, provider: 'hubtel', error: 'Hubtel credentials not configured' };
  const recipientPhone = formatPhoneForGateway(phone);
  const authHeaderValue = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const payload = {
    From: senderId || 'Boostupgh',
    To: recipientPhone,
    Content: purpose === 'reset_password'
      ? `Your BoostUp GH password reset code is: ${otpCode}. Valid for 10 minutes. Do not share this code.`
      : `Your BoostUp GH verification code is: ${otpCode}. Valid for 10 minutes.`
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    let res;
    try {
      res = await fetch('https://smsc.hubtel.com/v1/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeaderValue
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e) {
      // Fallback endpoint if smsc subdomain is unreachable
      res = await fetch('https://sms.hubtel.com/v1/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeaderValue
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    }
    clearTimeout(timeoutId);

    const data = await res.json();
    console.log('[HUBTEL SMS DISPATCH RESPONSE]', data);

    if (res.ok && (data.status === 0 || data.messageId)) {
      return { success: true, provider: 'hubtel', messageId: data.messageId, data };
    } else {
      return { success: false, provider: 'hubtel', error: data.statusDescription || data.message || 'Hubtel SMS delivery failed', data };
    }
  } catch (err) {
    const errMsg = err.name === 'AbortError' ? 'Hubtel SMS request timed out (6s)' : (err.message || 'Error connecting to Hubtel SMS gateway');
    console.error('[HUBTEL SMS ERROR]', errMsg);
    return { success: false, provider: 'hubtel', error: errMsg };
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, phone_number, purpose = 'signup', requested_provider } = req.body;
    const normPhone = phone_number ? normalizePhone(phone_number) : null;
    const identifier = (normPhone || phone_number || email || '').trim().toLowerCase();

    if (!identifier) {
      return res.status(400).json({ error: 'Email or phone number is required to send OTP' });
    }

    // Check if phone number is already registered for signup
    if (phone_number && purpose === 'signup') {
      const normPhone = normalizePhone(phone_number);
      if (normPhone && normPhone.length >= 10) {
        const supabaseCheck = getServiceRoleClient();
        const { data: isRegistered, error: rpcError } = await supabaseCheck.rpc('check_phone_registered', {
          p_phone: normPhone
        });

        if (!rpcError && isRegistered) {
          return res.status(409).json({
            error: 'Failed to send OTP verification code, number already registered'
          });
        }
      }
    }

    // Check if phone number exists for password reset
    if (phone_number && purpose === 'reset_password') {
      const normPhone = normalizePhone(phone_number);
      if (normPhone && normPhone.length >= 10) {
        const supabaseCheck = getServiceRoleClient();
        const { data: isRegistered, error: rpcError } = await supabaseCheck.rpc('check_phone_registered', {
          p_phone: normPhone
        });

        if (!rpcError && !isRegistered) {
          return res.status(404).json({
            error: 'No account found with this phone number. Please check and try again.'
          });
        }
      }
    }

    // SECURITY: Rate limit OTP sends — max 3 per identifier per 10 minutes
    let rateLimitExceeded = false;

    if (redis) {
      try {
        const rateLimitKey = `smm:otp:send:${identifier}`;
        const currentCount = await redis.incr(rateLimitKey);
        if (currentCount === 1) {
          await redis.expire(rateLimitKey, 600); // 10 minute window
        }
        if (currentCount > 3) {
          rateLimitExceeded = true;
          console.warn(`[OTP RATE LIMIT] Blocked OTP send for ${identifier} (${currentCount} attempts)`);
        }
      } catch (redisErr) {
        console.warn('[OTP RATE LIMIT] Redis error, activating in-memory fallback:', redisErr.message);
      }
    }

    // In-memory rate limiting fallback if Redis was unavailable
    if (!redis || !rateLimitExceeded) {
      const now = Date.now();
      const memRecord = memoryOtpCounts.get(identifier);

      if (memRecord) {
        if (now - memRecord.firstAttempt > 600000) {
          memoryOtpCounts.set(identifier, { count: 1, firstAttempt: now });
        } else {
          memRecord.count += 1;
          if (memRecord.count > 3) {
            rateLimitExceeded = true;
            console.warn(`[OTP RATE LIMIT] Blocked OTP send via in-memory fallback for ${identifier} (${memRecord.count} attempts)`);
          }
        }
      } else {
        memoryOtpCounts.set(identifier, { count: 1, firstAttempt: now });
      }
    }

    if (rateLimitExceeded) {
      return res.status(429).json({
        error: 'Too many OTP requests. Please wait 10 minutes before trying again.'
      });
    }

    // Generate cryptographically secure random 6-digit numeric OTP code
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins

    const supabase = getServiceRoleClient();

    // Store in system_events for serverless verification
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = crypto.createHash('sha256').update(salt + otpCode).digest('hex');

    const { error: insertError } = await supabase.from('system_events').insert({
      event_type: 'otp_generated',
      severity: 'info',
      source: 'auth_onboarding',
      description: `OTP generated for ${identifier}`,
      metadata: {
        identifier,
        otp_hash: otpHash,
        salt,
        expires_at: expiresAt,
        verified: false
      }
    });

    if (insertError) {
      console.error('Error logging OTP event:', insertError);
    }

    const maskedIdentifier = typeof identifier === 'string' && identifier.length > 4 
      ? identifier.slice(0, 2) + '****' + identifier.slice(-2) 
      : '***';
    console.log(`[OTP ONBOARDING] OTP generated for identifier ${maskedIdentifier}, expires at: ${expiresAt}`);

    // If phone number is provided, send SMS via Dual-Gateway System (Moolre & Hubtel)
    let smsSent = false;
    let smsMessage = '';
    let usedProvider = '';
    let dispatchRef = '';

    if (phone_number) {
      // Fetch SMS configurations from app_settings
      const { data: settings } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
          'moolre_vaskey',
          'moolre_sender_id',
          'hubtel_client_id',
          'hubtel_client_secret',
          'hubtel_sender_id',
          'primary_sms_provider',
          'fallback_sms_provider'
        ]);

      const settingsMap = {};
      settings?.forEach(item => { settingsMap[item.key] = item.value; });

      const vasKey = settingsMap.moolre_vaskey || process.env.MOOLRE_VAS_KEY || process.env.MOOLRE_API_PUBKEY;
      const moolreSender = settingsMap.moolre_sender_id || process.env.MOOLRE_SENDER_ID || 'SHM TECH';

      const hubtelClientId = settingsMap.hubtel_client_id || process.env.HUBTEL_CLIENT_ID || '';
      const hubtelClientSecret = settingsMap.hubtel_client_secret || process.env.HUBTEL_CLIENT_SECRET || '';
      const hubtelSender = settingsMap.hubtel_sender_id || process.env.HUBTEL_SENDER_ID || 'Boostupgh';

      const primaryProvider = requested_provider || settingsMap.primary_sms_provider || 'hubtel';
      const fallbackProvider = settingsMap.fallback_sms_provider || 'moolre';

      // Function runner based on provider name
      const dispatchToProvider = async (providerName) => {
        if (providerName === 'hubtel') {
          return await sendViaHubtel(phone_number, otpCode, purpose, hubtelClientId, hubtelClientSecret, hubtelSender);
        } else {
          return await sendViaMoolre(phone_number, otpCode, purpose, vasKey, moolreSender);
        }
      };

      // 1. Attempt Primary Provider
      console.log(`[SMS DISPATCH] Attempting primary provider: "${primaryProvider}"...`);
      let result = await dispatchToProvider(primaryProvider);

      if (result.success) {
        smsSent = true;
        usedProvider = result.provider;
        dispatchRef = result.ref || result.messageId || '';
        smsMessage = `Verification SMS sent via ${usedProvider.toUpperCase()}`;
      } else {
        console.warn(`[SMS FAILOVER] Primary provider "${primaryProvider}" failed: ${result.error}. Checking fallback...`);

        // 2. Attempt Fallback Provider if configured & different
        if (fallbackProvider && fallbackProvider !== 'none' && fallbackProvider !== primaryProvider) {
          console.log(`[SMS DISPATCH] Triggering automatic failover to provider: "${fallbackProvider}"...`);
          const fallbackResult = await dispatchToProvider(fallbackProvider);

          if (fallbackResult.success) {
            smsSent = true;
            usedProvider = fallbackResult.provider;
            dispatchRef = fallbackResult.ref || fallbackResult.messageId || '';
            smsMessage = `Verification SMS sent via fallback ${usedProvider.toUpperCase()}`;
          } else {
            console.error(`[SMS FAILOVER] Fallback provider "${fallbackProvider}" also failed: ${fallbackResult.error}`);
            smsMessage = `Failed to send SMS via ${primaryProvider} & ${fallbackProvider}`;
          }
        } else {
          smsMessage = result.error || `SMS delivery failed via ${primaryProvider}`;
        }
      }

      // If SMS sent successfully, update system_events record
      if (smsSent) {
        await supabase.from('system_events').update({
          metadata: {
            identifier,
            otp_hash: otpHash,
            salt,
            expires_at: expiresAt,
            verified: false,
            sms_provider: usedProvider,
            sms_ref: dispatchRef,
            sms_sent: true
          }
        }).eq('description', `OTP generated for ${identifier}`).order('created_at', { ascending: false }).limit(1);
      }
    }

    return res.status(200).json({
      success: true,
      message: smsSent ? smsMessage : `OTP sent to ${identifier}. Check your SMS.`,
      sms_sent: smsSent,
      provider_used: usedProvider || undefined
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ error: 'Failed to send OTP verification code' });
  }
}
