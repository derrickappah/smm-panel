import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';
import { placeProviderOrder, extractOrderId } from '../utils/providers.js';
import {
    cleanUrl,
    validateUrlForService,
    classifyProviderError,
    shouldAutoRefund,
    isInvalidServiceError,
    PROVIDER_ERROR_TYPES,
} from '../utils/orderValidation.js';
import crypto from 'crypto';

export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // ── Authentication ────────────────────────────────────────────────────
        let user;
        try {
            const authResult = await verifyAuth(req);
            user = authResult.user;
        } catch (authError) {
            return res.status(401).json({
                error: 'Authentication required',
                message: authError.message,
            });
        }

        const { service_id, package_id, link: rawLink, quantity, total_cost, comments } = req.body;

        // ── Basic field validation ────────────────────────────────────────────
        if (!rawLink || typeof rawLink !== 'string' || rawLink.trim() === '') {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (!quantity || (!service_id && !package_id)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const numericCost = parseFloat(total_cost);
        if (isNaN(numericCost) || numericCost <= 0) {
            return res.status(400).json({ error: 'Invalid total cost. Must be a positive number.' });
        }

        const supabase = getServiceRoleClient();

        // ── STEP 1: Clean URL ─────────────────────────────────────────────────
        // Extract the first valid http(s):// URL from the raw input.
        // This handles cases like: "Check this https://vt.tiktok.com/ZSCup9dfB/ 😂"
        const cleanedLink = cleanUrl(rawLink.trim());
        if (!cleanedLink) {
            return res.status(400).json({ error: 'Enter a valid link.' });
        }

        console.log('[ORDER] URL cleaned:', { raw: rawLink.trim(), cleaned: cleanedLink });

        // ── Rate Limit Check ──────────────────────────────────────────────────
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
                p_metadata: { user_id: user.id, count: recentOrderCount },
            });
            return res.status(429).json({ error: 'Too many orders. Please wait a minute.' });
        }

        // ── Resolve service / package ─────────────────────────────────────────
        let provider = null;
        let provider_service_id = null;
        let is_combo = false;
        let combo_components = [];
        let serviceUrlType = null; // From services.url_type or promotion_packages.url_type

        if (service_id) {
            const { data: service, error: sErr } = await supabase
                .from('services')
                .select('*')
                .eq('id', service_id)
                .single();

            if (sErr || !service || !service.enabled) {
                return res.status(400).json({ error: 'Service not found or disabled' });
            }

            // Capture url_type for validation below
            serviceUrlType = service.url_type || null;

            is_combo = service.is_combo || false;

            if (is_combo) {
                if (service.combo_smmgen_service_ids && Array.isArray(service.combo_smmgen_service_ids) && service.combo_smmgen_service_ids.length > 0) {
                    combo_components = service.combo_smmgen_service_ids.map(sid => ({
                        provider: 'smmgen',
                        service_id: sid,
                    }));
                } else if (service.combo_service_ids && Array.isArray(service.combo_service_ids)) {
                    // Resolve component service IDs from DB dynamically
                    const componentIds = service.combo_service_ids.map(item => typeof item === 'object' && item !== null ? item.id : item);
                    const { data: compServices, error: compErr } = await supabase
                        .from('services')
                        .select('id, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, worldofsmm_service_id, g1618_service_id, oldsmm_service_id, apiowner_service_id')
                        .in('id', componentIds);

                    if (!compErr && compServices) {
                        const orderedServices = componentIds.map(id => compServices.find(s => s.id === id)).filter(Boolean);
                        for (const s of orderedServices) {
                            let compProvider = null;
                            let compProviderId = null;
                            if (s.smmgen_service_id) {
                                compProvider = 'smmgen';
                                compProviderId = s.smmgen_service_id;
                            } else if (s.smmcost_service_id) {
                                compProvider = 'smmcost';
                                compProviderId = s.smmcost_service_id;
                            } else if (s.jbsmmpanel_service_id) {
                                compProvider = 'jbsmmpanel';
                                compProviderId = s.jbsmmpanel_service_id;
                            } else if (s.worldofsmm_service_id) {
                                compProvider = 'worldofsmm';
                                compProviderId = s.worldofsmm_service_id;
                            } else if (s.g1618_service_id) {
                                compProvider = 'g1618';
                                compProviderId = s.g1618_service_id;
                            } else if (s.oldsmm_service_id) {
                                compProvider = 'oldsmm';
                                compProviderId = s.oldsmm_service_id;
                            } else if (s.apiowner_service_id) {
                                compProvider = 'apiowner';
                                compProviderId = s.apiowner_service_id;
                            }

                            if (compProvider && compProviderId) {
                                combo_components.push({
                                    provider: compProvider,
                                    service_id: String(compProviderId)
                                });
                            }
                        }
                    }
                }
            } else {
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
                } else if (service.oldsmm_service_id) {
                    provider = 'oldsmm';
                    provider_service_id = service.oldsmm_service_id;
                } else if (service.apiowner_service_id) {
                    provider = 'apiowner';
                    provider_service_id = service.apiowner_service_id;
                }

                if (provider && provider_service_id) {
                    combo_components = [{ provider, service_id: provider_service_id }];
                }
            }

            // Quantity validation
            if (quantity < service.min_quantity || quantity > service.max_quantity) {
                return res.status(400).json({
                    error: `Quantity must be between ${service.min_quantity} and ${service.max_quantity}`,
                });
            }

            console.log('[ORDER] Service provider detection:', {
                service_id: service.id,
                service_name: service.name,
                url_type: serviceUrlType,
                is_combo,
                provider,
                provider_service_id,
                combo_components_count: combo_components.length,
            });
        } else if (package_id) {
            const { data: pkg, error: pErr } = await supabase
                .from('promotion_packages')
                .select('*')
                .eq('id', package_id)
                .single();

            if (pErr || !pkg) return res.status(400).json({ error: 'Package not found' });

            // Capture url_type for packages
            serviceUrlType = pkg.url_type || null;

            is_combo = pkg.is_combo || false;

            if (is_combo) {
                if (pkg.combo_smmgen_service_ids && Array.isArray(pkg.combo_smmgen_service_ids) && pkg.combo_smmgen_service_ids.length > 0) {
                    combo_components = pkg.combo_smmgen_service_ids.map(sid => ({
                        provider: 'smmgen',
                        service_id: sid,
                    }));
                } else if (pkg.combo_package_ids && Array.isArray(pkg.combo_package_ids)) {
                    // Resolve component package IDs from DB dynamically
                    const componentIds = pkg.combo_package_ids.map(item => typeof item === 'object' && item !== null ? item.id : item);
                    const { data: compPkgs, error: compErr } = await supabase
                        .from('promotion_packages')
                        .select('id, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, worldofsmm_service_id, g1618_service_id, oldsmm_service_id, apiowner_service_id')
                        .in('id', componentIds);

                    if (!compErr && compPkgs) {
                        const orderedPkgs = componentIds.map(id => compPkgs.find(p => p.id === id)).filter(Boolean);
                        for (const p of orderedPkgs) {
                            let compProvider = null;
                            let compProviderId = null;
                            if (p.smmgen_service_id) {
                                compProvider = 'smmgen';
                                compProviderId = p.smmgen_service_id;
                            } else if (p.smmcost_service_id) {
                                compProvider = 'smmcost';
                                compProviderId = p.smmcost_service_id;
                            } else if (p.jbsmmpanel_service_id) {
                                compProvider = 'jbsmmpanel';
                                compProviderId = p.jbsmmpanel_service_id;
                            } else if (p.worldofsmm_service_id) {
                                compProvider = 'worldofsmm';
                                compProviderId = p.worldofsmm_service_id;
                            } else if (p.g1618_service_id) {
                                compProvider = 'g1618';
                                compProviderId = p.g1618_service_id;
                            } else if (p.oldsmm_service_id) {
                                compProvider = 'oldsmm';
                                compProviderId = p.oldsmm_service_id;
                            } else if (p.apiowner_service_id) {
                                compProvider = 'apiowner';
                                compProviderId = p.apiowner_service_id;
                            }

                            if (compProvider && compProviderId) {
                                combo_components.push({
                                    provider: compProvider,
                                    service_id: String(compProviderId)
                                });
                            }
                        }
                    }
                }
            } else {
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
                } else if (pkg.oldsmm_service_id) {
                    provider = 'oldsmm';
                    provider_service_id = pkg.oldsmm_service_id;
                } else if (pkg.apiowner_service_id) {
                    provider = 'apiowner';
                    provider_service_id = pkg.apiowner_service_id;
                }

                if (provider && provider_service_id) {
                    combo_components = [{ provider, service_id: provider_service_id }];
                }
            }

            console.log('[ORDER] Package provider detection:', {
                package_id: pkg.id,
                package_name: pkg.name,
                url_type: serviceUrlType,
                is_combo,
                provider,
                provider_service_id,
                combo_components_count: combo_components.length,
            });
        }

        // ── STEP 2: URL Type Validation ───────────────────────────────────────
        // Validate the cleaned URL against the service's required url_type.
        // Services with url_type = null skip this check.
        const urlValidation = validateUrlForService(cleanedLink, serviceUrlType);
        if (!urlValidation.valid) {
            console.log('[ORDER] URL type validation failed:', {
                url: cleanedLink,
                required: serviceUrlType,
                message: urlValidation.message,
            });
            return res.status(400).json({ error: urlValidation.message });
        }

        // ── STEP 3: Duplicate Active Order Check ──────────────────────────────
        // Prevent placing the same service on the same link while an active order exists.
        // Different service → allowed. Same service, different link → allowed.
        if (service_id) {
            const { data: activeOrders, error: dupErr } = await supabase
                .from('orders')
                .select('id, status, created_at')
                .eq('user_id', user.id)
                .eq('service_id', service_id)
                .eq('link', cleanedLink)
                .in('status', ['pending', 'processing', 'in progress'])
                .limit(1);

            if (!dupErr && activeOrders && activeOrders.length > 0) {
                console.log('[ORDER] Duplicate active order blocked:', {
                    user_id: user.id,
                    service_id,
                    link: cleanedLink,
                    existing_order_id: activeOrders[0].id,
                    existing_status: activeOrders[0].status,
                });
                return res.status(409).json({ error: 'Active order already exists.' });
            }
        }

        // ── STEP 4: Provider Service Validation (pre-deduction) ───────────────
        // Verify the mapped provider service ID actually exists at the provider.
        // This prevents balance deduction for invalid/deleted service IDs.
        // On network failure we fail-open (log + continue) to avoid blocking valid orders.
        if (!is_combo && provider && provider_service_id) {
            const serviceValid = await validateProviderService(provider, provider_service_id);
            if (serviceValid === false) {
                // The provider explicitly confirmed the service is invalid
                console.error('[ORDER] Provider service validation failed:', {
                    provider,
                    provider_service_id,
                });
                // Log for admin
                await supabase.rpc('log_system_event', {
                    p_type: 'invalid_provider_service',
                    p_severity: 'error',
                    p_source: 'order-create',
                    p_description: `Provider service ${provider_service_id} not found at ${provider}`,
                    p_metadata: { provider, provider_service_id, service_id: service_id || null },
                }).catch(() => {}); // Non-blocking
                return res.status(400).json({ error: 'Service temporarily unavailable.' });
            }
            // serviceValid === null means check was inconclusive (network error) — proceed
        }

        // ── STEP 5: Idempotency Check ─────────────────────────────────────────
        const hashData = `${user.id}-${service_id || package_id}-${cleanedLink}-${quantity}-${Math.floor(Date.now() / 60000)}`;
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
                order_id: existingOrder.id,
            });
        }

        // ── STEP 6: Atomic Balance Deduction & Order Creation ─────────────────
        const { data: rpcResult, error: rpcError } = await supabase.rpc('create_secure_order', {
            p_user_id: user.id,
            p_service_id: service_id || null,
            p_package_id: package_id || null,
            p_link: cleanedLink,
            p_quantity: parseInt(quantity),
            p_total_cost: parseFloat(total_cost),
            p_idempotency_key: idempotencyHash,
        });

        if (rpcError || !rpcResult?.success) {
            return res.status(400).json({
                error: rpcError?.message || rpcResult?.message || 'Failed to process order',
            });
        }

        const order_id = rpcResult.order_id;

        // ── STEP 7: Call Provider API(s) ──────────────────────────────────────
        console.log('[ORDER] Submitting to providers:', {
            combo_components_length: combo_components.length,
            components: combo_components,
        });

        if (combo_components.length > 0) {
            const componentResults = [];
            let someSuccess = false;
            let allFailed = true;
            let lastError = null;
            let lastErrorDetails = null;

            for (const component of combo_components) {
                try {
                    const providerResponse = await placeProviderOrder(component.provider, {
                        service: component.service_id,
                        link: cleanedLink,
                        quantity,
                        comments: comments ? String(comments).trim() : undefined,
                    });

                    const providerOrderId = extractOrderId(providerResponse);

                    if (providerOrderId) {
                        someSuccess = true;
                        allFailed = false;
                        componentResults.push({
                            provider: component.provider,
                            service_id: component.service_id,
                            provider_order_id: String(providerOrderId),
                            status: 'submitted',
                            submitted_at: new Date().toISOString(),
                        });
                    } else {
                        // Provider returned a response but no order ID — treat as failure
                        lastError = 'No order ID returned by provider';
                        lastErrorDetails = providerResponse;
                        componentResults.push({
                            provider: component.provider,
                            service_id: component.service_id,
                            error: lastError,
                            status: 'failed',
                        });
                    }
                } catch (pError) {
                    console.error(`[ORDER] Provider error [${component.provider}]:`, pError.message);
                    lastError = pError.message;
                    lastErrorDetails = pError.providerDetails || null;
                    componentResults.push({
                        provider: component.provider,
                        service_id: component.service_id,
                        error: pError.message,
                        status: 'failed',
                    });
                }
            }

            // ── Partial or full success ───────────────────────────────────────
            if (someSuccess) {
                const updateData = {
                    component_provider_order_ids: componentResults,
                    submitted_at: new Date().toISOString(),
                    status: 'processing',
                };

                // Legacy single-provider column support
                const firstSuccess = componentResults.find(r => r.provider_order_id);
                if (firstSuccess) {
                    const p = firstSuccess.provider;
                    const pid = firstSuccess.provider_order_id;
                    if (p === 'smmgen')     updateData.smmgen_order_id    = pid;
                    if (p === 'smmcost')    updateData.smmcost_order_id   = pid;
                    if (p === 'jbsmmpanel') updateData.jbsmmpanel_order_id = parseInt(pid);
                    if (p === 'worldofsmm') updateData.worldofsmm_order_id = pid;
                    if (p === 'g1618')      updateData.g1618_order_id     = pid;
                    if (p === 'oldsmm')     updateData.oldsmm_order_id    = pid;
                    if (p === 'apiowner')   updateData.apiowner_order_id  = pid;
                }

                await supabase.from('orders').update(updateData).eq('id', order_id);

                return res.status(200).json({
                    success: true,
                    order_id,
                    components: componentResults,
                    new_balance: rpcResult.new_balance,
                });
            }

            // ── Total failure: auto-refund ────────────────────────────────────
            console.error('[ORDER] All components failed — triggering auto-refund:', {
                order_id,
                lastError,
                componentResults,
            });

            // Save failure state to order (in case refund RPC also fails, admin can see it)
            await supabase.from('orders').update({
                status: 'submission_failed',
                last_provider_error: lastError || 'All provider components failed',
                provider_error_details: {
                    components: componentResults,
                    error: lastError,
                    details: lastErrorDetails,
                },
            }).eq('id', order_id);

            // Auto-refund
            const refundResult = await supabase.rpc('process_automatic_refund', {
                p_order_id:       String(order_id),
                p_refund_amount:  parseFloat(total_cost),
                p_refund_type:    'full',
                p_remains:        0,
                p_provider_error: lastError || 'Provider failed to place order',
                p_error_details:  JSON.stringify({
                    components: componentResults,
                    error: lastError,
                    details: lastErrorDetails,
                }),
            });

            if (refundResult.data?.success) {
                console.log('[ORDER] Auto-refund successful:', {
                    order_id,
                    amount: total_cost,
                    new_balance: refundResult.data.new_balance,
                });
                return res.status(200).json({
                    success: false,
                    refunded: true,
                    message: 'Refunded automatically.',
                    order_id,
                });
            } else {
                // Refund failed — log for admin, but do not expose internal error to customer
                console.error('[ORDER] CRITICAL: Auto-refund failed!', {
                    order_id,
                    refundError: refundResult.data?.error || refundResult.error,
                });
                await supabase.rpc('log_system_event', {
                    p_type:        'auto_refund_failed',
                    p_severity:    'critical',
                    p_source:      'order-create',
                    p_description: `Auto-refund failed for order ${order_id}. MANUAL REFUND REQUIRED.`,
                    p_metadata:    {
                        order_id,
                        user_id: user.id,
                        amount: total_cost,
                        provider_error: lastError,
                        refund_error: refundResult.data?.error,
                    },
                }).catch(() => {});

                return res.status(502).json({
                    error: 'Provider temporarily unavailable.',
                    message: 'Your order could not be placed. Please contact support if your balance was deducted.',
                    order_id,
                });
            }
        }

        // ── No provider configured ─────────────────────────────────────────────
        await supabase.from('orders').update({
            status: 'pending',
            submitted_at: new Date().toISOString(),
        }).eq('id', order_id);

        return res.status(200).json({
            success: true,
            order_id,
            new_balance: rpcResult.new_balance,
            warning: 'No provider configured for this service',
        });

    } catch (error) {
        console.error('[ORDER] Unexpected error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Service Validation Helper
//
// Returns:
//   true   — service exists and is valid
//   false  — service explicitly not found / invalid (provider confirmed)
//   null   — inconclusive (network error, API unavailable, format unknown)
// ─────────────────────────────────────────────────────────────────────────────
async function validateProviderService(provider, providerServiceId) {
    try {
        const apiConfig = getProviderApiConfig(provider);
        if (!apiConfig) return null; // Unknown provider — skip

        const { url, key, useJson } = apiConfig;
        if (!key) return null; // API key not configured — skip

        let response;
        if (useJson) {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, action: 'services' }),
                signal: AbortSignal.timeout(10000), // 10-second timeout
            });
        } else {
            const params = new URLSearchParams({ key, action: 'services' });
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params,
                signal: AbortSignal.timeout(10000),
            });
        }

        if (!response.ok) return null; // Provider API error — fail open

        const data = await response.json();
        if (!Array.isArray(data)) return null; // Unexpected format — fail open

        // Check if the service ID exists in the list
        const serviceIdStr = String(providerServiceId).trim();
        const found = data.some(s => {
            const sid = String(s.service || s.id || '').trim();
            return sid === serviceIdStr;
        });

        console.log(`[ORDER] Provider service validation [${provider}] service ${providerServiceId}:`, found ? 'FOUND' : 'NOT FOUND');
        return found; // true = valid, false = not found

    } catch (err) {
        // Network timeout, parse error, etc. — fail open (do not block order)
        console.warn(`[ORDER] Provider service validation inconclusive [${provider}]:`, err.message);
        return null;
    }
}

