import { getServiceRoleClient } from './auth.js';
import { logActivity } from './activityLogger.js';

const RATE_LIMIT_THRESHOLD = 5;
const RATE_LIMIT_TIMEFRAME_HOURS = 1;

/**
 * Extract IP address from request
 * @param {Object} req - Request object
 * @returns {string|null} - IP address or null
 */
function getClientIp(req) {
  if (!req) return null;
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }
  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress;
  }
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress;
  }
  return null;
}

/**
 * Checks if a user or their IP address has exceeded the allowed deposit rate limit.
 * Counts all deposits (pending, approved, failed, rejected) in the last hour.
 * 
 * @param {string} userId - The Supabase user ID.
 * @param {Object} req - The request object for extracting IP and user agent.
 * @returns {Promise<{blocked: boolean, message?: string}>}
 */
export async function checkDepositRateLimit(userId, req) {
  if (!userId) {
    return { blocked: false };
  }

  const supabase = getServiceRoleClient();
  const timeLimit = new Date(Date.now() - RATE_LIMIT_TIMEFRAME_HOURS * 3600000);

  // 1. Rate Limit check by User ID
  const { data: recentUserDeposits, error: userError } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'deposit')
    .gte('created_at', timeLimit.toISOString());

  if (userError) {
    console.error('Rate limit user check error:', userError);
  } else {
    const userDepositCount = recentUserDeposits ? recentUserDeposits.length : 0;
    if (userDepositCount >= RATE_LIMIT_THRESHOLD) {
      await logActivity({
        user_id: userId,
        action_type: 'rate_limit_exceeded',
        description: `User exceeded deposit rate limit: ${userDepositCount} deposits in ${RATE_LIMIT_TIMEFRAME_HOURS} hour(s)`,
        severity: 'warning',
        metadata: {
          count: userDepositCount,
          threshold: RATE_LIMIT_THRESHOLD,
          timeframe_hours: RATE_LIMIT_TIMEFRAME_HOURS,
          limit_type: 'user_id'
        },
        req
      });

      return {
        blocked: true,
        message: `Too many deposit attempts. You have reached the limit of ${RATE_LIMIT_THRESHOLD} deposit transactions per hour. Please wait before trying again.`
      };
    }
  }

  // 2. Rate Limit check by Client IP
  const clientIp = getClientIp(req);
  if (clientIp) {
    const { data: recentIpDeposits, error: ipError } = await supabase
      .from('activity_logs')
      .select('id')
      .eq('ip_address', clientIp)
      .eq('action_type', 'secure_deposit_initiated')
      .gte('created_at', timeLimit.toISOString());

    if (ipError) {
      console.error('Rate limit IP check error:', ipError);
    } else {
      const ipDepositCount = recentIpDeposits ? recentIpDeposits.length : 0;
      if (ipDepositCount >= RATE_LIMIT_THRESHOLD) {
        await logActivity({
          user_id: userId,
          action_type: 'rate_limit_exceeded',
          description: `IP address exceeded deposit rate limit: ${ipDepositCount} deposits in ${RATE_LIMIT_TIMEFRAME_HOURS} hour(s)`,
          severity: 'warning',
          metadata: {
            ip_address: clientIp,
            count: ipDepositCount,
            threshold: RATE_LIMIT_THRESHOLD,
            timeframe_hours: RATE_LIMIT_TIMEFRAME_HOURS,
            limit_type: 'ip_address'
          },
          req
        });

        return {
          blocked: true,
          message: `Too many deposit attempts from your connection. Limit of ${RATE_LIMIT_THRESHOLD} deposit transactions per hour exceeded. Please try again later.`
        };
      }
    }
  }

  return { blocked: false };
}
