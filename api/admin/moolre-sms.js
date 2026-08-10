import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';

/**
 * Serverless API endpoint for Moolre SMS Administration
 * Handles SMS credit balance, Sender ID list & status, Sender ID registration, and settings.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { user, supabase, isAdmin } = await verifyAdmin(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const serviceClient = getServiceRoleClient();
    const action = req.body?.action || req.query?.action || 'get_settings';

    // Fetch current Moolre settings from app_settings
    const { data: settingsData } = await serviceClient
      .from('app_settings')
      .select('key, value')
      .in('key', ['moolre_vaskey', 'moolre_sender_id', 'require_phone_verification']);

    const settings = {};
    settingsData?.forEach(item => { settings[item.key] = item.value; });

    const vasKey = req.body?.vaskey || settings.moolre_vaskey || process.env.MOOLRE_VAS_KEY || process.env.MOOLRE_API_PUBKEY || '';

    // GET / SAVE SETTINGS
    if (action === 'get_settings') {
      return res.status(200).json({
        success: true,
        settings: {
          require_phone_verification: settings.require_phone_verification !== 'false',
          moolre_sender_id: settings.moolre_sender_id || 'SHM TECH',
          moolre_vaskey: settings.moolre_vaskey || '',
          has_vaskey: !!vasKey
        }
      });
    }

    if (action === 'save_settings') {
      const { require_phone_verification, moolre_sender_id, moolre_vaskey } = req.body;

      const updates = [];
      if (require_phone_verification !== undefined) {
        updates.push({
          key: 'require_phone_verification',
          value: require_phone_verification ? 'true' : 'false',
          description: 'Require phone number verification via Moolre SMS during user signup'
        });
      }
      if (moolre_sender_id !== undefined) {
        updates.push({
          key: 'moolre_sender_id',
          value: moolre_sender_id.trim(),
          description: 'Moolre Approved Sender ID for sending SMS notifications'
        });
      }
      if (moolre_vaskey !== undefined) {
        updates.push({
          key: 'moolre_vaskey',
          value: moolre_vaskey.trim(),
          description: 'Moolre API VAS Key (X-API-VASKEY) for SMS integration'
        });
      }

      for (const update of updates) {
        const { error: upsertErr } = await serviceClient
          .from('app_settings')
          .upsert(update, { onConflict: 'key' });
        if (upsertErr) throw upsertErr;
      }

      return res.status(200).json({
        success: true,
        message: 'Moolre SMS settings updated successfully'
      });
    }

    // Require VAS Key for external Moolre API interactions
    if (!vasKey) {
      return res.status(400).json({
        error: 'Moolre VAS Key is not configured. Please enter your X-API-VASKEY in settings.'
      });
    }

    const MOOLRE_HEADERS = {
      'Content-Type': 'application/json',
      'X-API-VASKEY': vasKey
    };

    // ACTION: GET SMS CREDIT BALANCE
    if (action === 'get_balance') {
      const response = await fetch('https://api.moolre.com/open/sms/status', {
        method: 'POST',
        headers: MOOLRE_HEADERS,
        body: JSON.stringify({ type: 2 })
      });
      const data = await response.json();
      return res.status(200).json(data);
    }

    // ACTION: LIST SENDER IDS
    if (action === 'list_sender_ids') {
      const response = await fetch('https://api.moolre.com/open/sms/status', {
        method: 'POST',
        headers: MOOLRE_HEADERS,
        body: JSON.stringify({ type: 7 })
      });
      const data = await response.json();
      return res.status(200).json(data);
    }

    // ACTION: CHECK SENDER ID STATUS
    if (action === 'check_sender_id') {
      const senderid = req.body?.senderid || req.query?.senderid || settings.moolre_sender_id;
      if (!senderid) {
        return res.status(400).json({ error: 'Sender ID is required' });
      }
      const response = await fetch('https://api.moolre.com/open/sms/status', {
        method: 'POST',
        headers: MOOLRE_HEADERS,
        body: JSON.stringify({ type: 1, senderid })
      });
      const data = await response.json();
      return res.status(200).json(data);
    }

    // ACTION: CHECK SMS DELIVERY STATUS
    if (action === 'check_sms_status') {
      const refs = req.body?.ref || req.query?.ref;
      const refArray = Array.isArray(refs) ? refs : [refs].filter(Boolean);

      if (refArray.length === 0) {
        return res.status(400).json({ error: 'Reference array (ref) is required' });
      }

      const response = await fetch('https://api.moolre.com/open/sms/status', {
        method: 'POST',
        headers: MOOLRE_HEADERS,
        body: JSON.stringify({ type: 5, ref: refArray })
      });
      const data = await response.json();
      return res.status(200).json(data);
    }

    // ACTION: CREATE / REQUEST SENDER ID
    if (action === 'create_sender_id') {
      const newSenderId = req.body?.senderid;
      if (!newSenderId || newSenderId.length > 11) {
        return res.status(400).json({ error: 'Sender ID is required and must be max 11 characters' });
      }
      const response = await fetch('https://api.moolre.com/open/sms/query', {
        method: 'POST',
        headers: MOOLRE_HEADERS,
        body: JSON.stringify({
          type: 3,
          senderids: [{ senderid: newSenderId }]
        })
      });
      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (error) {
    console.error('[ADMIN MOOLRE SMS ERROR]', error);
    return res.status(500).json({
      error: error.message || 'An error occurred while communicating with Moolre SMS API'
    });
  }
}
