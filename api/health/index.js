import { setCorsHeaders } from '../utils/corsHeaders.js';
import { getServiceRoleClient } from '../utils/auth.js';
import { getOrCreateRequestId, verifyMonitoringAccess, recordIncident } from '../utils/monitoring.js';

/**
 * Unified Production Health Check Endpoint
 * GET /api/health
 * 
 * Verifies:
 * - Application availability
 * - Database connectivity
 * - Authentication subsystem
 * - Payment gateways configuration
 * - Order processing health & stuck orders
 * - Cron jobs execution recency
 * 
 * Access: Restricted to Admins or Secret Header (x-dev-monitor-key / x-cron-secret)
 */
export default async function handler(req, res) {
    setCorsHeaders(req, res);
    const requestId = getOrCreateRequestId(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Enforce Admin / Internal Secret Key access
    const isAuthorized = await verifyMonitoringAccess(req);
    if (!isAuthorized) {
        return res.status(403).json({
            error: 'Access denied: Health diagnostics require admin authorization or secret monitor key.',
            request_id: requestId
        });
    }

    const startTime = Date.now();
    const checks = {
        application: 'healthy',
        database: 'unknown',
        authentication: 'unknown',
        payments: 'unknown',
        order_processing: 'unknown',
        cron_jobs: 'unknown'
    };

    let overallStatus = 'healthy';
    const issues = [];

    try {
        const supabase = getServiceRoleClient();

        // 1. Database Connectivity Check
        const dbStart = Date.now();
        const { data: dbPing, error: dbError } = await supabase
            .from('profiles')
            .select('id')
            .limit(1);

        const dbLatency = Date.now() - dbStart;

        if (dbError) {
            checks.database = 'critical';
            overallStatus = 'critical';
            issues.push(`Database connection error: ${dbError.message}`);
            recordIncident({
                severity: 'CRITICAL',
                type: 'DATABASE_CONNECTIVITY_FAILURE',
                component: 'Database',
                lastError: dbError.message,
                metadata: { latency_ms: dbLatency }
            }).catch(() => {});
        } else if (dbLatency > 2000) {
            checks.database = 'degraded';
            if (overallStatus !== 'critical') overallStatus = 'degraded';
            issues.push(`Database latency degraded: ${dbLatency}ms`);
        } else {
            checks.database = 'healthy';
        }

        // 2. Authentication Subsystem Check
        try {
            const hasJwtSecret = Boolean(process.env.SUPABASE_JWT_SECRET);
            const hasAnonKey = Boolean(process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY);
            if (!hasJwtSecret || !hasAnonKey) {
                checks.authentication = 'degraded';
                issues.push('Missing Supabase Auth credentials in environment');
            } else {
                checks.authentication = 'healthy';
            }
        } catch (authErr) {
            checks.authentication = 'degraded';
            issues.push(`Auth check failed: ${authErr.message}`);
        }

        // 3. Payment Gateway Configuration & Recent Health
        try {
            const hasHubtel = Boolean(process.env.HUBTEL_CLIENT_ID || process.env.HUBTEL_API_ID);
            const hasKorapay = Boolean(process.env.KORAPAY_SECRET_KEY);
            const hasMoolre = Boolean(process.env.MOOLRE_API_USER);

            if (!hasHubtel && !hasKorapay && !hasMoolre) {
                checks.payments = 'critical';
                if (overallStatus !== 'critical') overallStatus = 'critical';
                issues.push('No payment gateway credentials configured');
            } else {
                checks.payments = 'healthy';
            }
        } catch (payErr) {
            checks.payments = 'degraded';
            issues.push(`Payment check error: ${payErr.message}`);
        }

        // 4. Order Processing & Stuck Orders
        try {
            const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            const { count: stuckOrdersCount, error: orderError } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending')
                .lt('created_at', fifteenMinsAgo);

            if (orderError) {
                checks.order_processing = 'degraded';
            } else if (stuckOrdersCount > 10) {
                checks.order_processing = 'degraded';
                if (overallStatus !== 'critical') overallStatus = 'degraded';
                issues.push(`High stuck pending orders detected: ${stuckOrdersCount}`);
            } else {
                checks.order_processing = 'healthy';
            }
        } catch (orderErr) {
            checks.order_processing = 'degraded';
        }

        // 5. Scheduled Cron Watchdog
        try {
            const { data: lastCron, error: cronError } = await supabase
                .from('cron_job_runs')
                .select('status, started_at, completed_at')
                .eq('job_name', 'sync-orders')
                .order('started_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!cronError && lastCron) {
                const minutesSinceLastRun = (Date.now() - new Date(lastCron.started_at).getTime()) / (1000 * 60);
                if (minutesSinceLastRun > 20) {
                    checks.cron_jobs = 'critical';
                    if (overallStatus !== 'critical') overallStatus = 'critical';
                    issues.push(`Order sync cron has not run in ${Math.round(minutesSinceLastRun)} minutes (expected every 5m)`);
                    recordIncident({
                        severity: 'CRITICAL',
                        type: 'CRON_STALLED',
                        component: 'Cron Jobs',
                        lastError: `sync-orders stalled for ${Math.round(minutesSinceLastRun)} minutes`,
                        metadata: { last_run: lastCron.started_at }
                    }).catch(() => {});
                } else if (lastCron.status === 'FAILED') {
                    checks.cron_jobs = 'degraded';
                    if (overallStatus !== 'critical') overallStatus = 'degraded';
                    issues.push('Last sync-orders cron execution failed');
                } else {
                    checks.cron_jobs = 'healthy';
                }
            } else {
                // No cron runs recorded yet
                checks.cron_jobs = 'healthy';
            }
        } catch {
            checks.cron_jobs = 'unknown';
        }

        // 6. Query Open Incidents
        const { data: openIncidents } = await supabase
            .from('production_incidents')
            .select('severity, count')
            .in('status', ['OPEN', 'ACKNOWLEDGED']);

        const totalOpenIncidents = openIncidents?.length || 0;
        const criticalIncidents = openIncidents?.filter(i => i.severity === 'CRITICAL').length || 0;

        if (criticalIncidents > 0) {
            overallStatus = 'critical';
        } else if (totalOpenIncidents > 0 && overallStatus === 'healthy') {
            overallStatus = 'degraded';
        }

        const httpStatus = overallStatus === 'critical' ? 503 : 200;

        return res.status(httpStatus).json({
            status: overallStatus,
            timestamp: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
            environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
            version: '1.0.0',
            checks,
            issues: issues.length > 0 ? issues : undefined,
            incidents: {
                open_total: totalOpenIncidents,
                critical: criticalIncidents
            },
            request_id: requestId
        });

    } catch (fatalErr) {
        return res.status(503).json({
            status: 'critical',
            timestamp: new Date().toISOString(),
            error: 'Health check probe encountered fatal exception',
            message: fatalErr.message,
            request_id: requestId
        });
    }
}
