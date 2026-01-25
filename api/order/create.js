import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';
import { placeProviderOrder, extractOrderId } from '../utils/providers.js';
import crypto from 'crypto';

export default async function handler(req, res) {
    // CORS Headers - updated for deployment trigger v2
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { user, supabase: userSupabase } = await verifyAuth(req);
        const { service_id, package_id, link, quantity, total_cost } = req.body;

        // 1. Basic Validation
        if (!link || !quantity || !total_cost || (!service_id && !package_id)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // URL Validation (Defensive)
        const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .?=@&%+-]*)*\/?$/;
        if (!urlPattern.test(link)) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        const supabase = getServiceRoleClient();

        // 1b. Rate Limit Check (Defensive)
        const { count: recentOrderCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('created_at', new Date(Date.now() - 60000).toISOString());

        if (recentOrderCount > 10) {
            await supabase.rpc('log_system_event', {
                p_type: 'rate_limit_exceeded',
                p_severity: 'warning',
                p_source: 'order-create',
                p_description: `User ${user.id} exceeded order rate limit (${recentOrderCount} in last min)`,
                p_metadata: { user_id: user.id, count: recentOrderCount }
            });
            return res.status(429).json({ error: 'Too many orders. Please wait a minute.' });
        }

        // 2. Fetch Service/Package Details for Validation
        let provider = null;
        let provider_service_id = null;
        let db_service_id = service_id;

        if (service_id) {
            const { data: service, error: sErr } = await supabase
                .from('services')
                .select('*')
                .eq('id', service_id)
                .single();

            if (sErr || !service || !service.enabled) {
                return res.status(400).json({ error: 'Service not found or disabled' });
            }

            // Determine provider
            if (service.smmcost_service_id) {
                provider = 'smmcost';
                provider_service_id = service.smmcost_service_id;
            } else if (service.jbsmmpanel_service_id) {
                provider = 'jbsmmpanel';
                provider_service_id = service.jbsmmpanel_service_id;
            } else if (service.smmgen_service_id) {
                provider = 'smmgen';
                provider_service_id = service.smmgen_service_id;
            }

            // Quantity validation
            if (quantity < service.min_quantity || quantity > service.max_quantity) {
                return res.status(400).json({ error: `Quantity must be between ${service.min_quantity} and ${service.max_quantity}` });
            }
        } else if (package_id) {
            const { data: pkg, error: pErr } = await supabase
                .from('promotion_packages')
                .select('*')
                .eq('id', package_id)
                .single();

            if (pErr || !pkg) return res.status(400).json({ error: 'Package not found' });

            // For simplicity in this endpoint, we'll focus on regular services first.
            // Packages can be added later or handled as individual service calls if combo.
            provider = 'smmgen'; // Default provider for packages if set
            provider_service_id = pkg.smmgen_service_id;
        }

        // 3. Idempotency Check
        const hashData = `${user.id}-${service_id || package_id}-${link}-${quantity}-${Math.floor(Date.now() / 60000)}`;
        const idempotencyHash = crypto.createHash('md5').update(hashData).digest('hex');

        const { data: existingOrder } = await supabase
            .from('orders')
            .select('id, smmgen_order_id')
            .eq('user_id', user.id)
            .eq('idempotency_key', idempotencyHash)
            .maybeSingle();

        if (existingOrder) {
            return res.status(409).json({
                error: 'Duplicate order detected',
                message: 'A similar order was placed in the last minute.',
                order_id: existingOrder.id
            });
        }

        // 4. Atomic Balance Deduction & Order Creation (DB Level)
        // We use a custom RPC to ensure balance check + deduction + order insert is one transaction
        const { data: rpcResult, error: rpcError } = await supabase.rpc('create_secure_order', {
            p_user_id: user.id,
            p_service_id: service_id,
            p_package_id: package_id,
            p_link: link.trim(),
            p_quantity: parseInt(quantity),
            p_total_cost: parseFloat(total_cost),
            p_idempotency_key: idempotencyHash
        });

        if (rpcError || !rpcResult?.success) {
            return res.status(400).json({ error: rpcError?.message || rpcResult?.message || 'Failed to process order' });
        }

        const order_id = rpcResult.order_id;

        // 5. Call Provider API (Server-Side)
        if (provider && provider_service_id) {
            try {
                const providerResponse = await placeProviderOrder(provider, {
                    service: provider_service_id,
                    link: link.trim(),
                    quantity: quantity
                });

                const providerOrderId = extractOrderId(providerResponse);

                if (providerOrderId) {
                    // Update order with provider ID
                    const updateData = {};
                    if (provider === 'smmgen') updateData.smmgen_order_id = String(providerOrderId);
                    if (provider === 'smmcost') updateData.smmcost_order_id = String(providerOrderId);
                    if (provider === 'jbsmmpanel') updateData.jbsmmpanel_order_id = parseInt(providerOrderId);

                    await supabase.from('orders').update({
                        ...updateData,
                        submitted_at: new Date().toISOString(),
                        status: 'processing'
                    }).eq('id', order_id);

                    return res.status(200).json({
                        success: true,
                        order_id,
                        provider_order_id: providerOrderId,
                        new_balance: rpcResult.new_balance
                    });
                } else {
                    const error = new Error('Provider failed to return order ID');
                    error.providerDetails = providerResponse; // Capture the unexpected success response
                    throw error;
                }
            } catch (pError) {
                console.error('Provider Error:', pError);

                // Track failure with detailed logs
                await supabase.from('orders').update({
                    provider_error_count: 1,
                    last_provider_error: pError.message,
                    provider_error_details: pError.providerDetails || null
                }).eq('id', order_id);

                // Log to system_events
                await supabase.rpc('log_system_event', {
                    p_type: 'provider_submission_failure',
                    p_severity: 'error',
                    p_source: 'order-create',
                    p_description: `Failed to submit order ${order_id} to ${provider}: ${pError.message}`,
                    p_metadata: {
                        order_id,
                        provider,
                        error: pError.message,
                        service: provider_service_id,
                        user_id: user.id
                    },
                    p_entity_type: 'order',
                    p_entity_id: order_id
                });

                // Refund balance if provider fails
                await supabase.rpc('refund_failed_order', {
                    p_order_id: order_id,
                    p_user_id: user.id,
                    p_amount: parseFloat(total_cost)
                });

                return res.status(502).json({
                    error: 'Provider Error',
                    message: 'The provider failed to process your order. Your balance has been refunded.',
                    details: pError.message
                });
            }
        }

        // Success (Local Only or No Provider needed)
        return res.status(200).json({
            success: true,
            order_id,
            new_balance: rpcResult.new_balance
        });

    } catch (error) {
        console.error('Order Creation Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
