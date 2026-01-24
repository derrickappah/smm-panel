import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { fetchProviderOrderStatus } from '../utils/providers.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { isAdmin } = await verifyAdmin(req);
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized' });

        const supabase = getServiceRoleClient();

        // 1. Fetch orders to reconcile: Not completed OR completed in last 24h
        const { data: orders, error: fetchError } = await supabase
            .from('orders')
            .select(`
                id, 
                user_id, 
                status, 
                created_at, 
                submitted_at,
                smmgen_order_id, 
                smmcost_order_id, 
                jbsmmpanel_order_id
            `)
            .or(`status.neq.completed,created_at.gt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`)
            .limit(50); // Batch limit for performance

        if (fetchError) throw fetchError;

        const results = [];
        const mismatches = [];

        // 2. Map provider names to IDs for each order
        const tasks = orders.map(async (order) => {
            let provider = null;
            let providerId = null;

            if (order.smmgen_order_id) {
                provider = 'smmgen';
                providerId = order.smmgen_order_id;
            } else if (order.smmcost_order_id) {
                provider = 'smmcost';
                providerId = order.smmcost_order_id;
            } else if (order.jbsmmpanel_order_id) {
                provider = 'jbsmmpanel';
                providerId = order.jbsmmpanel_order_id;
            }

            if (!provider || !providerId || providerId === "order not placed at smm gen") {
                return { order_id: order.id, status: 'MISSING_PROVIDER_ID', classification: 'STUCK_ORDER' };
            }

            try {
                const providerResponse = await fetchProviderOrderStatus(provider, providerId);
                const providerStatus = (providerResponse.status || 'unknown').toLowerCase();
                const localStatus = order.status.toLowerCase();

                let classification = 'OK';

                // Mismatch Logic
                // 1. Local Pending but Provider moving
                if ((localStatus === 'pending' || localStatus === 'created') &&
                    ['processing', 'in progress', 'completed', 'partial'].includes(providerStatus)) {
                    classification = 'STATUS_MISMATCH';
                }
                // 2. Local In Progress but Provider finished
                if (localStatus === 'processing' && ['completed', 'canceled', 'refunded'].includes(providerStatus)) {
                    classification = 'STATUS_MISMATCH';
                }
                // 3. Missing order check
                if (providerResponse.error && providerResponse.error.toLowerCase().includes('not found')) {
                    classification = 'MISSING_PROVIDER_ORDER';
                }
                // 4. Stuck check (15m elapsed but still pending on provider)
                const ageMinutes = (Date.now() - new Date(order.created_at).getTime()) / 60000;
                if (ageMinutes > 15 && providerStatus === 'pending') {
                    classification = 'STUCK_ORDER';
                }

                const result = {
                    order_id: order.id,
                    user_id: order.user_id,
                    local_status: order.status,
                    provider_status: providerStatus,
                    provider,
                    provider_order_id: providerId,
                    classification,
                    age_mins: Math.round(ageMinutes)
                };

                if (classification !== 'OK') {
                    mismatches.push(result);
                    // Log to system_events (Async)
                    supabase.rpc('log_system_event', {
                        p_type: 'order_reconciliation_mismatch',
                        p_severity: classification === 'MISSING_PROVIDER_ORDER' ? 'critical' : 'warning',
                        p_source: 'order-reconciler',
                        p_description: `Reconciliation ${classification}: Local ${localStatus} vs Provider ${providerStatus}`,
                        p_metadata: result,
                        p_entity_type: 'order',
                        p_entity_id: order.id
                    }).catch(err => console.error('Failed to log recon event:', err));
                }

                return result;

            } catch (err) {
                console.error(`Status check failed for ${order.id}:`, err.message);
                return { order_id: order.id, status: 'CHECK_FAILED', classification: 'ERROR', error: err.message };
            }
        });

        const allResults = await Promise.all(tasks);

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            summary: {
                total_checked: allResults.length,
                ok_count: allResults.filter(r => r.classification === 'OK').length,
                mismatch_count: allResults.filter(r => r.classification === 'STATUS_MISMATCH').length,
                missing_count: allResults.filter(r => r.classification === 'MISSING_PROVIDER_ORDER').length,
                stuck_count: allResults.filter(r => r.classification === 'STUCK_ORDER').length
            },
            mismatches
        });

    } catch (error) {
        console.error('Reconciliation API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
