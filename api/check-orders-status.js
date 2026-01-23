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
    mapJBSMMPanelStatus
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
            .in('id', orderIds.slice(0, 50)); // Limit for safety

        if (fetchError) throw fetchError;
        if (!orders || orders.length === 0) {
            return res.status(404).json({ error: 'No orders found or access denied' });
        }

        // 3. Group orders by provider
        const groups = {
            smmgen: orders.filter(o => o.smmgen_order_id && o.smmgen_order_id !== "order not placed at smm gen" && o.smmgen_order_id !== o.id),
            smmcost: orders.filter(o => o.smmcost_order_id && String(o.smmcost_order_id).toLowerCase() !== "order not placed at smmcost"),
            jbsmmpanel: orders.filter(o => o.jbsmmpanel_order_id && Number(o.jbsmmpanel_order_id) > 0)
        };

        const results = {
            checked: 0,
            updated: 0,
            errors: [],
            details: []
        };

        // Helper to update order in database
        const updateOrder = async (orderId, newStatus) => {
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

        // 4. Process SMMGen orders
        if (groups.smmgen.length > 0) {
            const API_URL = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
            const API_KEY = process.env.SMMGEN_API_KEY;

            for (const order of groups.smmgen) {
                results.checked++;
                try {
                    const response = await fetch(API_URL, {
                        method: 'POST',
                        body: new URLSearchParams({ key: API_KEY, action: 'status', order: order.smmgen_order_id })
                    });
                    const data = await response.json();
                    const rawStatus = data.status || data.Status;
                    const mappedStatus = mapSMMGenStatus(rawStatus);

                    if (mappedStatus && mappedStatus !== order.status) {
                        if (await updateOrder(order.id, mappedStatus)) {
                            results.updated++;
                            results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: 'smmgen' });
                        }
                    }
                } catch (err) {
                    results.errors.push({ id: order.id, provider: 'smmgen', error: err.message });
                }
            }
        }

        // 5. Process SMMCost orders
        if (groups.smmcost.length > 0) {
            const API_URL = process.env.SMMCOST_API_URL || 'https://api.smmcost.com';
            const API_KEY = process.env.SMMCOST_API_KEY;

            for (const order of groups.smmcost) {
                results.checked++;
                try {
                    const response = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: API_KEY, action: 'status', order: parseInt(order.smmcost_order_id, 10) })
                    });
                    const data = await response.json();
                    const rawStatus = data.status || data.Status;
                    const mappedStatus = mapSMMCostStatus(rawStatus);

                    if (mappedStatus && mappedStatus !== order.status) {
                        if (await updateOrder(order.id, mappedStatus)) {
                            results.updated++;
                            results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: 'smmcost' });
                        }
                    }
                } catch (err) {
                    results.errors.push({ id: order.id, provider: 'smmcost', error: err.message });
                }
            }
        }

        // 6. Process JB SMM Panel orders
        if (groups.jbsmmpanel.length > 0) {
            const API_URL = process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2';
            const API_KEY = process.env.JBSMMPANEL_API_KEY;

            for (const order of groups.jbsmmpanel) {
                results.checked++;
                try {
                    const response = await fetch(API_URL, {
                        method: 'POST',
                        body: new URLSearchParams({ key: API_KEY, action: 'status', order: order.jbsmmpanel_order_id.toString() })
                    });
                    const data = await response.json();

                    // Robust parsing for JBSMMPanel
                    let rawStatus = data.status || data.Status || data.order?.status;
                    if (rawStatus === undefined && Array.isArray(data) && data.length > 0) {
                        rawStatus = data[0]?.status || data[0]?.Status;
                    }

                    const mappedStatus = mapJBSMMPanelStatus(rawStatus);

                    if (mappedStatus && mappedStatus !== order.status) {
                        if (await updateOrder(order.id, mappedStatus)) {
                            results.updated++;
                            results.details.push({ id: order.id, old: order.status, new: mappedStatus, provider: 'jbsmmpanel' });
                        }
                    }
                } catch (err) {
                    results.errors.push({ id: order.id, provider: 'jbsmmpanel', error: err.message });
                }
            }
        }

        return res.status(200).json({ success: true, ...results });

    } catch (error) {
        console.error('Unified status check error:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Internal server error'
        });
    }
}
