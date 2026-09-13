import { getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';

// Format Ghanaian phone numbers (e.g. 024XXXXXXX or +23324XXXXXXX to 23324XXXXXXX)
function formatPhoneForHubtel(phone) {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '233' + cleaned.substring(1);
  }
  return cleaned;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized. Missing access token.' });
    }

    const token = authHeader.split(' ')[1];
    const supabase = getServiceRoleClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized. Invalid token.' });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin privileges required.' });
    }

    const action = req.body?.action || req.query?.action;

    // Fetch Hubtel settings from database
    const { data: dbSettings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'hubtel_client_id',
        'hubtel_client_secret',
        'hubtel_sender_id',
        'primary_sms_provider',
        'fallback_sms_provider',
        'moolre_vaskey',
        'moolre_sender_id',
        'require_phone_verification'
      ]);

    const settingsMap = {};
    dbSettings?.forEach(item => { settingsMap[item.key] = item.value; });

    const clientId = settingsMap.hubtel_client_id || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = settingsMap.hubtel_client_secret || process.env.HUBTEL_CLIENT_SECRET || '';
    const senderId = settingsMap.hubtel_sender_id || process.env.HUBTEL_SENDER_ID || 'Boostupgh';
    const primaryProvider = settingsMap.primary_sms_provider || 'moolre';
    const fallbackProvider = settingsMap.fallback_sms_provider || 'hubtel';

    // ACTION: GET SETTINGS
    if (action === 'get_settings') {
      return res.status(200).json({
        success: true,
        settings: {
          hubtel_client_id: clientId,
          hubtel_client_secret: clientSecret,
          hubtel_sender_id: senderId,
          has_credentials: !!(clientId && clientSecret),
          primary_sms_provider: primaryProvider,
          fallback_sms_provider: fallbackProvider,
          require_phone_verification: settingsMap.require_phone_verification !== 'false'
        }
      });
    }

    // ACTION: SAVE SETTINGS
    if (action === 'save_settings') {
      const {
        hubtel_client_id,
        hubtel_client_secret,
        hubtel_sender_id,
        primary_sms_provider,
        fallback_sms_provider,
        require_phone_verification
      } = req.body;

      const updates = [];

      if (hubtel_client_id !== undefined) {
        updates.push({ key: 'hubtel_client_id', value: hubtel_client_id.trim() });
      }
      if (hubtel_client_secret !== undefined) {
        updates.push({ key: 'hubtel_client_secret', value: hubtel_client_secret.trim() });
      }
      if (hubtel_sender_id !== undefined) {
        updates.push({ key: 'hubtel_sender_id', value: hubtel_sender_id.trim().slice(0, 11) });
      }
      if (primary_sms_provider !== undefined) {
        updates.push({ key: 'primary_sms_provider', value: primary_sms_provider });
      }
      if (fallback_sms_provider !== undefined) {
        updates.push({ key: 'fallback_sms_provider', value: fallback_sms_provider });
      }
      if (require_phone_verification !== undefined) {
        updates.push({ key: 'require_phone_verification', value: String(require_phone_verification) });
      }

      for (const update of updates) {
        await supabase
          .from('app_settings')
          .upsert({ key: update.key, value: update.value }, { onConflict: 'key' });
      }

      return res.status(200).json({
        success: true,
        message: 'Hubtel SMS settings saved successfully.'
      });
    }

    // ACTION: SEND TEST SMS VIA HUBTEL
    if (action === 'send_test_sms') {
      const recipient = req.body?.recipient || req.body?.phone;
      const customMessage = req.body?.message || 'Test SMS from BoostUp GH Hubtel Integration.';

      if (!recipient) {
        return res.status(400).json({ error: 'Recipient phone number is required' });
      }

      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: 'Hubtel ClientID and ClientSecret are required' });
      }

      const recipientPhone = formatPhoneForHubtel(recipient);
      const authHeaderValue = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const payload = {
        From: senderId || 'Boostupgh',
        To: recipientPhone,
        Content: customMessage
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch('https://sms.hubtel.com/v1/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeaderValue
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log('[HUBTEL TEST SMS RESPONSE]', data);

      if (response.ok && (data.status === 0 || data.messageId)) {
        return res.status(200).json({
          success: true,
          message: `Test SMS sent via Hubtel to ${recipientPhone}`,
          data
        });
      } else {
        return res.status(400).json({
          success: false,
          error: data.statusDescription || data.message || 'Failed to send SMS via Hubtel',
          data
        });
      }
    }

    // ACTION: CHECK MESSAGE STATUS VIA HUBTEL
    if (action === 'check_sms_status') {
      const messageId = req.body?.messageId || req.query?.messageId;
      if (!messageId) {
        return res.status(400).json({ error: 'messageId is required' });
      }

      const authHeaderValue = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await fetch(`https://sms.hubtel.com/v1/messages/${encodeURIComponent(messageId)}`, {
        method: 'GET',
        headers: {
          'Authorization': authHeaderValue
        }
      });

      const data = await response.json();
      return res.status(200).json({ success: true, data });
    }

    return res.status(400).json({ error: `Invalid action: ${action}` });

  } catch (error) {
    console.error('Hubtel Admin API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
