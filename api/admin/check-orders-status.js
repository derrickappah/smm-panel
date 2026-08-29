/**
 * Unified Order Status Check API (Admin Only)
 * 
 * This endpoint allows admins to trigger a bulk status check for pending orders.
 * It handles orchestration across different providers and updates the database directly.
 */

import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { getConfig } from '../utils/config.js';
import {
    mapSMMGenStatus,
    mapSMMCostStatus,
    mapJBSMMPanelStatus,
    mapWorldOfSMMStatus,
    mapG1618Status,
    mapOldSMMStatus,
    mapApiOwnerStatus
} from '../utils/statusMapping.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';

const REQUEST_TIMEOUT = 15000; // 15 seconds per provider call

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
            remains = parseInt(statusInfo.remains || 0, 10);
            const quantity = parseInt(order.quantity || 1, 10);
            const totalCost = parseFloat(order.total_cost || 0);

            if (remains > 0 && quantity > 0) {
                refundAmount = (totalCost / quantity) * remains;
                refundAmount = Math.round((refundAmount + Number.EPSILON) * 100) / 100;
                if (refundAmount > totalCost) refundAmount = totalCost;
                refundType = 'partial';
            } else {
                return { success: false, error: 'Invalid remains or quantity' };
            }
        } else {
            return null;
        }

        if (refundAmount <= 0) return { success: false, error: 'Zero refund amount' };

        const { data, error } = await supabase.rpc('process_automatic_refund', {
            p_order_id: order.id,
            p_refund_amount: refundAmount,
            p_refund_type: refundType,
            p_remains: remains
        });

        if (error) {
            await supabase.from('orders').update({
                refund_status: 'failed',
                refund_error: error.message,
                refund_attempted_at: new Date().toISOString()
            }).eq('id', order.id);
            return { success: false, error: error.message };
        }

        return data;
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export default async function handler(req, res) {
    // Enable CORS
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // 1. Verify Admin
        const { user } = await verifyAdmin(req);
        const { orderIds } = req.body;

        if (!orderIds || !Array.isArray(orderIds)) {
            return res.status(400).json({ error: 'Missing or invalid orderIds array' });
        }

        const supabase = getServiceRoleClient();
        const startTime = Date.now();

        // 2. Fetch orders from database
        const { data: orders, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .in('id', orderIds.slice(0, 50)); // Limit to 50 at a time for safety

        if (fetchError) throw fetchError;
        if (!orders || orders.length === 0) {
            return res.status(404).json({ error: 'No orders found for the provided IDs' });
        }

        // 3. Group orders by provider
        const groups = {
            smmgen: orders.filter(o => o.smmgen_order_id && o.smmgen_order_id !== "order not placed at smm gen" && o.smmgen_order_id !== o.id),
            smmcost: orders.filter(o => o.smmcost_order_id && String(o.smmcost_order_id).toLowerCase() !== "order not placed at smmcost"),
            jbsmmpanel: orders.filter(o => o.jbsmmpanel_order_id && Number(o.jbsmmpanel_order_id) > 0),
            worldofsmm: orders.filter(o => o.worldofsmm_order_id && o.worldofsmm_order_id !== "order not placed at worldofsmm"),
            g1618: orders.filter(o => o.g1618_order_id && o.g1618_order_id !== "order not placed at g1618"),
            oldsmm: orders.filter(o => o.oldsmm_order_id && o.oldsmm_order_id !== "order not placed at oldsmm"),
            apiowner: orders.filter(o => o.apiowner_order_id && String(o.apiowner_order_id).toLowerCase() !== "order not placed at apiowner")
        };

        const results = {
            checked: 0,
            updated: 0,
            errors: [],
            details: []
        };

        // Helper to update order in database
        const updateOrder = async (order, newStatus, rawData, provider) => {
            let refundResult = null;
            const shouldRefund = ['canceled', 'cancelled', 'refunded', 'refunds', 'partial'].includes(newStatus) && 
                               order.status !== 'refunded';

            if (shouldRefund) {
                refundResult = await handleAutomaticRefund(supabase, order, rawData || {}, newStatus);
            }

            const updateFields = {
                last_status_check: new Date().toISOString()
            };

            if (!refundResult?.success) {
                updateFields.status = newStatus;
            }

            const { error: updateError } = await supabase
                .from('orders')
                .update(updateFields)
                .eq('id', order.id);

            if (updateError) {
                console.error(`Failed to update order ${order.id} in database:`, updateError);
                return false;
            }
            return true;
        };

        // 4. Process SMMGen orders
        if (groups.smmgen.length > 0) {
            const API_URL = await getConfig('SMMGEN_API_URL', 'https://smmgen.com/api/v2');
            const API_KEY = await getConfig('SMMGEN_API_KEY');

            if (API_KEY && !API_KEY.includes('PLACEHOLDER')) {
                const smmgenTasks = groups.smmgen.map(async (order) => {
                    results.checked++;
                    try {
                        console.log(`[SMMGen] Checking status for order ${order.id} (Provider ID: ${order.smmgen_order_id})`);
                        const response = await fetch(API_URL, {
                            method: 'POST',
                            body: new URLSearchParams({ key: API_KEY, action: 'status', order: order.smmgen_order_id })
                        });
                        const data = await response.json();

                        const rawStatus = data.status || data.Status;
                        const mappedStatus = mapSMMGenStatus(rawStatus);

                        if (mappedStatus && mappedStatus !== order.status) {
                            const success = await updateOrder(order, mappedStatus, data, 'smmgen');
                            if (success) {
                                results.updated++;
                                results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: 'smmgen' });
                            }
                        }
                    } catch (err) {
                        console.error(`[SMMGen] Error checking order ${order.id}:`, err.message);
                        results.errors.push({ id: order.id, provider: 'smmgen', error: err.message });
                    }
                });
                await Promise.all(smmgenTasks);
            }
        }

        // 5. Process SMMCost orders
        if (groups.smmcost.length > 0) {
            const API_URL = await getConfig('SMMCOST_API_URL', 'https://api.smmcost.com');
            const API_KEY = await getConfig('SMMCOST_API_KEY');

            if (API_KEY && !API_KEY.includes('PLACEHOLDER')) {
                const smmcostTasks = groups.smmcost.map(async (order) => {
                    results.checked++;
                    try {
                        console.log(`[SMMCost] Checking status for order ${order.id} (Provider ID: ${order.smmcost_order_id})`);
                        const response = await fetch(API_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: API_KEY, action: 'status', order: parseInt(order.smmcost_order_id, 10) })
                        });
                        const data = await response.json();

                        const rawStatus = data.status || data.Status;
                        const mappedStatus = mapSMMCostStatus(rawStatus);

                        if (mappedStatus && mappedStatus !== order.status) {
                            const success = await updateOrder(order, mappedStatus, data, 'smmcost');
                            if (success) {
                                results.updated++;
                                results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: 'smmcost' });
                            }
                        }
                    } catch (err) {
                        console.error(`[SMMCost] Error checking order ${order.id}:`, err.message);
                        results.errors.push({ id: order.id, provider: 'smmcost', error: err.message });
                    }
                });
                await Promise.all(smmcostTasks);
            }
        }

        // 6. Process JB SMM Panel orders
        if (groups.jbsmmpanel.length > 0) {
            const API_URL = await getConfig('JBSMMPANEL_API_URL', 'https://jbsmmpanel.com/api/v2');
            const API_KEY = await getConfig('JBSMMPANEL_API_KEY');

            if (API_KEY && !API_KEY.includes('PLACEHOLDER')) {
                const jbTasks = groups.jbsmmpanel.map(async (order) => {
                    results.checked++;
                    try {
                        console.log(`[JBSMMPanel] Checking status for order ${order.id} (Provider ID: ${order.jbsmmpanel_order_id})`);
                        const response = await fetch(API_URL, {
                            method: 'POST',
                            body: new URLSearchParams({ key: API_KEY, action: 'status', order: order.jbsmmpanel_order_id.toString() })
                        });
                        const data = await response.json();

                        // Robust parsing for JBSMMPanel (handle arrays and nested objects)
                        let rawStatus = data.status || data.Status || data.order?.status;
                        if (rawStatus === undefined && Array.isArray(data) && data.length > 0) {
                            rawStatus = data[0]?.status || data[0]?.Status;
                        }

                        const mappedStatus = mapJBSMMPanelStatus(rawStatus);

                        if (mappedStatus && mappedStatus !== order.status) {
                            const success = await updateOrder(order, mappedStatus, data, 'jbsmmpanel');
                            if (success) {
                                results.updated++;
                                results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: 'jbsmmpanel' });
                            }
                        }
                    } catch (err) {
                        console.error(`[JBSMMPanel] Error checking order ${order.id}:`, err.message);
                        results.errors.push({ id: order.id, provider: 'jbsmmpanel', error: err.message });
                    }
                });
                await Promise.all(jbTasks);
            }
        }

        // 7. Process World of SMM orders
        if (groups.worldofsmm.length > 0) {
            const API_URL = await getConfig('WORLDOFSMM_API_URL', 'https://worldofsmm.com/api/v2');
            const API_KEY = await getConfig('WORLDOFSMM_API_KEY');

            if (API_KEY && !API_KEY.includes('PLACEHOLDER')) {
                const worldTasks = groups.worldofsmm.map(async (order) => {
                    results.checked++;
                    try {
                        const response = await fetch(API_URL, {
                            method: 'POST',
                            body: new URLSearchParams({ key: API_KEY, action: 'status', order: order.worldofsmm_order_id.toString() })
                        });
                        const data = await response.json();
                        const rawStatus = data.status || data.Status;
                        const mappedStatus = mapWorldOfSMMStatus(rawStatus);

                        if (mappedStatus && mappedStatus !== order.status) {
                            const success = await updateOrder(order, mappedStatus, data, 'worldofsmm');
                            if (success) {
                                results.updated++;
                                results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: 'worldofsmm' });
                            }
                        }
                    } catch (err) {
                        console.error(`[WorldOfSMM] Error checking order ${order.id}:`, err.message);
                        results.errors.push({ id: order.id, provider: 'worldofsmm', error: err.message });
                    }
                });
                await Promise.all(worldTasks);
            }
        }

        // 8. Process G1618 orders
        if (groups.g1618.length > 0) {
            const API_URL = await getConfig('G1618_API_URL', 'https://g1618.com/api/v2');
            const API_KEY = await getConfig('G1618_API_KEY');

            if (API_KEY && !API_KEY.includes('PLACEHOLDER')) {
                const gTasks = groups.g1618.map(async (order) => {
                    results.checked++;
                    try {
                        const response = await fetch(API_URL, {
                            method: 'POST',
                            body: new URLSearchParams({ key: API_KEY, action: 'status', order: order.g1618_order_id.toString() })
                        });
                        const data = await response.json();
                        const rawStatus = data.status || data.Status;
                        const mappedStatus = mapG1618Status(rawStatus);

                        if (mappedStatus && mappedStatus !== order.status) {
                            const success = await updateOrder(order, mappedStatus, data, 'g1618');
                            if (success) {
                                results.updated++;
                                results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: 'g1618' });
                            }
                        }
                    } catch (err) {
                        console.error(`[G1618] Error checking order ${order.id}:`, err.message);
                        results.errors.push({ id: order.id, provider: 'g1618', error: err.message });
                    }
                });
                await Promise.all(gTasks);
            }
        }

        // 9. Process OldSMM orders
        if (groups.oldsmm.length > 0) {
            const API_URL = await getConfig('OLDSMM_API_URL', 'https://oldsmm.com/api/v2');
            const API_KEY = await getConfig('OLDSMM_API_KEY');

            if (API_KEY && !API_KEY.includes('PLACEHOLDER')) {
                const oldsmmTasks = groups.oldsmm.map(async (order) => {
                    results.checked++;
                    try {
                        const response = await fetch(API_URL, {
                            method: 'POST',
                            body: new URLSearchParams({ key: API_KEY, action: 'status', order: order.oldsmm_order_id.toString() })
                        });
                        const data = await response.json();
                        const rawStatus = data.status || data.Status;
                        const mappedStatus = mapOldSMMStatus(rawStatus);

                        if (mappedStatus && mappedStatus !== order.status) {
                            const success = await updateOrder(order, mappedStatus, data, 'oldsmm');
                            if (success) {
                                results.updated++;
                                results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: 'oldsmm' });
                            }
                        }
                    } catch (err) {
                        console.error(`[OldSMM] Error checking order ${order.id}:`, err.message);
                        results.errors.push({ id: order.id, provider: 'oldsmm', error: err.message });
                    }
                });
                await Promise.all(oldsmmTasks);
            }
        }

        // 10. Process ApiOwner orders
        if (groups.apiowner.length > 0) {
            const API_URL = await getConfig('APIOWNER_API_URL', 'https://apiowner.com/api/v2');
            const API_KEY = await getConfig('APIOWNER_API_KEY');

            if (API_KEY && !API_KEY.includes('PLACEHOLDER')) {
                const apiOwnerTasks = groups.apiowner.map(async (order) => {
                    results.checked++;
                    try {
                        console.log(`[ApiOwner] Checking status for order ${order.id} (Provider ID: ${order.apiowner_order_id})`);
                        const response = await fetch(API_URL, {
                            method: 'POST',
                            body: new URLSearchParams({ key: API_KEY, action: 'status', order: order.apiowner_order_id.toString() })
                        });
                        const data = await response.json();

                        let rawStatus = data.status || data.Status || data.order?.status;
                        if (rawStatus === undefined && Array.isArray(data) && data.length > 0) {
                            rawStatus = data[0]?.status || data[0]?.Status;
                        }

                        const mappedStatus = mapApiOwnerStatus(rawStatus);

                        if (mappedStatus && mappedStatus !== order.status) {
                            const success = await updateOrder(order, mappedStatus, data, 'apiowner');
                            if (success) {
                                results.updated++;
                                results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: 'apiowner' });
                            }
                        }
                    } catch (err) {
                        console.error(`[ApiOwner] Error checking order ${order.id}:`, err.message);
                        results.errors.push({ id: order.id, provider: 'apiowner', error: err.message });
                    }
                });
                await Promise.all(apiOwnerTasks);
            }
        }

        const duration = Date.now() - startTime;
        return res.status(200).json({
            success: true,
            ...results,
            duration: `${duration}ms`
        });

    } catch (error) {
        console.error('Unified status check error:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Internal server error',
            details: error.stack
        });
    }
}
