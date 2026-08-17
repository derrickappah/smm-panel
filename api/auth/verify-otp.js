import { getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { redis } from '../utils/redisClient.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, phone_number, code } = req.body;
    const rawIdentifier = (phone_number || email || '').trim().toLowerCase();
    const cleanDigits = (phone_number || '').replace(/\D/g, '');
    const userCode = (code || '').trim();

    if (!rawIdentifier || !userCode) {
      return res.status(400).json({ error: 'Identifier and OTP code are required' });
    }

    // SECURITY: Brute-force protection — max 5 verify attempts per identifier per 10 minutes
    if (redis) {
      try {
        const bruteForceKey = `smm:otp:verify:${rawIdentifier}`;
        const attempts = await redis.incr(bruteForceKey);
        if (attempts === 1) {
          await redis.expire(bruteForceKey, 600); // 10 minute window
        }
        if (attempts > 5) {
          console.warn(`[OTP BRUTE FORCE] Blocked verify for ${rawIdentifier} (${attempts} attempts)`);
          return res.status(429).json({
            error: 'Too many verification attempts. Your OTP has been invalidated. Please request a new code.'
          });
        }
      } catch (redisErr) {
        console.error('[OTP BRUTE FORCE] Redis error, proceeding without protection:', redisErr.message);
      }
    }

    const supabase = getServiceRoleClient();

    // Query recent OTP generated for this identifier
    const { data: events, error } = await supabase
      .from('system_events')
      .select('id, metadata, created_at')
      .eq('event_type', 'otp_generated')
      .order('created_at', { ascending: false })
      .limit(15);

    if (error || !events) {
      return res.status(400).json({ error: 'Invalid or expired OTP code' });
    }

    const matchingEvent = events.find(e => {
      const meta = e.metadata || {};
      const metaId = (meta.identifier || '').toLowerCase();
      const metaDigits = metaId.replace(/\D/g, '');

      const matchesIdentifier = metaId === rawIdentifier ||
        (cleanDigits && metaDigits && (metaDigits.endsWith(cleanDigits) || cleanDigits.endsWith(metaDigits)));
      const matchesCode = meta.otp_code === userCode;
      const notExpired = new Date(meta.expires_at) > new Date();
      const notVerified = !meta.verified; // Don't allow reuse of verified OTPs
      return matchesIdentifier && matchesCode && notExpired && notVerified;
    });

    if (!matchingEvent) {
      return res.status(400).json({ error: 'Invalid or expired OTP code. Please check and try again.' });
    }

    // Mark event as verified
    await supabase.from('system_events').update({
      metadata: { ...matchingEvent.metadata, verified: true }
    }).eq('id', matchingEvent.id);

    // Clear brute-force counter on successful verification
    if (redis) {
      try {
        await redis.del(`smm:otp:verify:${rawIdentifier}`);
      } catch (redisErr) {
        // Non-critical, ignore
      }
    }

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ error: 'Failed to verify OTP' });
  }
}