/**
 * Returns API config for a given provider, or null if unknown.
 */
function getProviderApiConfig(provider) {
    const configs = {
        smmgen: {
            url: process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2',
            key: process.env.SMMGEN_API_KEY,
            useJson: true,
        },
        smmcost: {
            url: process.env.SMMCOST_API_URL || 'https://smmcost.com/api/v2',
            key: process.env.SMMCOST_API_KEY,
            useJson: false,
        },
        jbsmmpanel: {
            url: process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2',
            key: process.env.JBSMMPANEL_API_KEY,
            useJson: false,
        },
        worldofsmm: {
            url: process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2',
            key: process.env.WORLDOFSMM_API_KEY,
            useJson: false,
        },
        g1618: {
            url: process.env.G1618_API_URL || 'https://g1618.com/api/v2',
            key: process.env.G1618_API_KEY,
            useJson: false,
        },
        oldsmm: {
            url: process.env.OLDSMM_API_URL || 'https://oldsmm.com/api/v2',
            key: process.env.OLDSMM_API_KEY,
            useJson: false,
        },
        apiowner: {
            url: process.env.APIOWNER_API_URL || 'https://apiowner.com/api/v2',
            key: process.env.APIOWNER_API_KEY,
            useJson: false,
        },
    };
    return configs[provider.toLowerCase()] || null;
}
