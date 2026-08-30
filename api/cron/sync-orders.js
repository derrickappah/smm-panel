/**
 * 24/7 Automated Order Status Synchronization Cron (Optimized Bulk Processing)
 * 
 * Runs in the background (triggered by Vercel Cron, QStash, or Admin)
 * - Queries all unfinalized orders (pending, processing, in progress)
 * - Checks live provider status in parallel batches of up to 100
 * - Atomically marks completed orders in bulk
 * - Automatically issues full / partial refunds via process_automatic_refund RPC
 * - Refreshes last_status_check for active orders in bulk
 */

import { getServiceRoleClient } from '../utils/auth.js';
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

/**
 * Handle automatic refund for an order using atomic RPC
 */
async function handleAutomaticRefund(supabase, order, statusInfo, mappedStatus) {
    try {
        let refundAmount = 0;
        let refundType = 'full';
        let remains = 0;

        const isFullRefundStatus = ['canceled', 'cancelled', 'refunded', 'refunds'].includes(mappedStatus);
        if (isFullRefundStatus) {
            refundAmount = parseFloat(order.total_cost || 0);
            refundType = 'full';
            remains = parseInt(statusInfo?.remains || order.quantity || 0, 10);
        } else if (mappedStatus === 'partial') {
            remains = parseInt(statusInfo?.remains || 0, 10);
            const quantity = parseInt(order.quantity || 1, 10);
            const totalCost = parseFloat(order.total_cost || 0);

            if (remains > 0 && quantity > 0) {
                refundAmount = (totalCost / quantity) * remains;
                refundAmount = Math.round((refundAmount + Number.EPSILON) * 100) / 100;
                if (refundAmount > totalCost) refundAmount = totalCost;
                refundType = 'partial';
            } else {
                console.warn(`[Cron-Refund] Partial status for order ${order.id} but remains (${remains}) or quantity (${quantity}) is 0.`);
                return { success: false, error: 'Invalid remains or quantity' };
            }
        } else {
            return null;
        }

        if (refundAmount <= 0) {
            return { success: false, error: 'Zero refund amount' };
        }

        console.log(`[Cron-Refund] Processing ${refundType} refund for order ${order.id}: ${refundAmount} GHS`);

        const { data, error } = await supabase.rpc('process_automatic_refund', {
            p_order_id: order.id,
            p_refund_amount: refundAmount,
            p_refund_type: refundType,
            p_remains: remains,
            p_provider_error: `Provider ${mappedStatus} (cron sync)`,
            p_error_details: JSON.stringify(statusInfo || {})
        });

        if (error) {
            console.error(`[Cron-Refund] RPC error for order ${order.id}:`, error);
            await supabase.from('orders').update({
                refund_status: 'failed',
                refund_error: error.message,
                refund_attempted_at: new Date().toISOString()
            }).eq('id', order.id);
            return { success: false, error: error.message };
        }

        return data;

    } catch (err) {
        console.error(`[Cron-Refund] Exception for order ${order.id}:`, err);
        return { success: false, error: err.message };
    }
}

/**
 * Verify incoming authorization (Vercel Cron, QStash, or Bearer Secret / Admin)
 */
async function verifyCronAuth(req) {
    const authHeader = req.headers['authorization'] || '';
    const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 1. Check Bearer token matching CRON_SECRET or Service Role Key
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim();
        if (cronSecret && token === cronSecret) return true;
        if (process.env.SUPABASE_SERVICE_ROLE_KEY && token === process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
    }

    // 2. Check Vercel Cron header
    if (req.headers['x-vercel-cron'] === '1') {
        return true;
    }

    // 3. Check QStash signature header
    if (req.headers['upstash-signature']) {
        return true;
    }

    // 4. Fallback: check custom x-cron-secret header
    if (req.headers['x-cron-secret'] && cronSecret && req.headers['x-cron-secret'] === cronSecret) {
        return true;
    }

    return false;
}

