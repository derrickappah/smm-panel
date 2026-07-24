import { verifyAdmin } from '../utils/auth.js';
import { getCached, setCached } from '../utils/redisClient.js';

/**
 * Serverless API endpoint for Admin Dashboard Stats with Upstash Redis Caching
 * Caches stats for 2 minutes (120s) to relieve database query overhead on admin dashboard loads.
 */
export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { user, supabase } = await verifyAdmin(req);

    const body = req.body || {};
    const query = req.query || {};
    const dateRangeStart = body.dateRangeStart || query.dateRangeStart || '';
    const dateRangeEnd = body.dateRangeEnd || query.dateRangeEnd || '';

    const cacheKey = `smm:admin:dashboard:stats:${dateRangeStart || 'all'}:${dateRangeEnd || 'all'}`;

    // Check Upstash Redis cache first (120s TTL)
    const cachedStats = await getCached(cacheKey);
    if (cachedStats) {
      return res.status(200).json(cachedStats);
    }

    // Build RPC params
    const params = {};
    if (dateRangeStart) {
      const start = new Date(dateRangeStart);
      start.setHours(0, 0, 0, 0);
      params.p_date_range_start = start.toISOString();
    }
    if (dateRangeEnd) {
      const end = new Date(dateRangeEnd);
      end.setHours(23, 59, 59, 999);
      params.p_date_range_end = end.toISOString();
    }

    const { data, error } = await supabase.rpc('get_admin_dashboard_stats', params);
    if (error) {
      console.error('[admin/dashboard-stats] RPC error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Cache in Redis for 2 minutes (120s)
    await setCached(cacheKey, data, 120);

    return res.status(200).json(data);
  } catch (err) {
    console.error('[admin/dashboard-stats] Auth Error:', err.message);
    const isAuthError = err.message.includes('Authentication') || err.message.includes('token');
    const isForbidden = err.message.includes('Admin access required');
    return res.status(isForbidden ? 403 : isAuthError ? 401 : 500).json({ error: err.message });
  }
}
