/**
 * Unified Order Status Check API
 * 
 * This endpoint handles bulk status checks for both regular users and admins.
 * - Regular users: Restricted to their own orders via RLS.
 * - Admins: Can check any order using elevated service role privileges.
 */

import { verifyAuth, getServiceRoleClient } from './utils/auth.js';
import { getConfig } from './utils/config.js';
import {
    mapSMMGenStatus,
    mapSMMCostStatus,
    mapJBSMMPanelStatus,
    mapWorldOfSMMStatus,
    mapG1618Status,
    mapOldSMMStatus,
    mapApiOwnerStatus
} from './utils/statusMapping.js';
import { setCorsHeaders } from './utils/corsHeaders.js';

/**
 * Handle automatic refund for an order using atomic RPC
 * @param {object} supabase - Supabase client (service role)
 * @param {object} order - Order from DB
 * @param {object} statusInfo - Status from provider API
 * @param {string} mappedStatus - Our internal mapped status
 * @returns {promise} - Refund result object
 */
async function handleAutomaticRefund(supabase, order, statusInfo, mappedStatus) {
    try {
        let refundAmount = 0;
        let refundType = 'full';
        let remains = 0;

        const isFullRefundStatus = ['canceled', 'cancelled', 'refunded', 'refunds'].includes(mappedStatus);
        if (isFullRefundStatus) {
            refundAmount = order.total_cost;
            refundType = 'full';
        } else if (mappedStatus === 'partial') {
            // Calculate partial refund: (remains / quantity) * total_cost
            remains = parseInt(statusInfo.remains || 0, 10);
            const quantity = parseInt(order.quantity || 1, 10);
            const totalCost = parseFloat(order.total_cost || 0);

            if (remains > 0 && quantity > 0) {
                // Precision: (Total Cost / Quantity) * Remains, rounded to 2 decimals
                refundAmount = (totalCost / quantity) * remains;
                refundAmount = Math.round((refundAmount + Number.EPSILON) * 100) / 100;
                
                // Safety: Refund cannot exceed total cost
                if (refundAmount > totalCost) refundAmount = totalCost;
                refundType = 'partial';
            } else {
                console.warn(`[Refund] Partial status for order ${order.id} but remains (${remains}) or quantity (${quantity}) is 0. Skipping refund.`);
                return { success: false, error: 'Invalid remains or quantity' };
            }
        } else {
            return null; // No refund for other statuses
        }

        if (refundAmount <= 0) {
            console.warn(`[Refund] Calculated 0 refund amount for order ${order.id}. Skipping.`);
            return { success: false, error: 'Zero refund amount' };
        }

        console.log(`[Refund] Process ${refundType} refund for order ${order.id}: ${refundAmount}`);

        const { data, error } = await supabase.rpc('process_automatic_refund', {
            p_order_id: order.id,
            p_refund_amount: refundAmount,
            p_refund_type: refundType,
            p_remains: remains
        });

        if (error) {
            console.error(`[Refund] RPC error for order ${order.id}:`, error);
            // Record error in orders table for visibility
            await supabase.from('orders').update({
                refund_status: 'failed',
                refund_error: error.message,
                refund_attempted_at: new Date().toISOString()
            }).eq('id', order.id);
            
            return { success: false, error: error.message };
        }

        if (!data?.success) {
            console.warn(`[Refund] Failed to process refund for ${order.id}:`, data?.error);
            return data;
        }

        console.log(`[Refund] Success for order ${order.id}: Refund ID ${data.refund_id}`);
        return data;

    } catch (err) {
        console.error(`[Refund] Exception for order ${order.id}:`, err);
        return { success: false, error: err.message };
    }
}

const REQUEST_TIMEOUT = 15000; // 15 seconds per provider call

