/**
 * Server-Side Authentication & Security Event Logging Endpoint
 * 
 * Path: /api/auth/log-event
 * 
 * Securely logs unauthenticated and pre-authentication security events
 * (failed logins, credential stuffing attempts, brute-force detections)
 * with verified IP and User-Agent headers into activity_logs and system_events.
 */

import { setCorsHeaders } from '../utils/corsHeaders.js';
import { logSecurityEvent, logActivity } from '../utils/activityLogger.js';
import { redis } from '../utils/redisClient.js';

// Fallback in-memory rate limiting map (max 30 log events per IP per minute)
const ipLogCounts = new Map();
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    ipLogCounts.clear();
  }, 60000);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rawIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : 'unknown';

    // Rate limit the logging endpoint itself to prevent log flooding
    if (redis) {
      try {
        const rateKey = `smm:ratelimit:log_event:${ip}`;
        const count = await redis.incr(rateKey);
        if (count === 1) await redis.expire(rateKey, 60);
        if (count > 40) {
          return res.status(429).json({ error: 'Rate limit exceeded for log events' });
        }
      } catch (err) {
        // Fallback
      }
    } else {
      const count = ipLogCounts.get(ip) || 0;
      if (count > 40) {
        return res.status(429).json({ error: 'Rate limit exceeded for log events' });
      }
      ipLogCounts.set(ip, count + 1);
    }

    const {
      action_type,
      description,
      metadata = {},
      severity = 'security',
      email = null
    } = req.body || {};

    if (!action_type || !description) {
      return res.status(400).json({ error: 'action_type and description are required' });
    }

    // Whitelist allowed unauthenticated action types to prevent abuse
    const allowedActions = [
      'login_failed',
      'login_attempt',
      'password_reset_requested',
      'otp_failed',
      'suspicious_activity_client'
    ];

    if (!allowedActions.includes(action_type)) {
      return res.status(400).json({ error: 'Unauthorized action type for unauthenticated logging' });
    }

    // Sanitize metadata - ensure no passwords or sensitive tokens are stored
    const sanitizedMetadata = { ...metadata };
    delete sanitizedMetadata.password;
    delete sanitizedMetadata.token;
    delete sanitizedMetadata.secret;
    if (email) {
      sanitizedMetadata.email = String(email).trim().toLowerCase();
    }

    // Check for high-velocity brute-force / repeated login failures
    let isHighVelocity = false;
    if (action_type === 'login_failed') {
      const failKey = `smm:auth:fail:${ip}:${sanitizedMetadata.email || 'unknown'}`;
      if (redis) {
        try {
          const failCount = await redis.incr(failKey);
          if (failCount === 1) await redis.expire(failKey, 300); // 5 min window
          if (failCount >= 5) {
            isHighVelocity = true;
          }
        } catch (err) {}
      }
    }

    if (isHighVelocity) {
      await logSecurityEvent({
        user_id: null,
        action_type: 'HIGH_VELOCITY_LOGIN_FAILURES',
        description: `Multiple consecutive failed logins (5+) detected from IP ${ip} targeting account ${sanitizedMetadata.email || 'unknown'}`,
        metadata: {
          ip_address: ip,
          target_email: sanitizedMetadata.email || 'unknown',
          consecutive_failures: 5,
          timestamp: new Date().toISOString()
        },
        req
      });
    } else {
      await logActivity({
        user_id: null,
        action_type,
        description,
        metadata: sanitizedMetadata,
        severity: severity === 'info' ? 'info' : 'security',
        req
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in /api/auth/log-event endpoint:', error);
    return res.status(500).json({ error: 'Internal server error while logging event' });
  }
}
