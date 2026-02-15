/**
 * Unified Order Status Check API
 * 
 * This endpoint handles bulk status checks for both regular users and admins.
 * - Regular users: Restricted to their own orders via RLS.
 * - Admins: Can check any order using elevated service role privileges.
 */

import { verifyAuth, getServiceRoleClient } from './utils/auth.js';
import {
    mapSMMGenStatus,
    mapSMMCostStatus,
    mapJBSMMPanelStatus,
    mapWorldOfSMMStatus,
    mapG1618Status
} from './utils/statusMapping.js';

const REQUEST_TIMEOUT = 15000; // 15 seconds per provider call

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // 1. Authentication & Role Detection
        const { user, supabase: userClient } = await verifyAuth(req);
        const { orderIds } = req.body;

        if (!orderIds || !Array.isArray(orderIds)) {
            return res.status(400).json({ error: 'Missing or invalid orderIds array' });
        }

        // Check if user is admin to determine client type
        const { data: profile } = await userClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        const isAdmin = profile?.role === 'admin';

        // Use service role for admins to bypass RLS, user client for regular users
        const dbClient = isAdmin ? getServiceRoleClient() : userClient;

        console.log(`[StatusCheck] Request by ${user.id} (isAdmin: ${isAdmin}) for ${orderIds.length} orders`);

        // 2. Fetch orders from database (restricted by client permissions)
        const { data: orders, error: fetchError } = await dbClient
            .from('orders')
            .select('*')
            .in('id', orderIds.slice(0, 100)); // Increased limit to 100

        if (fetchError) throw fetchError;
        if (!orders || orders.length === 0) {
            return res.status(404).json({ error: 'No orders found or access denied' });
        }

        // 3. Group orders by provider
        const groups = {
            smmgen: orders.filter(o => o.smmgen_order_id && o.smmgen_order_id !== "order not placed at smm gen" && o.smmgen_order_id !== o.id),
            smmcost: orders.filter(o => o.smmcost_order_id && String(o.smmcost_order_id).toLowerCase() !== "order not placed at smmcost"),
            jbsmmpanel: orders.filter(o => o.jbsmmpanel_order_id && Number(o.jbsmmpanel_order_id) > 0),
            worldofsmm: orders.filter(o => o.worldofsmm_order_id && o.worldofsmm_order_id !== "order not placed at worldofsmm"),
            g1618: orders.filter(o => o.g1618_order_id && o.g1618_order_id !== "order not placed at g1618")
        };

        const results = {
            checked: 0,
            updated: 0,
            errors: [],
            details: []
        };

        // Helper to update order in database
        const updateOrder = async (orderId, newStatus, provider) => {
            const { error: updateError } = await dbClient
                .from('orders')
                .update({
                    status: newStatus,
                    last_status_check: new Date().toISOString()
                })
                .eq('id', orderId);

            if (updateError) {
                console.error(`Failed to update order ${orderId}:`, updateError);
                return false;
            }
            return true;
        };

        // Generic Provider Processor for Batch Status
        const processProviderBatch = async (providerName, providerOrders, apiUrl, apiKey, mapper, orderIdField, isJson = false) => {
            if (providerOrders.length === 0) return;

            const ids = providerOrders.map(o => o[orderIdField]).join(',');
            console.log(`[StatusCheck] Checking ${providerName} batch: ${ids}`);

            try {
                let response;
                if (isJson) {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: apiKey, action: 'status', orders: ids })
                    });
                } else {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        body: new URLSearchParams({ key: apiKey, action: 'status', orders: ids })
                    });
                }

                const data = await response.json();

                // SMM panels return an object keyed by order ID when 'orders' action is used
                // Example: { "123": { "status": "Completed" }, "124": { "status": "Processing" } }
                for (const order of providerOrders) {
                    results.checked++;
                    const panelId = order[orderIdField].toString();
                    const statusInfo = data[panelId];

                    if (statusInfo) {
                        const rawStatus = statusInfo.status || statusInfo.Status;
                        const mappedStatus = mapper(rawStatus);

                        if (mappedStatus && mappedStatus !== order.status) {
                            if (await updateOrder(order.id, mappedStatus, providerName)) {
                                results.updated++;
                                results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: providerName });
                            }
                        }
                    } else {
                        // If not in batch response, fall back to individual check if only one order
                        if (providerOrders.length === 1) {
                            const rawStatus = data.status || data.Status;
                            const mappedStatus = mapper(rawStatus);
                            if (mappedStatus && mappedStatus !== order.status) {
                                if (await updateOrder(order.id, mappedStatus, providerName)) {
                                    results.updated++;
                                    results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: providerName });
                                }
                            }
                        } else {
                            results.errors.push({ id: order.id, provider: providerName, error: 'Status not found in batch response' });
                        }
                    }
                }
            } catch (err) {
                console.error(`[StatusCheck] Error in ${providerName} batch:`, err);
                for (const order of providerOrders) {
                    results.errors.push({ id: order.id, provider: providerName, error: err.message });
                }
            }
        };

        // 4-8. Process all providers in parallel batches
        await Promise.all([
            processProviderBatch('smmgen', groups.smmgen, process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2', process.env.SMMGEN_API_KEY, mapSMMGenStatus, 'smmgen_order_id'),
            processProviderBatch('smmcost', groups.smmcost, process.env.SMMCOST_API_URL || 'https://api.smmcost.com', process.env.SMMCOST_API_KEY, mapSMMCostStatus, 'smmcost_order_id', true),
            processProviderBatch('jbsmmpanel', groups.jbsmmpanel, process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2', process.env.JBSMMPANEL_API_KEY, mapJBSMMPanelStatus, 'jbsmmpanel_order_id'),
            processProviderBatch('worldofsmm', groups.worldofsmm, process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2', process.env.WORLDOFSMM_API_KEY, mapWorldOfSMMStatus, 'worldofsmm_order_id'),
            processProviderBatch('g1618', groups.g1618, process.env.G1618_API_URL || 'https://g1618.com/api/v2', process.env.G1618_API_KEY, mapG1618Status, 'g1618_order_id')
        ]);

        return res.status(200).json({ success: true, ...results });

    } catch (error) {
        console.error('Unified status check error:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Internal server error'
        });
    }
}
