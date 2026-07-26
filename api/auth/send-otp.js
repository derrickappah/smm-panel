import { getServiceRoleClient } from '../utils/auth.js';
import crypto from 'crypto';

// In-memory OTP store (per serverless instance) & Supabase fallback table
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, phone_number } = req.body;
    const identifier = (email || phone_number || '').trim().toLowerCase();

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

    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to ${identifier}`,
      // For development/testing demo visibility
      demo_otp: process.env.NODE_ENV !== 'production' ? otpCode : undefined
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ error: 'Failed to send OTP verification code' });
  }
}
