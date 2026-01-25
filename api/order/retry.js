import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';
import { placeProviderOrder, findMatchingProviderOrder, extractOrderId } from '../utils/providers.js';

/**
 * User API: Safe Order Retry
 * 
 * Logic:
 * 1. Verify user authentication.
 * 2. ATOMIC LOCKOUT: Use lock_order_for_retry(order_id, user_id) to prevent multiple retries.
 * 3. Search provider for a matching order (link, quantity, service) to prevent double orders.
 * 4. If matching order found: update local state with provider ID.
 * 5. If no match found: attempt to place order at provider.
 * 6. Update local order status and return result.
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { user, supabase: userSupabase } = await verifyAuth(req);
        const { order_id } = req.body;

        if (!order_id) return res.status(400).json({ error: 'order_id is required' });

        const supabase = getServiceRoleClient();

        // 1. ATOMIC LOCKOUT & FETCH
        // This RPC call locks the row for update and verifies status/ownership in one atomic step.
        const { data: lockResult, error: lockError } = await supabase.rpc('lock_order_for_retry', {
            p_order_id: order_id,
            p_user_id: user.id
        });

        if (lockError) {
            console.error('[RETRY LOCK ERROR]:', lockError);
            return res.status(500).json({ error: 'Database lock error', details: lockError.message });
        }

        const lockData = Array.isArray(lockResult) ? lockResult[0] : lockResult;

        if (!lockData.success) {
            return res.status(400).json({
                error: 'Retry blocked',
                message: lockData.message
            });
        }

        const order = lockData.order_data;

        // 2. Identify Provider and Provider Service ID
        // Note: The order data structure from lock_order_for_retry is slightly different (JSONB)
        // We might need to fetch relations if they weren't included, but we can also just fetch them now
        // since the row is already "locked" for this transaction's visibility (though RPC ends, the lockout timestamp is set).

        // Let's re-fetch relations to be sure we have provider IDs
        const { data: orderDetails } = await supabase
            .from('orders')
            .select(`
                *,
                services(smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id),
                promotion_packages(smmgen_service_id)
            `)
            .eq('id', order_id)
            .single();

        let provider = null;
        let provider_service_id = null;

        if (orderDetails.services?.smmgen_service_id || orderDetails.promotion_packages?.smmgen_service_id) {
            provider = 'smmgen';
            provider_service_id = orderDetails.services?.smmgen_service_id || orderDetails.promotion_packages?.smmgen_service_id;
        } else if (orderDetails.services?.smmcost_service_id) {
            provider = 'smmcost';
            provider_service_id = orderDetails.services.smmcost_service_id;
        } else if (orderDetails.services?.jbsmmpanel_service_id) {
            provider = 'jbsmmpanel';
            provider_service_id = orderDetails.services.jbsmmpanel_service_id;
        }

        if (!provider || !provider_service_id) {
            return res.status(400).json({ error: 'Provider configuration not found for this order' });
        }

        // 3. Prevent double orders: Search for matching order at provider
        const matchingOrder = await findMatchingProviderOrder(provider, {
            service: provider_service_id,
            link: orderDetails.link,
            quantity: orderDetails.quantity,
            maxAgeMins: 1440 // Check last 24h
        });

        const reconciliation_log = orderDetails.reconciliation_log || [];
        const logEntry = {
            timestamp: new Date().toISOString(),
            action: 'user_retry_initiated',
            found_duplicate: !!matchingOrder,
            duplicate_id: matchingOrder?.id || null
        };

        if (matchingOrder) {
            // Found existing order at provider! Link it instead of double ordering.
            const updateData = {
                status: 'processing',
                submitted_at: matchingOrder.date || new Date().toISOString(),
                reconciliation_log: [...reconciliation_log, { ...logEntry, action: 'duplicate_found_linking' }]
            };

            if (provider === 'smmgen') updateData.smmgen_order_id = String(matchingOrder.id);
            if (provider === 'smmcost') updateData.smmcost_order_id = String(matchingOrder.id);
            if (provider === 'jbsmmpanel') updateData.jbsmmpanel_order_id = parseInt(matchingOrder.id);

            await supabase.from('orders').update(updateData).eq('id', order_id);

            return res.status(200).json({
                success: true,
                message: 'Your order was already placed. We have synced the status.',
                provider_order_id: matchingOrder.id,
                is_duplicate: true
            });
        }

        // 4. No matching order found: Safe to submit to provider
        try {
            const providerResponse = await placeProviderOrder(provider, {
                service: provider_service_id,
                link: orderDetails.link,
                quantity: orderDetails.quantity
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
                    message: 'Order successfully placed!',
                    provider_order_id: providerOrderId
                });
            } else {
                throw new Error('Provider failed to return order ID');
            }
        } catch (pError) {
            console.error('[USER RETRY FAILURE]:', pError.message);

            await supabase.from('orders').update({
                last_provider_error: pError.message,
                reconciliation_log: [...reconciliation_log, { ...logEntry, action: 'submission_failed', error: pError.message }]
            }).eq('id', order_id);

            return res.status(502).json({
                error: 'Provider Error',
                message: 'Failed to place order at the source. Please try again in 5 minutes.',
                details: pError.message
            });
        }

    } catch (error) {
        console.error('Order Retry API Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
