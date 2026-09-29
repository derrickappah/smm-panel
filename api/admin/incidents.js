import { setCorsHeaders } from '../utils/corsHeaders.js';
import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { getOrCreateRequestId, logStructured } from '../utils/monitoring.js';

/**
 * Admin Incident & Production Health Management Endpoint
 * /api/admin/incidents
 * 
 * GET:
 * - Returns consolidated production health overview
 * - Returns active, acknowledged, or resolved incidents
 * 
 * POST:
 * - Resolves or updates incident status
 */
export default async function handler(req, res) {
    setCorsHeaders(req, res);
    const requestId = getOrCreateRequestId(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Verify Admin authentication
    let adminUser;
    try {
        const auth = await verifyAdmin(req);
        adminUser = auth.user;
    } catch (authErr) {
        return res.status(403).json({ error: authErr.message, request_id: requestId });
    }

    const supabase = getServiceRoleClient();

    // ── GET: Fetch Health Overview & Incidents ────────────────────────────────
    if (req.method === 'GET') {
        try {
            const statusFilter = req.query?.status || 'ACTIVE'; // 'ACTIVE' | 'ALL' | 'RESOLVED'

            // 1. Fetch Consolidated Health Overview
            const { data: healthOverview, error: overviewErr } = await supabase.rpc('get_production_health_overview');
            if (overviewErr) throw overviewErr;

            // 2. Fetch Incidents
            let query = supabase
                .from('production_incidents')
                .select('*')
                .order('last_detected', { ascending: false })
                .limit(50);

            if (statusFilter === 'ACTIVE') {
                query = query.in('status', ['OPEN', 'ACKNOWLEDGED']);
            } else if (statusFilter === 'RESOLVED') {
                query = query.eq('status', 'RESOLVED');
            }

            const { data: incidents, error: incidentsErr } = await query;
            if (incidentsErr) throw incidentsErr;

            // 3. Fetch Recent Cron Runs
            const { data: cronRuns } = await supabase
                .from('cron_job_runs')
                .select('*')
                .order('started_at', { ascending: false })
                .limit(10);

            return res.status(200).json({
                success: true,
                timestamp: new Date().toISOString(),
                health: healthOverview,
                incidents: incidents || [],
                cron_runs: cronRuns || [],
                request_id: requestId
            });

        } catch (err) {
            console.error('[ADMIN INCIDENTS GET ERROR]:', err);
            return res.status(500).json({
                error: 'Failed to fetch monitoring metrics',
                message: err.message,
                request_id: requestId
            });
        }
    }

    // ── POST: Resolve or Acknowledge Incident ─────────────────────────────────
    if (req.method === 'POST') {
        try {
            const { action, incidentId, resolutionNotes = '' } = req.body || {};

            if (!incidentId) {
                return res.status(400).json({ error: 'Missing incidentId parameter', request_id: requestId });
            }

            if (action === 'resolve') {
                const { data, error } = await supabase.rpc('resolve_production_incident', {
                    p_incident_id: incidentId,
                    p_resolution_notes: resolutionNotes || `Resolved by admin ${adminUser.email}`,
                    p_resolved_by: adminUser.id
                });

                if (error) throw error;

                logStructured('INFO', 'monitoring', 'incident_resolved', {
                    incident_id: incidentId,
                    admin_id: adminUser.id,
                    notes: resolutionNotes,
                    request_id: requestId
                });

                return res.status(200).json({
                    success: true,
                    result: data,
                    request_id: requestId
                });
            } else if (action === 'acknowledge') {
                const { data, error } = await supabase
                    .from('production_incidents')
                    .update({ status: 'ACKNOWLEDGED', metadata: { acknowledged_by: adminUser.email, acknowledged_at: new Date().toISOString() } })
                    .eq('id', incidentId)
                    .select()
                    .single();

                if (error) throw error;

                return res.status(200).json({
                    success: true,
                    result: data,
                    request_id: requestId
                });
            } else {
                return res.status(400).json({ error: `Unsupported action: ${action}`, request_id: requestId });
            }

        } catch (err) {
            console.error('[ADMIN INCIDENTS POST ERROR]:', err);
            return res.status(500).json({
                error: 'Failed to update incident',
                message: err.message,
                request_id: requestId
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
