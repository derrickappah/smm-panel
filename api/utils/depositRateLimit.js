import { getServiceRoleClient } from './auth.js';
import { logActivity } from './activityLogger.js';

const RATE_LIMIT_THRESHOLD = 5;
const RATE_LIMIT_TIMEFRAME_HOURS = 1;

/**
 * Checks if a user has exceeded the allowed number of failed/rejected deposit attempts.
 * This is a database-backed check that counts transactions with 'rejected' or 'failed' status
 * in the last hour for the specific user.
 * 
 * @param {string} userId - The Supabase user ID.
 * @param {Object} req - The request object for logging IP and user agent.
 * @returns {Promise<{blocked: boolean, message?: string}>}
 */
export async function checkDepositRateLimit(userId, req) {
  if (!userId) {
    return { blocked: false };
  }

  const supabase = getServiceRoleClient();
  const timeLimit = new Date(Date.now() - RATE_LIMIT_TIMEFRAME_HOURS * 3600000);

  // Count recent failed/rejected deposits in the last hour
  const { data: recentFailures, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'deposit')
    .in('status', ['rejected', 'failed']) // Target only failed/rejected as requested
    .gte('created_at', timeLimit.toISOString());

  if (error) {
    console.error('Rate limit check error:', error);
    // Safety fallback: don't block legitimate users if the DB query fails
    return { blocked: false };
  }

  const failureCount = recentFailures ? recentFailures.length : 0;

  if (failureCount >= RATE_LIMIT_THRESHOLD) {
    // Log the security/warning event
    await logActivity({
      user_id: userId,
      action_type: 'rate_limit_exceeded',
      description: `User hit deposit rate limit: ${failureCount} rejected attempts in ${RATE_LIMIT_TIMEFRAME_HOURS} hour(s)`,
      severity: 'warning',
      metadata: {
        failure_count: failureCount,
        threshold: RATE_LIMIT_THRESHOLD,
        timeframe_hours: RATE_LIMIT_TIMEFRAME_HOURS
      },
      req
    });

    return {
      blocked: true,
      message: `Too many failed deposit attempts. You have reached the limit of ${RATE_LIMIT_THRESHOLD} rejected transactions per hour. Please try again later.`
    };
  }

  return { blocked: false };
}
