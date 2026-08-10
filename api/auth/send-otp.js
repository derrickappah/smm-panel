import { getServiceRoleClient } from '../utils/auth.js';

// Format phone number for Moolre SMS Gateway (e.g., converts 024XXXXXXX to 23324XXXXXXX)
function formatPhoneForMoolre(phone) {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '233' + cleaned.substring(1);
  }
  return cleaned;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, phone_number } = req.body;
    const identifier = (phone_number || email || '').trim().toLowerCase();

    if (!identifier) {
      return res.status(400).json({ error: 'Email or phone number is required to send OTP' });
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
      const senderId = settingsMap.moolre_sender_id || process.env.MOOLRE_SENDER_ID || 'SHM TECH';

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

    return res.status(200).json({
      success: true,
      message: smsSent ? smsMessage : `OTP generated for ${identifier}. ${smsMessage}`,
      sms_sent: smsSent,
      demo_otp: (process.env.NODE_ENV !== 'production' || !smsSent) ? otpCode : undefined
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ error: 'Failed to send OTP verification code' });
  }
}

