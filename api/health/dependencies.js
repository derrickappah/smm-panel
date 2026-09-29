import { setCorsHeaders } from '../utils/corsHeaders.js';
import { isRedisAvailable } from '../utils/redisClient.js';
import { getOrCreateRequestId, verifyMonitoringAccess } from '../utils/monitoring.js';

/**
 * Infrastructure Dependencies Health Diagnostic Endpoint
 * GET /api/health/dependencies
 * 
 * Verifies:
 * - Upstash Redis REST connectivity and ping
 * - Required environment variables presence
 * - JWT Secret configuration
 * - Supabase Service Role configuration
 * 
 * Access: Restricted to Admins or Secret Header (x-dev-monitor-key / x-cron-secret)
 */
export default async function handler(req, res) {
    setCorsHeaders(req, res);
    const requestId = getOrCreateRequestId(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const isAuthorized = await verifyMonitoringAccess(req);
    if (!isAuthorized) {
        return res.status(403).json({
            error: 'Access denied: Requires admin authorization or secret monitor key.',
            request_id: requestId
        });
    }

    const startTime = Date.now();

    try {
        // 1. Check Upstash Redis
        const redisStart = Date.now();
        const redisHealthy = await isRedisAvailable();
        const redisLatency = Date.now() - redisStart;

        // 2. Check Core Environment Variables (presence check without exposing values)
        const requiredVars = [
            'SUPABASE_URL',
            'SUPABASE_ANON_KEY',
            'SUPABASE_SERVICE_ROLE_KEY',
            'SUPABASE_JWT_SECRET',
            'UPSTASH_REDIS_REST_URL',
            'UPSTASH_REDIS_REST_TOKEN'
        ];

        const envCheck = {};
        let missingVarsCount = 0;

        for (const varName of requiredVars) {
            const val = process.env[varName];
            const isPresent = Boolean(val && !val.includes('PLACEHOLDER') && !val.includes('YOUR_'));
            envCheck[varName] = isPresent ? 'configured' : 'missing';
            if (!isPresent) missingVarsCount++;
        }

        const status = (missingVarsCount > 0 || !redisHealthy) ? 'degraded' : 'healthy';

        return res.status(200).json({
            status,
            timestamp: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
            redis: {
                status: redisHealthy ? 'connected' : 'disconnected',
                latency_ms: redisLatency
            },
            environment: {
                status: missingVarsCount === 0 ? 'complete' : 'incomplete',
                configured_count: requiredVars.length - missingVarsCount,
                total_required: requiredVars.length,
                details: envCheck
            },
            request_id: requestId
        });

    } catch (err) {
        return res.status(500).json({
            status: 'error',
            error: err.message,
            request_id: requestId
        });
    }
}
