import { setCorsHeaders } from '../utils/corsHeaders.js';
import { getServiceRoleClient } from '../utils/auth.js';
import { getOrCreateRequestId, verifyMonitoringAccess, recordIncident } from '../utils/monitoring.js';

/**
 * Database Health Diagnostic Endpoint
 * GET /api/health/database
 * 
 * Verifies:
 * - Direct query execution latency
 * - Read responsiveness on core tables (profiles, orders, transactions)
 * - Connection responsiveness & error detection
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
        const supabase = getServiceRoleClient();

        // 1. Measure query latency with simple ping
        const pingStart = Date.now();
        const { error: pingError } = await supabase.from('profiles').select('id').limit(1);
        const pingLatency = Date.now() - pingStart;

        if (pingError) {
            recordIncident({
                severity: 'CRITICAL',
                type: 'DATABASE_QUERY_FAILURE',
                component: 'Database',
                lastError: pingError.message,
                metadata: { query: 'profiles limit 1', duration_ms: pingLatency }
            }).catch(() => {});

            return res.status(503).json({
                status: 'critical',
                timestamp: new Date().toISOString(),
                database: 'unavailable',
                error: pingError.message,
                duration_ms: pingLatency,
                request_id: requestId
            });
        }

        // 2. Check accessibility of critical production tables
        const tableChecks = {};
        const tables = ['profiles', 'orders', 'transactions', 'services', 'production_incidents'];

        await Promise.all(tables.map(async (table) => {
            const tStart = Date.now();
            try {
                const { error } = await supabase.from(table).select('id').limit(1);
                tableChecks[table] = {
                    accessible: !error,
                    latency_ms: Date.now() - tStart,
                    error: error ? error.message : null
                };
            } catch (err) {
                tableChecks[table] = {
                    accessible: false,
                    latency_ms: Date.now() - tStart,
                    error: err.message
                };
            }
        }));

        const hasSlowQuery = pingLatency > 1500;
        const allTablesOk = Object.values(tableChecks).every(t => t.accessible);

        const status = (!allTablesOk || pingLatency > 3000) ? 'degraded' : 'healthy';

        return res.status(200).json({
            status,
            timestamp: new Date().toISOString(),
            latency_ms: pingLatency,
            slow_query: hasSlowQuery,
            table_checks: tableChecks,
            total_duration_ms: Date.now() - startTime,
            request_id: requestId
        });

    } catch (err) {
        return res.status(503).json({
            status: 'critical',
            timestamp: new Date().toISOString(),
            database: 'error',
            error: err.message,
            request_id: requestId
        });
    }
}
