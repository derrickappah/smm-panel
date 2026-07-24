import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { fetchProviderOrderStatus } from '../utils/providers.js';
import { getCached, setCached } from '../utils/redisClient.js';

// Helper to fetch services list from any SMM provider API (with Upstash Redis caching)
async function fetchProviderServices(provider) {
    const p = provider.toLowerCase();
    const cacheKey = `smm:provider:${p}:services`;

    try {
        const cached = await getCached(cacheKey);
        if (cached && Array.isArray(cached)) {
            return cached;
        }
    } catch (cacheErr) {
        // Continue to live fetch if cache fails
    }

    let apiUrl = '';
    let apiKey = '';
    let isJson = false;

    if (p === 'smmgen') {
        apiUrl = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
        apiKey = process.env.SMMGEN_API_KEY;
        isJson = true;
    } else if (p === 'smmcost') {
        apiUrl = process.env.SMMCOST_API_URL || 'https://smmcost.com/api/v2';
        apiKey = process.env.SMMCOST_API_KEY;
    } else if (p === 'jbsmmpanel') {
        apiUrl = process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2';
        apiKey = process.env.JBSMMPANEL_API_KEY;
    } else if (p === 'worldofsmm') {
        apiUrl = process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2';
        apiKey = process.env.WORLDOFSMM_API_KEY;
    } else if (p === 'g1618') {
        apiUrl = process.env.G1618_API_URL || 'https://g1618.com/api/v2';
        apiKey = process.env.G1618_API_KEY;
    } else if (p === 'oldsmm') {
        apiUrl = process.env.OLDSMM_API_URL || 'https://oldsmm.com/api/v2';
        apiKey = process.env.OLDSMM_API_KEY;
    }

    if (!apiKey || apiKey.includes('PLACEHOLDER')) return [];

    try {
        let response;
        if (isJson) {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: apiKey, action: 'services' })
            });
        } else {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ key: apiKey, action: 'services' }).toString()
            });
        }

        if (!response.ok) return [];
        const data = await response.json();
        const servicesList = Array.isArray(data) ? data : [];
        if (servicesList.length > 0) {
            await setCached(cacheKey, servicesList, 600);
        }
        return servicesList;
    } catch (e) {
        console.error(`Fetch services list failed for ${provider}:`, e.message);
        return [];
    }
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // 1. Verify Admin access
        const { isAdmin } = await verifyAdmin(req);
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized' });

        const { action } = req.body;
        const supabase = getServiceRoleClient();

        if (action === 'catalog') {
            // Mode 1: Catalog Rate Mismatch Checker
            // Fetch all local database services that are imported from a provider
            const { data: localServices, error: fetchError } = await supabase
                .from('services')
                .select('id, name, rate, platform, enabled, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, worldofsmm_service_id, g1618_service_id, oldsmm_service_id')
                .order('name');

            if (fetchError) throw fetchError;

            // Group local services by provider and find active provider IDs
            const providers = ['smmgen', 'smmcost', 'jbsmmpanel', 'worldofsmm', 'g1618', 'oldsmm'];
            const liveCatalogs = {};

            // Fetch live service catalogs in parallel
            await Promise.all(providers.map(async (provider) => {
                liveCatalogs[provider] = await fetchProviderServices(provider);
            }));

            const discrepancies = [];

            for (const service of localServices) {
                let provider = null;
                let providerServiceId = null;

                if (service.smmgen_service_id && service.smmgen_service_id !== "order not placed at smm gen") {
                    provider = 'smmgen';
                    providerServiceId = service.smmgen_service_id;
                } else if (service.smmcost_service_id) {
                    provider = 'smmcost';
                    providerServiceId = service.smmcost_service_id;
                } else if (service.jbsmmpanel_service_id) {
                    provider = 'jbsmmpanel';
                    providerServiceId = service.jbsmmpanel_service_id;
                } else if (service.worldofsmm_service_id) {
                    provider = 'worldofsmm';
                    providerServiceId = service.worldofsmm_service_id;
                } else if (service.g1618_service_id) {
                    provider = 'g1618';
                    providerServiceId = service.g1618_service_id;
                } else if (service.oldsmm_service_id) {
                    provider = 'oldsmm';
                    providerServiceId = service.oldsmm_service_id;
                }

                if (!provider || !providerServiceId) continue;

                // Look up in live catalog
                const catalog = liveCatalogs[provider] || [];
                const liveItem = catalog.find(item => {
                    const id = item.service || item.id || item.service_id || item.serviceId || item.ID;
                    return String(id) === String(providerServiceId);
                });

                if (liveItem) {
                    const liveRate = liveItem.rate ? parseFloat(liveItem.rate) : 0;
                    discrepancies.push({
                        service_id: service.id,
                        name: service.name,
                        platform: service.platform,
                        enabled: service.enabled,
                        provider,
                        provider_service_id: providerServiceId,
                        local_rate: parseFloat(service.rate),
                        live_rate: liveRate,
                        min: liveItem.min || 'N/A',
                        max: liveItem.max || 'N/A'
                    });
                }
            }

            return res.status(200).json({ success: true, discrepancies });

        } else if (action === 'orders') {
            // Mode 2: Order Price Auditor
            // Fetch last 40 orders submitted to providers
            const { data: recentOrders, error: fetchError } = await supabase
                .from('orders')
                .select('id, created_at, status, quantity, total_cost, service_id, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, g1618_order_id, oldsmm_order_id, services(name, rate)')
                .order('created_at', { ascending: false })
                .limit(40);

            if (fetchError) throw fetchError;

            const orderAudits = [];

            // Audit in parallel batches
            await Promise.all(recentOrders.map(async (order) => {
                let provider = null;
                let providerOrderId = null;

                if (order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen" && order.smmgen_order_id !== order.id) {
                    provider = 'smmgen';
                    providerOrderId = order.smmgen_order_id;
                } else if (order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost") {
                    provider = 'smmcost';
                    providerOrderId = order.smmcost_order_id;
                } else if (order.jbsmmpanel_order_id && Number(order.jbsmmpanel_order_id) > 0) {
                    provider = 'jbsmmpanel';
                    providerOrderId = order.jbsmmpanel_order_id;
                } else if (order.worldofsmm_order_id) {
                    provider = 'worldofsmm';
                    providerOrderId = order.worldofsmm_order_id;
                } else if (order.g1618_order_id) {
                    provider = 'g1618';
                    providerOrderId = order.g1618_order_id;
                } else if (order.oldsmm_order_id) {
                    provider = 'oldsmm';
                    providerOrderId = order.oldsmm_order_id;
                }

                if (!provider || !providerOrderId) return;

                try {
                    // Fetch order status from provider
                    const providerStatus = await fetchProviderOrderStatus(provider, providerOrderId);
                    
                    if (providerStatus && providerStatus.charge !== undefined) {
                        const charge = parseFloat(providerStatus.charge);
                        const quantity = parseInt(order.quantity, 10);
                        
                        if (quantity > 0) {
                            // Calculate provider rate per 1k at the time of the order
                            const billedRatePer1k = (charge / quantity) * 1000;
                            
                            orderAudits.push({
                                order_id: order.id,
                                created_at: order.created_at,
                                service_name: order.services?.name || 'Unknown Service',
                                local_service_rate: order.services?.rate ? parseFloat(order.services.rate) : null,
                                quantity,
                                local_cost_charged: parseFloat(order.total_cost),
                                provider,
                                provider_order_id: providerOrderId,
                                provider_charge: charge,
                                provider_billed_rate: billedRatePer1k,
                                provider_status: providerStatus.status || 'Unknown'
                            });
                        }
                    }
                } catch (e) {
                    console.error(`Audit failed for order ${order.id} (${provider}):`, e.message);
                }
            }));

            // Sort by order date descending
            orderAudits.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return res.status(200).json({ success: true, audits: orderAudits });

        } else {
            return res.status(400).json({ error: 'Invalid action parameter' });
        }

    } catch (error) {
        console.error('Rate catcher error:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Internal server error'
        });
    }
}
