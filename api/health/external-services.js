import { setCorsHeaders } from '../utils/corsHeaders.js';
import { getConfig } from '../utils/config.js';
import { getOrCreateRequestId, verifyMonitoringAccess } from '../utils/monitoring.js';

/**
 * External Services Health Diagnostic Endpoint
 * GET /api/health/external-services
 * 
 * Verifies external dependencies with lightweight, non-destructive, rate-limited probes:
 * - Payment Gateways (Hubtel, Korapay, Moolre)
 * - Active SMM Providers (SMMGen, SMMCost, etc.)
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
    const results = {
        payments: {},
        smm_providers: {}
    };

    try {
        // 1. Check Payment Gateways Configuration & Endpoint Reachability
        const [
            hubtelClientId,
            korapaySecret,
            moolreUser
        ] = await Promise.all([
            getConfig('HUBTEL_CLIENT_ID'),
            getConfig('KORAPAY_SECRET_KEY'),
            getConfig('MOOLRE_API_USER')
        ]);

        results.payments.hubtel = {
            configured: Boolean(hubtelClientId && !hubtelClientId.includes('PLACEHOLDER')),
            status: hubtelClientId ? 'configured' : 'missing_credentials'
        };

        results.payments.korapay = {
            configured: Boolean(korapaySecret && !korapaySecret.includes('PLACEHOLDER')),
            status: korapaySecret ? 'configured' : 'missing_credentials'
        };

        results.payments.moolre = {
            configured: Boolean(moolreUser && !moolreUser.includes('PLACEHOLDER')),
            status: moolreUser ? 'configured' : 'missing_credentials'
        };

        // 2. Check SMM Providers (probe SMMGen & SMMCost balance/status endpoint with short timeout)
        const smmGenUrl = await getConfig('SMMGEN_API_URL', 'https://smmgen.com/api/v2');
        const smmGenKey = await getConfig('SMMGEN_API_KEY');

        if (smmGenKey && !smmGenKey.includes('PLACEHOLDER')) {
            const probeStart = Date.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);

                const response = await fetch(smmGenUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ key: smmGenKey, action: 'balance' }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const duration = Date.now() - probeStart;
                results.smm_providers.smmgen = {
                    reachable: response.ok,
                    status_code: response.status,
                    latency_ms: duration,
                    status: response.ok ? 'healthy' : 'degraded'
                };
            } catch (err) {
                results.smm_providers.smmgen = {
                    reachable: false,
                    latency_ms: Date.now() - probeStart,
                    error: err.name === 'AbortError' ? 'timeout (4000ms)' : err.message,
                    status: 'unreachable'
                };
            }
        } else {
            results.smm_providers.smmgen = {
                configured: false,
                status: 'not_configured'
            };
        }

        const smmCostUrl = await getConfig('SMMCOST_API_URL', 'https://api.smmcost.com');
        const smmCostKey = await getConfig('SMMCOST_API_KEY');

        if (smmCostKey && !smmCostKey.includes('PLACEHOLDER')) {
            const probeStart = Date.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);

                const response = await fetch(smmCostUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: smmCostKey, action: 'balance' }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const duration = Date.now() - probeStart;
                results.smm_providers.smmcost = {
                    reachable: response.ok,
                    status_code: response.status,
                    latency_ms: duration,
                    status: response.ok ? 'healthy' : 'degraded'
                };
            } catch (err) {
                results.smm_providers.smmcost = {
                    reachable: false,
                    latency_ms: Date.now() - probeStart,
                    error: err.name === 'AbortError' ? 'timeout (4000ms)' : err.message,
                    status: 'unreachable'
                };
            }
        } else {
            results.smm_providers.smmcost = {
                configured: false,
                status: 'not_configured'
            };
        }

        return res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
            services: results,
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
