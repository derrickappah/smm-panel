/**
 * Security Alert & Notification Dispatcher (Resend API)
 * 
 * Sends real-time email alerts to administrators when critical security events,
 * anomalous transactions, balance discrepancies, or brute force attempts are detected.
 */

import { redis } from './redisClient.js';
import { getServiceRoleClient } from './auth.js';

// Resend API configuration - set RESEND_API_KEY in Vercel or your environment variables
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'BoostUp GH Security <onboarding@resend.dev>';
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'derrickappah17@gmail.com';

// In-memory deduplication cache if Redis is not configured
const localAlertDedupe = new Map();

// Periodic cleanup of in-memory dedupe map (every 10m)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of localAlertDedupe.entries()) {
      if (now - timestamp > 10 * 60 * 1000) {
        localAlertDedupe.delete(key);
      }
    }
  }, 60000);
}

/**
 * Fetch all recipient admin emails from app_settings, env, or admin profiles
 * @returns {Promise<string[]>}
 */
export async function getAdminRecipientEmails() {
  const emails = new Set();

  if (process.env.ADMIN_ALERT_EMAIL) {
    process.env.ADMIN_ALERT_EMAIL.split(',').forEach(e => {
      if (e.trim().includes('@')) emails.add(e.trim());
    });
  }

  try {
    const supabase = getServiceRoleClient();
    // 1. Check app_settings for custom admin email
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_alert_email')
      .maybeSingle();

    if (setting?.value) {
      setting.value.split(',').forEach(e => {
        if (e.trim().includes('@')) emails.add(e.trim());
      });
    }

    // 2. Fetch all active admin profile emails
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('email')
      .eq('role', 'admin')
      .not('email', 'is', null);

    adminProfiles?.forEach(p => {
      if (p.email && p.email.includes('@')) {
        emails.add(p.email.trim());
      }
    });
  } catch (err) {
    console.warn('[ALERT NOTIFIER] Error resolving admin emails from DB:', err.message);
  }

  if (emails.size === 0) {
    emails.add(DEFAULT_ADMIN_EMAIL);
  }

  return Array.from(emails);
}

/**
 * Check if alert should be throttled/deduplicated (prevent email flooding)
 * @param {string} dedupeKey - Unique key for the event category
 * @param {number} windowSeconds - Deduplication window in seconds (default: 600s = 10m)
 * @returns {Promise<boolean>} - true if alert should be suppressed, false if allowed
 */
async function isAlertThrottled(dedupeKey, windowSeconds = 600) {
  if (!dedupeKey) return false;

  if (redis) {
    try {
      const redisKey = `smm:alert:throttle:${dedupeKey}`;
      const exists = await redis.set(redisKey, '1', { nx: true, ex: windowSeconds });
      return exists === null; // If null, key already existed (throttled)
    } catch (err) {
      console.warn('[ALERT NOTIFIER] Redis throttle error, falling back to in-memory:', err.message);
    }
  }

  const now = Date.now();
  const lastSent = localAlertDedupe.get(dedupeKey);
  if (lastSent && now - lastSent < windowSeconds * 1000) {
    return true;
  }
  localAlertDedupe.set(dedupeKey, now);
  return false;
}

/**
 * Send a real-time security alert email via Resend API
 * @param {Object} options
 * @param {string} options.subject - Email subject line
 * @param {string} options.title - Header title inside the email
 * @param {string} options.description - Main event description
 * @param {string} [options.severity='warning'] - 'info' | 'warning' | 'security' | 'critical'
 * @param {Object} [options.metadata={}] - Detailed event payload / context
 * @param {string[]} [options.recipients] - Optional specific recipient array
 * @param {string} [options.dedupeKey] - Unique key to prevent duplicate alert storms
 * @param {number} [options.dedupeWindow=600] - Dedupe window in seconds
 * @returns {Promise<{success: boolean, messageId?: string, results?: Array, error?: string}>}
 */
