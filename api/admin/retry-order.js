import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { placeProviderOrder, findMatchingProviderOrder, extractOrderId } from '../utils/providers.js';

/**
 * Admin API: Safe Order Retry
 * 
 * Logic:
 * 1. Verify admin permissions.
 * 2. ATOMIC LOCKOUT: Use lock_order_for_retry(order_id, NULL) to prevent multiple retries.
 * 3. Fetch order details.
 * 4. Search provider for a matching order (link, quantity, service) to prevent double orders.
 * 5. If matching order found: update local state with provider ID.
 * 6. If no match found: attempt to place order at provider.
 * 7. Update local order status and log results.
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized' });

        const { order_id } = req.body;
        if (!order_id) return res.status(400).json({ error: 'order_id is required' });

        const supabase = getServiceRoleClient();

        // 1. ATOMIC LOCKOUT
        const { data: lockResult, error: lockError } = await supabase.rpc('lock_order_for_retry', {
            p_order_id: order_id,
            p_user_id: null // Admin can retry any order
        });

        if (lockError) {
            console.error('[ADMIN RETRY LOCK ERROR]:', lockError);
            return res.status(500).json({
                error: 'Database lock error',
                message: lockError.message,
                details: lockError.details || lockError.hint
            });
        }

        const lockData = Array.isArray(lockResult) ? lockResult[0] : lockResult;

        if (!lockData.success) {
            return res.status(400).json({
                error: 'Retry blocked',
                message: lockData.message
            });
        }

        // 2. Fetch Order Details with relations
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select(`
                *,
                services(smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id),
                promotion_packages(smmgen_service_id)
            `)
            .eq('id', order_id)
            .single();

        if (fetchError || !order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // 3. Identify Provider and Provider Service ID
        let provider = null;
        let provider_service_id = null;

        if (order.services?.smmgen_service_id || order.promotion_packages?.smmgen_service_id) {
            provider = 'smmgen';
            provider_service_id = order.services?.smmgen_service_id || order.promotion_packages?.smmgen_service_id;
        } else if (order.services?.smmcost_service_id) {
            provider = 'smmcost';
            provider_service_id = order.services.smmcost_service_id;
        } else if (order.services?.jbsmmpanel_service_id) {
            provider = 'jbsmmpanel';
            provider_service_id = order.services.jbsmmpanel_service_id;
        }

        if (!provider || !provider_service_id) {
            return res.status(400).json({ error: 'Provider configuration not found for this order' });
        }

        // 4. Prevent double orders: Search for matching order at provider
        const matchingOrder = await findMatchingProviderOrder(provider, {
            service: provider_service_id,
            link: order.link,
            quantity: order.quantity,
            maxAgeMins: 1440 // Check last 24h
        });

        const reconciliation_log = order.reconciliation_log || [];
        const logEntry = {
            timestamp: new Date().toISOString(),
            action: 'retry_initiated',
            found_duplicate: !!matchingOrder,
            duplicate_id: matchingOrder?.id || null
        };

        if (matchingOrder) {
            // Found existing order at provider! Link it instead of double ordering.
            const updateData = {
                status: 'processing',
                submitted_at: matchingOrder.date || new Date().toISOString(),
                reconciliation_log: [...reconciliation_log, { ...logEntry, action: 'duplicate_found_linking' }]
                // manual_retry_count already incremented by RPC
            };

            if (provider === 'smmgen') updateData.smmgen_order_id = String(matchingOrder.id);
            if (provider === 'smmcost') updateData.smmcost_order_id = String(matchingOrder.id);
            if (provider === 'jbsmmpanel') updateData.jbsmmpanel_order_id = parseInt(matchingOrder.id);

            await supabase.from('orders').update(updateData).eq('id', order_id);

            return res.status(200).json({
                success: true,
                message: 'Existing order found at provider and linked successfully.',
                provider_order_id: matchingOrder.id,
                is_duplicate: true
            });
        }

        // 5. No matching order found: Safe to submit to provider
        try {
            const providerResponse = await placeProviderOrder(provider, {
                service: provider_service_id,
                link: order.link,
                quantity: order.quantity
            });

            const providerOrderId = extractOrderId(providerResponse);

            if (providerOrderId) {
                const updateData = {
                    status: 'processing',
                    submitted_at: new Date().toISOString(),
                    reconciliation_log: [...reconciliation_log, { ...logEntry, action: 'submission_success' }]
                };

                if (provider === 'smmgen') updateData.smmgen_order_id = String(providerOrderId);
                if (provider === 'smmcost') updateData.smmcost_order_id = String(providerOrderId);
                if (provider === 'jbsmmpanel') updateData.jbsmmpanel_order_id = parseInt(providerOrderId);

                await supabase.from('orders').update(updateData).eq('id', order_id);

                return res.status(200).json({
                    success: true,
                    message: 'Order successfully submitted to provider.',
                    provider_order_id: providerOrderId
                });
            } else {
                throw new Error('Provider failed to return order ID');
            }
        } catch (pError) {
            console.error('[ADMIN RETRY FAILURE]:', pError.message);

            await supabase.from('orders').update({
                last_provider_error: pError.message,
                reconciliation_log: [...reconciliation_log, { ...logEntry, action: 'submission_failed', error: pError.message }]
            }).eq('id', order_id);

            return res.status(502).json({
                error: 'Provider Error',
                message: 'Failed to submit order to provider during retry.',
                details: pError.message
            });
        }

    } catch (error) {
        console.error('Retry API Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
