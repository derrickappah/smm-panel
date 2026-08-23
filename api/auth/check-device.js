/**
 * Pre-Action / Pre-Registration Device Ban Check Endpoint
 * 
 * Path: /api/auth/check-device
 * 
 * Checks whether the incoming device cookie is restricted without exposing internal IDs.
 */

import { setCorsHeaders } from '../utils/corsHeaders.js';
import { resolveDevice } from '../utils/deviceAuth.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { isBanned } = await resolveDevice(req, res);

    if (isBanned) {
      return res.status(403).json({
        allowed: false,
        error: 'Access to this service is currently unavailable.'
      });
    }

    return res.status(200).json({
      allowed: true
    });
  } catch (error) {
    console.error('Check device handler exception:', error);
    return res.status(200).json({
      allowed: true
    });
  }
}