export default async function handler(req, res) {
    // Enable CORS
    setCorsHeaders(req, res);
    
    // Add Private Caching (Browser-only) - Cache for 60s
    // Using 'private' prevents CDN caching and ensures data isn't leaked between users.
    // 'Vary: Authorization' ensures the browser differentiates the cache by the auth token.
    res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=30');
    res.setHeader('Vary', 'Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        let user, userClient;
        try {
            const authResult = await verifyAuth(req);
            user = authResult.user;
            userClient = authResult.supabase;
        } catch (authError) {
            return res.status(401).json({
                error: 'Authentication required',
                message: authError.message
            });
        }
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
        const { data: rawOrders, error: fetchError } = await dbClient
            .from('orders')
            .select('*')
            .in('id', orderIds.slice(0, 100)); // Increased limit to 100

        if (fetchError) throw fetchError;
        let orders = rawOrders || [];
        if (orders.length === 0) {
            const { data: comboOrders } = await dbClient
                .from('combo_parent_orders')
                .select('id, user_id, status')
                .in('id', orderIds.slice(0, 100));
            if (comboOrders && comboOrders.length > 0) {
                const comboCheckHandler = (await import('./order/check-combo-status.js')).default;
                req.body = { parent_order_id: comboOrders[0].id };
                return comboCheckHandler(req, res);
            }
            return res.status(404).json({ error: 'No orders found or access denied' });
        }

        // 3. Group orders by provider
        const groups = {
            smmgen: orders.filter(o => o.smmgen_order_id && o.smmgen_order_id !== "order not placed at smm gen" && o.smmgen_order_id !== o.id),
            smmcost: orders.filter(o => o.smmcost_order_id && String(o.smmcost_order_id).toLowerCase() !== "order not placed at smmcost"),
            jbsmmpanel: orders.filter(o => o.jbsmmpanel_order_id && Number(o.jbsmmpanel_order_id) > 0),
            worldofsmm: orders.filter(o => o.worldofsmm_order_id && o.worldofsmm_order_id !== "order not placed at worldofsmm"),
            g1618: orders.filter(o => o.g1618_order_id && o.g1618_order_id !== "order not placed at g1618"),
            oldsmm: orders.filter(o => o.oldsmm_order_id && o.oldsmm_order_id !== "order not placed at oldsmm"),
            apiowner: orders.filter(o => o.apiowner_order_id && o.apiowner_order_id !== "order not placed at apiowner")
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

            if (!apiKey || apiKey.includes('PLACEHOLDER')) {
                console.warn(`[StatusCheck] ${providerName} API key not configured. Skipping ${providerOrders.length} orders.`);
                for (const order of providerOrders) {
                    results.errors.push({ id: order.id, provider: providerName, error: `${providerName} API key not configured` });
                }
                return;
            }

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
                    const statusInfo = data[panelId] || (data && (data.status || data.Status) ? data : null);

                    if (statusInfo) {
                        const rawStatus = statusInfo.status || statusInfo.Status;
                        const mappedStatus = mapper(rawStatus);

                        if (mappedStatus && mappedStatus !== order.status) {
                            // Check if automatic refund is needed (only if not already refunded)
                            let refundResult = null;
                            const shouldRefund = ['canceled', 'cancelled', 'refunded', 'refunds', 'partial'].includes(mappedStatus) && 
                                               order.status !== 'refunded';

                            if (shouldRefund) {
                                // Use service role client for refunds to ensure it has permissions
                                const adminClient = getServiceRoleClient();
                                refundResult = await handleAutomaticRefund(adminClient, order, statusInfo, mappedStatus);
                            }

                            // If refund was processed, it already updated the status, so we only update last_status_check
                            // If no refund was processed or it failed, we update the status normally
                            const updateFields = {
                                last_status_check: new Date().toISOString()
                            };

                            if (!refundResult?.success) {
                                updateFields.status = mappedStatus;
                            }

                            if (await dbClient.from('orders').update(updateFields).eq('id', order.id)) {
                                results.updated++;
                                results.details.push({ 
                                    id: order.id, 
                                    old: order.status, 
                                    new: mappedStatus, 
                                    provider: providerName,
                                    refunded: !!refundResult?.success
                                });
                            }
                        } else {
                            // Even if status unchanged, update last_status_check
                            await dbClient.from('orders').update({
                                last_status_check: new Date().toISOString()
                            }).eq('id', order.id);
                        }
                    } else {
                        // If not in batch response, fall back to individual check if only one order
                        if (providerOrders.length === 1) {
                            const rawStatus = data.status || data.Status;
                            const mappedStatus = mapper(rawStatus);
                            if (mappedStatus && mappedStatus !== order.status) {
                                // Individual order refund logic
                                let refundResult = null;
                                const shouldRefund = ['canceled', 'cancelled', 'refunded', 'refunds', 'partial'].includes(mappedStatus) && 
                                                   order.status !== 'refunded';

                                if (shouldRefund) {
                                    const adminClient = getServiceRoleClient();
                                    refundResult = await handleAutomaticRefund(adminClient, order, data, mappedStatus);
                                }

                                const updateFields = {
                                    last_status_check: new Date().toISOString()
                                };

                                if (!refundResult?.success) {
                                    updateFields.status = mappedStatus;
                                }

                                if (await dbClient.from('orders').update(updateFields).eq('id', order.id)) {
                                    results.updated++;
                                    results.details.push({ 
                                        id: order.id, 
                                        old: order.status, 
                                        new: mappedStatus, 
                                        provider: providerName,
                                        refunded: !!refundResult?.success
                                    });
                                }
                            } else {
                                await dbClient.from('orders').update({
                                    last_status_check: new Date().toISOString()
                                }).eq('id', order.id);
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

        // 4. Resolve provider URLs & Keys dynamically from app_settings / env
        const [
            smmgenUrl, smmgenKey,
            smmcostUrl, smmcostKey,
            jbsmmpanelUrl, jbsmmpanelKey,
            worldofsmmUrl, worldofsmmKey,
            g1618Url, g1618Key,
            oldsmmUrl, oldsmmKey,
            apiownerUrl, apiownerKey
        ] = await Promise.all([
            getConfig('SMMGEN_API_URL', 'https://smmgen.com/api/v2'),
            getConfig('SMMGEN_API_KEY'),
            getConfig('SMMCOST_API_URL', 'https://api.smmcost.com'),
            getConfig('SMMCOST_API_KEY'),
            getConfig('JBSMMPANEL_API_URL', 'https://jbsmmpanel.com/api/v2'),
            getConfig('JBSMMPANEL_API_KEY'),
            getConfig('WORLDOFSMM_API_URL', 'https://worldofsmm.com/api/v2'),
            getConfig('WORLDOFSMM_API_KEY'),
            getConfig('G1618_API_URL', 'https://g1618.com/api/v2'),
            getConfig('G1618_API_KEY'),
            getConfig('OLDSMM_API_URL', 'https://oldsmm.com/api/v2'),
            getConfig('OLDSMM_API_KEY'),
            getConfig('APIOWNER_API_URL', 'https://apiowner.com/api/v2'),
            getConfig('APIOWNER_API_KEY')
        ]);

        // 5-11. Process all providers in parallel batches
        await Promise.all([
            processProviderBatch('smmgen', groups.smmgen, smmgenUrl, smmgenKey, mapSMMGenStatus, 'smmgen_order_id'),
            processProviderBatch('smmcost', groups.smmcost, smmcostUrl, smmcostKey, mapSMMCostStatus, 'smmcost_order_id', true),
            processProviderBatch('jbsmmpanel', groups.jbsmmpanel, jbsmmpanelUrl, jbsmmpanelKey, mapJBSMMPanelStatus, 'jbsmmpanel_order_id'),
            processProviderBatch('worldofsmm', groups.worldofsmm, worldofsmmUrl, worldofsmmKey, mapWorldOfSMMStatus, 'worldofsmm_order_id'),
            processProviderBatch('g1618', groups.g1618, g1618Url, g1618Key, mapG1618Status, 'g1618_order_id'),
            processProviderBatch('oldsmm', groups.oldsmm, oldsmmUrl, oldsmmKey, mapOldSMMStatus, 'oldsmm_order_id'),
            processProviderBatch('apiowner', groups.apiowner, apiownerUrl, apiownerKey, mapApiOwnerStatus, 'apiowner_order_id')
        ]);

        return res.status(200).json({ success: true, ...results });

    } catch (error) {
        console.error('Unified status check error:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Internal server error'
        });
    }
}
