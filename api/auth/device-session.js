/**
 * Device Session Initialization & Synchronization Endpoint
 * 
 * Path: /api/auth/device-session
 * 
 * Establishes or syncs the authoritative HttpOnly device cookie, validates status,
 * links to authenticated user if session exists, and returns non-sensitive client signal.
 */

import { setCorsHeaders } from '../utils/corsHeaders.js';
import { resolveDevice, isRequestSecure, serializeDeviceCookie, appendSetCookie, hashDeviceId } from '../utils/deviceAuth.js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if optional Bearer token is provided in Authorization header
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const jwtSecret = process.env.SUPABASE_JWT_SECRET;
      if (jwtSecret) {
        try {
          const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
          if (decoded && decoded.sub) {
            userId = decoded.sub;
          }
        } catch (e) {
          // Token expired or invalid
        }
      }
    }

    // Resolve or generate device identity
    const { deviceId, deviceHash, isBanned, deviceRecord, isNew } = await resolveDevice(req, res, { userId });

    // Ensure cookies are always explicitly set/refreshed
    const isSecure = isRequestSecure(req);
    const cookies = serializeDeviceCookies(deviceId, isSecure);
    appendSetCookie(res, cookies);

    if (isBanned) {
      return res.status(403).json({
        success: false,
        isBanned: true,
        error: 'Access to this service is currently unavailable.'
      });
    }

    // Secondary client token for localStorage consistency verification (truncated non-secret hash)
    // NEVER return the raw deviceId or HMAC secret
    const clientSignal = deviceHash.substring(0, 16);

    return res.status(200).json({
      success: true,
      isBanned: false,
      clientSignal,
      isNew
    });
  } catch (error) {
    console.error('Device session handler exception:', error);
    return res.status(500).json({
      error: 'Failed to establish device session',
      message: error.message
    });
  }
}
