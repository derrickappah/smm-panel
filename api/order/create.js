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
        const { service_id, package_id, link, quantity, total_cost, comments } = req.body;

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

        let provider = null;
        let provider_service_id = null;
        let db_service_id = service_id;
        let is_combo = false;
        let combo_components = []; // Array of { provider, service_id }

        if (service_id) {
            const { data: service, error: sErr } = await supabase
                .from('services')
                .select('*')
                .eq('id', service_id)
                .single();

            if (sErr || !service || !service.enabled) {
                return res.status(400).json({ error: 'Service not found or disabled' });
            }

            is_combo = service.is_combo || false;

            if (is_combo && service.combo_smmgen_service_ids && Array.isArray(service.combo_smmgen_service_ids)) {
                combo_components = service.combo_smmgen_service_ids.map(sid => ({
                    provider: 'smmgen',
                    service_id: sid
                }));
            } else {
                // Determine provider for single service
                if (service.smmcost_service_id) {
                    provider = 'smmcost';
                    provider_service_id = service.smmcost_service_id;
                } else if (service.jbsmmpanel_service_id) {
                    provider = 'jbsmmpanel';
                    provider_service_id = service.jbsmmpanel_service_id;
                } else if (service.smmgen_service_id) {
                    provider = 'smmgen';
                    provider_service_id = service.smmgen_service_id;
                } else if (service.worldofsmm_service_id) {
                    provider = 'worldofsmm';
                    provider_service_id = service.worldofsmm_service_id;
                } else if (service.g1618_service_id) {
                    provider = 'g1618';
                    provider_service_id = service.g1618_service_id;
                }

                if (provider && provider_service_id) {
                    combo_components = [{ provider, service_id: provider_service_id }];
                }
            }

            // Quantity validation
            if (quantity < service.min_quantity || quantity > service.max_quantity) {
                return res.status(400).json({ error: `Quantity must be between ${service.min_quantity} and ${service.max_quantity}` });
            }

            // DEBUG: Log provider detection
            console.log('[ORDER DEBUG] Service provider detection:', {
                service_id: service.id,
                service_name: service.name,
                is_combo,
                provider,
                provider_service_id,
                combo_components_count: combo_components.length
            });
        } else if (package_id) {
            const { data: pkg, error: pErr } = await supabase
                .from('promotion_packages')
                .select('*')
                .eq('id', package_id)
                .single();

            if (pErr || !pkg) return res.status(400).json({ error: 'Package not found' });

            is_combo = pkg.is_combo || false;

            if (is_combo && pkg.combo_smmgen_service_ids && Array.isArray(pkg.combo_smmgen_service_ids)) {
                combo_components = pkg.combo_smmgen_service_ids.map(sid => ({
                    provider: 'smmgen',
                    service_id: sid
                }));
            } else {
                // Determine provider for single package (same priority as services)
                if (pkg.smmcost_service_id) {
                    provider = 'smmcost';
                    provider_service_id = pkg.smmcost_service_id;
                } else if (pkg.jbsmmpanel_service_id) {
                    provider = 'jbsmmpanel';
                    provider_service_id = pkg.jbsmmpanel_service_id;
                } else if (pkg.smmgen_service_id) {
                    provider = 'smmgen';
                    provider_service_id = pkg.smmgen_service_id;
                } else if (pkg.worldofsmm_service_id) {
                    provider = 'worldofsmm';
                    provider_service_id = pkg.worldofsmm_service_id;
                } else if (pkg.g1618_service_id) {
                    provider = 'g1618';
                    provider_service_id = pkg.g1618_service_id;
                }

                if (provider && provider_service_id) {
                    combo_components = [{ provider, service_id: provider_service_id }];
                }
            }

            // DEBUG: Log provider detection for packages
            console.log('[ORDER DEBUG] Package provider detection:', {
                package_id: pkg.id,
                package_name: pkg.name,
                is_combo,
                provider,
                provider_service_id,
                combo_components_count: combo_components.length
            });
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

        // 5. Call Provider API(s) (Server-Side)
        console.log('[ORDER DEBUG] About to submit to providers:', {
            combo_components_length: combo_components.length,
            components: combo_components
        });

        if (combo_components.length > 0) {
            const componentResults = [];
            let someSuccess = false;
            let lastError = null;

            // Place orders one after another as requested
            for (const component of combo_components) {
                try {
                    const providerResponse = await placeProviderOrder(component.provider, {
                        service: component.service_id,
                        link: link.trim(),
                        quantity: quantity,
                        comments: comments ? String(comments).trim() : undefined
                    });

                    const providerOrderId = extractOrderId(providerResponse);

                    if (providerOrderId) {
                        someSuccess = true;
                        componentResults.push({
                            provider: component.provider,
                            service_id: component.service_id,
                            provider_order_id: String(providerOrderId),
                            status: 'submitted',
                            submitted_at: new Date().toISOString()
                        });
                    } else {
                        componentResults.push({
                            provider: component.provider,
                            service_id: component.service_id,
                            error: 'No order ID returned',
                            status: 'failed'
                        });
                    }
                } catch (pError) {
                    console.error(`[COMPONENT ERROR] ${component.provider}:`, pError.message);
                    lastError = pError.message;
                    componentResults.push({
                        provider: component.provider,
                        service_id: component.service_id,
                        error: pError.message,
                        status: 'failed'
                    });
                }
            }

            // Update order with results
            if (someSuccess) {
                const updateData = {
                    component_provider_order_ids: componentResults,
                    submitted_at: new Date().toISOString(),
                    status: 'processing'
                };

                // Legacy column support for single orders or the first component
                const firstSuccess = componentResults.find(r => r.provider_order_id);
                if (firstSuccess) {
                    const p = firstSuccess.provider;
                    const pid = firstSuccess.provider_order_id;
                    if (p === 'smmgen') updateData.smmgen_order_id = pid;
                    if (p === 'smmcost') updateData.smmcost_order_id = pid;
                    if (p === 'jbsmmpanel') updateData.jbsmmpanel_order_id = parseInt(pid);
                    if (p === 'jbsmmpanel') updateData.jbsmmpanel_order_id = parseInt(pid);
                    if (p === 'worldofsmm') updateData.worldofsmm_order_id = pid;
                    if (p === 'g1618') updateData.g1618_order_id = pid;
                }

                await supabase.from('orders').update(updateData).eq('id', order_id);

                return res.status(200).json({
                    success: true,
                    order_id,
                    components: componentResults,
                    new_balance: rpcResult.new_balance
                });
            } else {
                // Total failure
                await supabase.from('orders').update({
                    status: 'submission_failed',
                    last_provider_error: lastError || 'All components failed to submit',
                    component_provider_order_ids: componentResults
                }).eq('id', order_id);

                return res.status(502).json({
                    error: lastError || 'Provider Error',
                    message: 'Failed to submit order to provider. It has been saved for retry.',
                    details: componentResults
                });
            }
        }

        // No provider configured - mark as pending manual processing
        await supabase.from('orders').update({
            status: 'pending',
            submitted_at: new Date().toISOString()
        }).eq('id', order_id);

        return res.status(200).json({
            success: true,
            order_id,
            new_balance: rpcResult.new_balance,
            warning: 'No provider configured for this service'
        });

    } catch (error) {
        console.error('Order Creation Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
