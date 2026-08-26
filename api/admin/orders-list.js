/**
 * High-Speed Admin Orders List Server Action Endpoint
 * 
 * Path: /api/admin/orders-list
 * Description: High-speed server action for fetching admin order lists, status filtering, search, and status counters.
 */

import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';

export default async function handler(req, res) {
  // CORS Headers
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://boostupgh.com',
    'https://www.boostupgh.com',
    'http://localhost:3000'
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://boostupgh.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = performance.now();

  try {
    // 1. Verify Admin Caller
    let authResult;
    try {
      authResult = await verifyAdmin(req);
    } catch (authError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: authError.message
      });
    }

    const body = req.method === 'POST' ? req.body : req.query;
    const {
      page = 0,
      limit = 50,
      statusFilter = 'all',
      dateFilter = '',
      searchTerm = '',
      searchType = 'all'
    } = body;

    const pageNum = Math.max(0, parseInt(page, 10) || 0);
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
    const from = pageNum * limitNum;
    const to = from + limitNum - 1;

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    // Helper to build base query with status, date, and search filters
    const buildBaseOrdersQuery = () => {
      let q = supabase
        .from('orders')
        .select(`
          id, user_id, service_id, promotion_package_id, link, quantity, total_cost, status, 
          smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, g1618_order_id, oldsmm_order_id, apiowner_order_id, 
          component_provider_order_ids, created_at, completed_at, refund_status, last_status_check,
          services (
            name, platform, service_type, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, 
            worldofsmm_service_id, g1618_service_id, oldsmm_service_id, apiowner_service_id, is_combo
          ),
          promotion_packages (
            name, platform, service_type, smmgen_service_id, oldsmm_service_id, apiowner_service_id, is_combo
          ),
          profiles (
            name, email, phone_number
          )
        `, { count: 'exact' });

      // Apply status filter
      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'refunded') {
          q = q.or('status.eq.refunded,refund_status.eq.succeeded');
        } else if (statusFilter === 'canceled') {
          q = q.or('status.eq.canceled,status.eq.cancelled');
        } else if (statusFilter === 'failed_to_smmgen') {
          q = q.is('smmgen_order_id', null)
            .is('smmcost_order_id', null)
            .is('jbsmmpanel_order_id', null)
            .is('worldofsmm_order_id', null)
            .is('g1618_order_id', null)
            .is('oldsmm_order_id', null)
            .is('apiowner_order_id', null)
            .neq('status', 'completed')
            .neq('status', 'cancelled')
            .neq('status', 'canceled')
            .neq('status', 'refunded');
        } else {
          q = q.eq('status', statusFilter);
        }
      }

      // Apply date filter
      if (dateFilter) {
        const filterDate = new Date(dateFilter + 'T00:00:00.000Z');
        const filterDateEnd = new Date(dateFilter + 'T23:59:59.999Z');
        q = q.gte('created_at', filterDate.toISOString()).lte('created_at', filterDateEnd.toISOString());
      }

      // Apply search filter
      if (searchTerm && searchTerm.trim()) {
        const trimmedSearch = searchTerm.trim();
        const searchPattern = `%${trimmedSearch}%`;
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmedSearch);
        const isNumeric = /^\d+$/.test(trimmedSearch);

        const conds = [
          `smmgen_order_id.ilike.${searchPattern}`,
          `smmcost_order_id.ilike.${searchPattern}`,
          `worldofsmm_order_id.ilike.${searchPattern}`,
          `g1618_order_id.ilike.${searchPattern}`,
          `oldsmm_order_id.ilike.${searchPattern}`,
          `apiowner_order_id.ilike.${searchPattern}`
        ];

        if (searchType === 'link' || searchType === 'all') {
          conds.push(`link.ilike.${searchPattern}`);
        }

        if (isUuid) {
          conds.push(`id.eq.${trimmedSearch}`);
        }

        if (isNumeric) {
          conds.push(`jbsmmpanel_order_id.eq.${trimmedSearch}`);
        }

        q = q.or(conds.join(','));
      }

      return q.order('created_at', { ascending: false });
    };

    // Execute paginated order query
    const { data: orders, error: ordersError, count: totalCount } = await buildBaseOrdersQuery().range(from, to);

    if (ordersError) {
      console.error('Server Action Orders List DB Error:', ordersError);
      return res.status(500).json({ error: 'Database order query failed', details: ordersError.message });
    }

    // Parallel fetch status counts if on first page
    let statusCounts = { all: totalCount || 0 };
    if (pageNum === 0 && (!statusFilter || statusFilter === 'all') && !searchTerm) {
      try {
        const [pendingRes, processingRes, completedRes, canceledRes, refundedRes] = await Promise.all([
          supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('orders').select('id', { count: 'exact', head: true }).or('status.eq.processing,status.eq.in progress'),
          supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
          supabase.from('orders').select('id', { count: 'exact', head: true }).or('status.eq.canceled,status.eq.cancelled'),
          supabase.from('orders').select('id', { count: 'exact', head: true }).or('status.eq.refunded,refund_status.eq.succeeded')
        ]);

        statusCounts = {
          all: totalCount || 0,
          pending: pendingRes.count || 0,
          processing: processingRes.count || 0,
          completed: completedRes.count || 0,
          canceled: canceledRes.count || 0,
          refunded: refundedRes.count || 0
        };
      } catch (countErr) {
        console.warn('Status counts calculation error:', countErr);
      }
    }

    const searchTimeMs = Math.round(performance.now() - startTime);

    return res.status(200).json({
      success: true,
      orders: orders || [],
      total: totalCount || (orders?.length || 0),
      page: pageNum,
      pageSize: limitNum,
      statusCounts,
      searchTimeMs
    });

  } catch (err) {
    console.error('Server Action Orders List Internal Error:', err);
    return res.status(500).json({
      error: 'Internal server error during order listing',
      message: err.message
    });
  }
}
