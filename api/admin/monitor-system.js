import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // SECURITY: Multi-layer protection
    let authorized = false;

    // 1. Check for Secret Header Key
    const devMonitorKey = process.env.DEV_MONITOR_KEY;
    const clientKey = req.headers['x-dev-monitor-key'];

    if (devMonitorKey && clientKey === devMonitorKey) {
        authorized = true;
    } else {
        // 2. Fallback to Admin Authentication
        try {
            const { isAdmin } = await verifyAdmin(req);
            if (isAdmin) authorized = true;
        } catch (e) {
            // Ignore auth error if already authorized via key
        }
    }

    if (!authorized) {
        return res.status(403).json({ error: 'Unauthorized. Requires admin access or dev monitor key.' });
    }

    try {
        const supabase = getServiceRoleClient();

        // 1. Get Aggregated Summary
        const { data: summaryData, error: summaryError } = await supabase
            .from('dev_monitoring_summary')
            .select('*')
            .maybeSingle();

        if (summaryError) throw summaryError;

        // 2. Get Recent Stuck Orders for Details
        const { data: stuckDetails } = await supabase
            .from('stuck_orders_monitor')
            .select('*')
            .limit(10);

        // 3. Get Recent Critical Events
        const { data: criticalEvents } = await supabase
            .from('system_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        // 4. Calculate Provider Failures in last 30m (specific detail)
        const { count: providerFailures30m } = await supabase
            .from('system_events')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', 'provider_submission_failure')
            .gte('created_at', new Date(Date.now() - 30 * 60000).toISOString());

        // 5. Get Balance Discrepancy Details
        const { data: balanceAnomalies } = await supabase
            .from('ledger_balance_verification')
            .select('*')
            .neq('discrepancy', 0)
            .order('discrepancy', { ascending: false })
            .limit(1000);

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            metrics: {
                ...summaryData,
                provider_status: {
                    last_success: summaryData.last_provider_success,
                    failures_30m: providerFailures30m || 0,
                    status: (providerFailures30m > 5) ? 'WARNING' : 'HEALTHY'
                }
            },
            details: {
                stuck_orders: stuckDetails || [],
                recent_critical_events: criticalEvents || [],
                balance_anomalies: balanceAnomalies || []
            }
        });

    } catch (error) {
        console.error('Monitoring API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