export default async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
    }

    // Authenticate cron caller
    const isAuthorized = await verifyCronAuth(req);
    if (!isAuthorized) {
        console.warn('[CronSync] Unauthorized cron invocation attempt');
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing cron credentials' });
    }

    const startTime = Date.now();
    const supabase = getServiceRoleClient();

    try {
        console.log('[CronSync] Starting 24/7 automated order status synchronization...');

        // 1. Fetch all unfinalized orders
        const { data: orders, error: fetchError } = await supabase
            .from('orders')
            .select('id, status, oldsmm_order_id, apiowner_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, g1618_order_id, smmgen_order_id, quantity, total_cost, completed_at, created_at')
            .in('status', ['pending', 'processing', 'in progress'])
            .order('created_at', { ascending: false });

        if (fetchError) {
            console.error('[CronSync] Failed to fetch unfinalized orders:', fetchError);
            return res.status(500).json({ error: 'Failed to fetch unfinalized orders', details: fetchError.message });
        }

        if (!orders || orders.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No unfinalized orders found. System is completely up to date.',
                checked: 0,
                duration_ms: Date.now() - startTime
            });
        }

        console.log(`[CronSync] Found ${orders.length} unfinalized orders to check.`);

        // 2. Group orders by provider
        const groups = {
            oldsmm: orders.filter(o => o.oldsmm_order_id && String(o.oldsmm_order_id).trim() !== '' && !String(o.oldsmm_order_id).toLowerCase().startsWith('order not placed')),
            apiowner: orders.filter(o => o.apiowner_order_id && String(o.apiowner_order_id).trim() !== '' && !String(o.apiowner_order_id).toLowerCase().startsWith('order not placed')),
            smmcost: orders.filter(o => o.smmcost_order_id && String(o.smmcost_order_id).trim() !== '' && !String(o.smmcost_order_id).toLowerCase().startsWith('order not placed')),
            jbsmmpanel: orders.filter(o => o.jbsmmpanel_order_id && Number(o.jbsmmpanel_order_id) > 0),
            worldofsmm: orders.filter(o => o.worldofsmm_order_id && String(o.worldofsmm_order_id).trim() !== '' && !String(o.worldofsmm_order_id).toLowerCase().startsWith('order not placed')),
            g1618: orders.filter(o => o.g1618_order_id && String(o.g1618_order_id).trim() !== '' && !String(o.g1618_order_id).toLowerCase().startsWith('order not placed')),
            smmgen: orders.filter(o => o.smmgen_order_id && String(o.smmgen_order_id).trim() !== '' && o.smmgen_order_id !== o.id && !String(o.smmgen_order_id).toLowerCase().startsWith('order not placed'))
        };

        // 3. Resolve active provider credentials dynamically
        const [
            oldsmmUrl, oldsmmKey,
            apiownerUrl, apiownerKey,
            smmcostUrl, smmcostKey,
            jbsmmpanelUrl, jbsmmpanelKey,
            worldofsmmUrl, worldofsmmKey,
            g1618Url, g1618Key,
            smmgenUrl, smmgenKey
        ] = await Promise.all([
            getConfig('OLDSMM_API_URL', 'https://oldsmm.com/api/v2'),
            getConfig('OLDSMM_API_KEY'),
            getConfig('APIOWNER_API_URL', 'https://apiowner.com/api/v2'),
            getConfig('APIOWNER_API_KEY'),
            getConfig('SMMCOST_API_URL', 'https://api.smmcost.com'),
            getConfig('SMMCOST_API_KEY'),
            getConfig('JBSMMPANEL_API_URL', 'https://jbsmmpanel.com/api/v2'),
            getConfig('JBSMMPANEL_API_KEY'),
            getConfig('WORLDOFSMM_API_URL', 'https://worldofsmm.com/api/v2'),
            getConfig('WORLDOFSMM_API_KEY'),
            getConfig('G1618_API_URL', 'https://g1618.com/api/v2'),
            getConfig('G1618_API_KEY'),
            getConfig('SMMGEN_API_URL', 'https://smmgen.com/api/v2'),
            getConfig('SMMGEN_API_KEY')
        ]);

        const summary = {
            total_unfinalized: orders.length,
            checked: 0,
            completed: 0,
            refunded: 0,
            partial: 0,
            in_progress: 0,
            errors: []
        };

        // High-speed provider batch processor with bulk database updates
        const processBatch = async (providerName, providerOrders, apiUrl, apiKey, mapper, orderIdField, isJson = false) => {
            if (providerOrders.length === 0) return;

            if (!apiKey || apiKey.includes('PLACEHOLDER')) {
                console.warn(`[CronSync] ${providerName} key not configured. Skipping ${providerOrders.length} orders.`);
                return;
            }

            // Split into chunks of 100
            const chunks = [];
            for (let i = 0; i < providerOrders.length; i += 100) {
                chunks.push(providerOrders.slice(i, i + 100));
            }

            for (const chunk of chunks) {
                const ids = chunk.map(o => o[orderIdField]).join(',');
                try {
                    let response;
                    if (isJson) {
                        response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: apiKey, action: 'status', orders: ids })
                        });
                    } else {
                        const form = new URLSearchParams();
                        form.append('key', apiKey);
                        form.append('action', 'status');
                        form.append('orders', ids);
                        response = await fetch(apiUrl, { method: 'POST', body: form });
                    }

                    const data = await response.json();
                    if (!data || data.error) {
                        summary.errors.push({ provider: providerName, error: data?.error || 'No response data' });
                        continue;
                    }

                    const completedIds = [];
                    const inProgressIds = [];
                    const refundTasks = [];

                    for (const order of chunk) {
                        summary.checked++;
                        const panelId = String(order[orderIdField]);
                        const statusInfo = data[panelId];

                        if (statusInfo && !statusInfo.error) {
                            const rawStatus = statusInfo.status || statusInfo.Status;
                            const mappedStatus = mapper(rawStatus);

                            if (mappedStatus === 'completed') {
                                completedIds.push(order.id);
                                summary.completed++;
                            } else if (['canceled', 'cancelled', 'refunded', 'refunds'].includes(mappedStatus)) {
                                refundTasks.push(
                                    handleAutomaticRefund(supabase, order, statusInfo, 'canceled')
                                        .then(res => { if (res?.success) summary.refunded++; })
                                );
                            } else if (mappedStatus === 'partial') {
                                refundTasks.push(
                                    handleAutomaticRefund(supabase, order, statusInfo, 'partial')
                                        .then(res => { if (res?.success) summary.partial++; })
                                );
                            } else if (['in progress', 'processing', 'pending'].includes(mappedStatus)) {
                                inProgressIds.push(order.id);
                                summary.in_progress++;
                            }
                        } else {
                            inProgressIds.push(order.id);
                        }
                    }

                    // Bulk database updates for maximum throughput
                    const dbTasks = [];

                    if (completedIds.length > 0) {
                        dbTasks.push(
                            supabase.from('orders').update({
                                status: 'completed',
                                completed_at: new Date().toISOString(),
                                last_status_check: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            }).in('id', completedIds)
                        );
                    }

                    if (inProgressIds.length > 0) {
                        dbTasks.push(
                            supabase.from('orders').update({
                                status: 'in progress',
                                last_status_check: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            }).in('id', inProgressIds)
                        );
                    }

                    await Promise.all([...dbTasks, ...refundTasks]);

                } catch (chunkErr) {
                    console.error(`[CronSync] Error querying ${providerName} chunk:`, chunkErr.message);
                    summary.errors.push({ provider: providerName, error: chunkErr.message });
                }
            }
        };

        // Run all providers concurrently
        await Promise.all([
            processBatch('oldsmm', groups.oldsmm, oldsmmUrl, oldsmmKey, mapOldSMMStatus, 'oldsmm_order_id'),
            processBatch('apiowner', groups.apiowner, apiownerUrl, apiownerKey, mapApiOwnerStatus, 'apiowner_order_id'),
            processBatch('smmcost', groups.smmcost, smmcostUrl, smmcostKey, mapSMMCostStatus, 'smmcost_order_id', true),
            processBatch('jbsmmpanel', groups.jbsmmpanel, jbsmmpanelUrl, jbsmmpanelKey, mapJBSMMPanelStatus, 'jbsmmpanel_order_id'),
            processBatch('worldofsmm', groups.worldofsmm, worldofsmmUrl, worldofsmmKey, mapWorldOfSMMStatus, 'worldofsmm_order_id'),
            processBatch('g1618', groups.g1618, g1618Url, g1618Key, mapG1618Status, 'g1618_order_id'),
            processBatch('smmgen', groups.smmgen, smmgenUrl, smmgenKey, mapSMMGenStatus, 'smmgen_order_id')
        ]);

        summary.duration_ms = Date.now() - startTime;
        console.log(`[CronSync] Completed sync in ${summary.duration_ms}ms: Checked ${summary.checked}, Completed ${summary.completed}, Refunded ${summary.refunded}, Partial ${summary.partial}, InProgress ${summary.in_progress}`);

        return res.status(200).json({
            success: true,
            summary
        });

    } catch (err) {
        console.error('[CronSync] Fatal cron error:', err);
        return res.status(500).json({
            error: 'Internal server error during order sync',
            message: err.message,
            duration_ms: Date.now() - startTime
        });
    }
}
