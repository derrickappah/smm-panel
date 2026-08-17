import { getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { redis } from '../utils/redisClient.js';

// Format phone number for Moolre SMS Gateway (e.g., converts 024XXXXXXX to 23324XXXXXXX)
function formatPhoneForMoolre(phone) {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '233' + cleaned.substring(1);
  }
  return cleaned;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, phone_number } = req.body;
    const identifier = (phone_number || email || '').trim().toLowerCase();

    if (!identifier) {
      return res.status(400).json({ error: 'Email or phone number is required to send OTP' });
    }

    // SECURITY: Rate limit OTP sends — max 3 per identifier per 10 minutes
    if (redis) {
      try {
        const rateLimitKey = `smm:otp:send:${identifier}`;
        const currentCount = await redis.incr(rateLimitKey);
        if (currentCount === 1) {
          await redis.expire(rateLimitKey, 600); // 10 minute window
        }
        if (currentCount > 3) {
          console.warn(`[OTP RATE LIMIT] Blocked OTP send for ${identifier} (${currentCount} attempts)`);
          return res.status(429).json({
            error: 'Too many OTP requests. Please wait 10 minutes before trying again.'
          });
        }
      } catch (redisErr) {
        console.error('[OTP RATE LIMIT] Redis error, proceeding without rate limit:', redisErr.message);
      }
    }

    // Generate random 6-digit numeric OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins

    const supabase = getServiceRoleClient();

    // Store in system_events for serverless verification
    const { error: insertError } = await supabase.from('system_events').insert({
      event_type: 'otp_generated',
      severity: 'info',
      source: 'auth_onboarding',
      description: `OTP generated for ${identifier}`,
      metadata: {
        identifier,
        otp_code: otpCode,
        expires_at: expiresAt,
        verified: false
      }
    });

    if (insertError) {
      console.error('Error logging OTP event:', insertError);
    }

    // OTP code is logged server-side only — never returned in the response
    console.log(`[OTP ONBOARDING] OTP code generated for ${identifier}: ${otpCode}`);

    // If phone number is provided, send SMS via Moolre Gateway
    let smsSent = false;
    let smsMessage = '';

    if (phone_number) {
      const recipientPhone = formatPhoneForMoolre(phone_number);

      // Fetch Moolre SMS configuration from app_settings
      const { data: settings } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['moolre_vaskey', 'moolre_sender_id', 'require_phone_verification']);

      const settingsMap = {};
      settings?.forEach(item => { settingsMap[item.key] = item.value; });

      const vasKey = settingsMap.moolre_vaskey || process.env.MOOLRE_VAS_KEY || process.env.MOOLRE_API_PUBKEY;
      const senderId = settingsMap.moolre_sender_id || process.env.MOOLRE_SENDER_ID || 'Boostupgh';

      if (vasKey) {
        try {
          const smsRef = `ref_otp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

          const smsPayload = {
            type: 1,
            senderid: senderId,
            messages: [
              {
                recipient: recipientPhone,
                message: `Your BoostUp GH verification code is: ${otpCode}. Valid for 10 minutes.`,
                ref: smsRef
              }
            ]
          };

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

          const moolreRes = await fetch('https://api.moolre.com/open/sms/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-VASKEY': vasKey
            },
            body: JSON.stringify(smsPayload),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          const moolreData = await moolreRes.json();
          console.log('[MOOLRE SMS RESPONSE]', moolreData);

          if (moolreRes.ok && moolreData.status === 1) {
            smsSent = true;
            smsMessage = `Verification SMS sent to ${recipientPhone}`;

            // Update event metadata with sms_ref
            await supabase.from('system_events').update({
              metadata: {
                identifier,
                otp_code: otpCode,
                expires_at: expiresAt,
                verified: false,
                sms_ref: smsRef,
                sms_sent: true
              }
            }).eq('description', `OTP generated for ${identifier}`).order('created_at', { ascending: false }).limit(1);
          } else {
            console.warn('[MOOLRE SMS WARNING]', moolreData.message || 'Failed to send SMS');
            smsMessage = moolreData.message || 'SMS delivery pending/failed';
          }
        } catch (smsErr) {
          console.error('[MOOLRE SMS ERROR]', smsErr.name === 'AbortError' ? 'Moolre SMS API request timed out (6s)' : smsErr);
          smsMessage = smsErr.name === 'AbortError' ? 'SMS gateway request timed out' : 'Error connecting to SMS gateway';
        }
      } else {
        console.warn('[MOOLRE SMS] No X-API-VASKEY configured in app_settings or environment variables.');
        smsMessage = 'SMS gateway credentials not configured';
      }
    }

    // SECURITY: Never return OTP code in the response — use server logs for debugging
    return res.status(200).json({
      success: true,
      message: smsSent ? smsMessage : `OTP sent to ${identifier}. Check your SMS.`,
      sms_sent: smsSent
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ error: 'Failed to send OTP verification code' });
  }
}