export async function sendSecurityAlertEmail({
  subject,
  title,
  description,
  severity = 'warning',
  metadata = {},
  recipients = null,
  dedupeKey = null,
  dedupeWindow = 600
}) {
  try {
    if (!RESEND_API_KEY) {
      console.warn('[ALERT NOTIFIER] Resend API key is missing. Skipping email dispatch.');
      return { success: false, error: 'Resend API key not configured' };
    }

    // Check deduplication
    if (dedupeKey) {
      const throttled = await isAlertThrottled(dedupeKey, dedupeWindow);
      if (throttled) {
        console.log(`[ALERT NOTIFIER] Suppressed duplicate alert: ${dedupeKey}`);
        return { success: true, throttled: true };
      }
    }

    const recipientEmails = (recipients && Array.isArray(recipients) && recipients.length > 0)
      ? recipients
      : await getAdminRecipientEmails();
    const timestamp = new Date().toUTCString();

    // Severity color mapping
    const severityColors = {
      info: '#3B82F6',
      warning: '#F59E0B',
      security: '#EF4444',
      critical: '#991B1B'
    };
    const accentColor = severityColors[severity] || '#EF4444';

    // Format metadata into clean table rows
    const metadataRows = Object.entries(metadata || {})
      .map(([key, val]) => {
        const displayVal = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
        const formattedKey = key.replace(/_/g, ' ');
        return `
          <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563; font-size: 13px; font-weight: 500; text-transform: capitalize; width: 35%;">${formattedKey}</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; word-break: break-all;">${displayVal}</td>
          </tr>
        `;
      })
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; -webkit-font-smoothing: antialiased;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f7; padding: 32px 16px;">
          <tr>
            <td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; text-align: left;">
                
                <!-- Brand Header -->
                <tr>
                  <td style="padding: 24px 32px; border-bottom: 1px solid #f3f4f6;">
                    <span style="font-size: 16px; font-weight: 700; color: #111827; letter-spacing: -0.3px;">
                      BoostUp GH
                    </span>
                  </td>
                </tr>

                <!-- Main Body -->
                <tr>
                  <td style="padding: 32px;">
                    <h1 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #111827; line-height: 1.4;">
                      ${title || 'Security Notification'}
                    </h1>

                    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #374151;">
                      ${description}
                    </p>

                    ${metadataRows ? `
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; border-collapse: collapse; margin-bottom: 24px;">
                        <tbody>
                          ${metadataRows}
                        </tbody>
                      </table>
                    ` : ''}

                    <div style="margin-top: 28px;">
                      <a href="https://boostupgh.com/admin" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
                        Go to Admin Dashboard
                      </a>
                    </div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #f3f4f6; font-size: 12px; color: #6b7280; line-height: 1.5;">
                    This is an automated notification from BoostUp GH for account administrators.<br>
                    Time: ${timestamp}
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    let res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: recipientEmails,
        subject: `[BoostUp GH] ${subject}`,
        html: htmlContent
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    let data = await res.json();

    // If Resend returns 403 because we're on the sandbox (onboarding@resend.dev) sending to unverified recipients,
    // fallback immediately to the verified account owner so the alert is still delivered
    if (!res.ok && data.message && data.message.includes('derrick.appah.dev@gmail.com') && !recipientEmails.includes('derrick.appah.dev@gmail.com')) {
      console.warn('[ALERT NOTIFIER] Resend sandbox restriction hit. Retrying to verified account owner (derrick.appah.dev@gmail.com)...');
      
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), 8000);

      const retryRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: ['derrick.appah.dev@gmail.com'],
          subject: `[BoostUp GH] ${subject}`,
          html: htmlContent
        }),
        signal: retryController.signal
      });

      clearTimeout(retryTimeout);
      const retryData = await retryRes.json();
      if (retryRes.ok) {
        console.log(`[ALERT NOTIFIER] Alert email sent via sandbox fallback: ${retryData.id} -> derrick.appah.dev@gmail.com`);
        return { success: true, messageId: retryData.id, recipients: ['derrick.appah.dev@gmail.com'] };
      }
    }

    if (!res.ok) {
      console.error('[ALERT NOTIFIER] Resend API error response:', data);
      return { success: false, error: data.message || 'Resend API error' };
    }

    console.log(`[ALERT NOTIFIER] Alert email sent successfully: ${data.id} -> ${recipientEmails.join(', ')}`);
    return { success: true, messageId: data.id, recipients: recipientEmails };
  } catch (error) {
    console.error('[ALERT NOTIFIER] Failed to dispatch alert email:', error.message);
    return { success: false, error: error.message };
  }
}
