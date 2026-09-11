import { getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';

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
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const phone = (req.method === 'POST' ? req.body?.phone_number : req.query?.phone) || '';
    const norm = normalizePhone(phone);

    if (!norm || norm.length < 10) {
      return res.status(400).json({ error: 'A valid phone number is required (at least 10 digits)' });
    }

    const supabase = getServiceRoleClient();
    
    // Call RPC check_phone_registered
    const { data: isRegistered, error: rpcError } = await supabase.rpc('check_phone_registered', {
      p_phone: norm
    });

    if (rpcError) {
      console.error('[CHECK PHONE] RPC error:', rpcError);
      // Fallback query
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .or(`phone_number.eq.${norm},phone_number.eq.+233${norm.substring(1)},phone_number.eq.233${norm.substring(1)}`)
        .limit(1);

      if (error) {
        return res.status(500).json({ error: 'Failed to verify phone number availability' });
      }

      const registered = Boolean(data && data.length > 0);
      return res.status(200).json({
        available: !registered,
        registered
      });
    }

    return res.status(200).json({
      available: !isRegistered,
      registered: Boolean(isRegistered)
    });
  } catch (err) {
    console.error('[CHECK PHONE] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
