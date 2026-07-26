import { getServiceRoleClient } from '../utils/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, phone_number, code } = req.body;
    const identifier = (email || phone_number || '').trim().toLowerCase();
    const userCode = (code || '').trim();

    if (!identifier || !userCode) {
      return res.status(400).json({ error: 'Identifier and OTP code are required' });
    }

    const supabase = getServiceRoleClient();

    // Query recent OTP generated for this identifier
    const { data: events, error } = await supabase
      .from('system_events')
      .select('id, metadata, created_at')
      .eq('event_type', 'otp_generated')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !events) {
      return res.status(400).json({ error: 'Invalid or expired OTP code' });
    }

    const matchingEvent = events.find(e => {
      const meta = e.metadata || {};
      const matchesIdentifier = meta.identifier === identifier;
      const matchesCode = meta.otp_code === userCode;
      const notExpired = new Date(meta.expires_at) > new Date();
      return matchesIdentifier && matchesCode && notExpired;
    });

    if (!matchingEvent) {
      return res.status(400).json({ error: 'Invalid or expired OTP code. Please check and try again.' });
    }

    // Mark event as verified
    await supabase.from('system_events').update({
      metadata: { ...matchingEvent.metadata, verified: true }
    }).eq('id', matchingEvent.id);

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ error: 'Failed to verify OTP' });
  }
}
