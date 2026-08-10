/**
 * High-Speed Admin Order Search Server Action Endpoint
 * 
 * Path: /api/admin/search-orders
 * Description: Server-side admin order search powered by Supabase Service Role client.
 * Bypasses RLS and client-side PostgREST limits for sub-100ms instant order lookups.
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
    // 1. Verify caller is an admin
    let authResult;
    try {
      authResult = await verifyAdmin(req);
    } catch (authError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: authError.message
      });
    }

    // 2. Extract parameters
    const searchTerm = req.method === 'POST' ? req.body.searchTerm : req.query.searchTerm || req.query.q || req.query.search;
    const searchMode = (req.method === 'POST' ? req.body.searchMode : req.query.searchMode) || 'all';
    const statusFilter = (req.method === 'POST' ? req.body.statusFilter : req.query.statusFilter) || 'all';
    const limit = Math.min(parseInt((req.method === 'POST' ? req.body.limit : req.query.limit) || '100', 10), 200);

    if (!searchTerm || !searchTerm.trim()) {
      return res.status(200).json({
        success: true,
        orders: [],
        searchTimeMs: Math.round(performance.now() - startTime),
        total: 0
      });
    }

    const trimmedSearch = searchTerm.trim();
    const searchPattern = `%${trimmedSearch}%`;
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmedSearch);
    const isNumeric = /^\d+$/.test(trimmedSearch);

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    // Select query fields
    const selectFields = `
      id, user_id, service_id, promotion_package_id, link, quantity, total_cost, 
      status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, 
      g1618_order_id, oldsmm_order_id, apiowner_order_id, component_provider_order_ids, 
      created_at, completed_at, refund_status, last_status_check, is_reward,
      services(name, platform, service_type, is_combo), 
      promotion_packages(name, platform, service_type, is_combo), 
      profiles(name, email, phone_number)
    `;

    let query = supabase
      .from('orders')
      .select(selectFields, { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply Status Filter
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'refunded') {
        query = query.or('status.eq.refunded,refund_status.eq.succeeded');
      } else if (statusFilter === 'canceled') {
        query = query.or('status.eq.canceled,status.eq.cancelled');
      } else {
        query = query.eq('status', statusFilter);
      }
    }

    // Build conditions
    const orderConditions = [
      `smmgen_order_id.ilike.${searchPattern}`,
      `smmcost_order_id.ilike.${searchPattern}`,
      `worldofsmm_order_id.ilike.${searchPattern}`,
      `g1618_order_id.ilike.${searchPattern}`,
      `oldsmm_order_id.ilike.${searchPattern}`,
      `apiowner_order_id.ilike.${searchPattern}`
    ];

    if (searchMode === 'all' || searchMode === 'link') {
      orderConditions.push(`link.ilike.${searchPattern}`);
    }
    if (isUuid) {
      orderConditions.push(`id.eq.${trimmedSearch}`);
    }
    if (isNumeric) {
      orderConditions.push(`jbsmmpanel_order_id.eq.${trimmedSearch}`);
    }

    if (searchMode === 'order_id') {
      query = query.or(orderConditions.join(','));
    } else if (searchMode === 'user') {
      const { data: matchingProfiles } = await supabase
        .from('profiles')
        .select('id')
        .or(`name.ilike.${searchPattern},email.ilike.${searchPattern},phone_number.ilike.${searchPattern}`)
        .limit(20);

      const userIds = matchingProfiles?.map(p => p.id) || [];
      if (userIds.length > 0) {
        query = query.in('user_id', userIds);
      } else {
        return res.status(200).json({
          success: true,
          orders: [],
          searchTimeMs: Math.round(performance.now() - startTime),
          total: 0
        });
      }
    } else if (searchMode === 'link') {
      query = query.ilike('link', searchPattern);
    } else {
      // "all" mode with fast-path optimization
      let matchingUserIds = [];
      let matchingServiceIds = [];
      let matchingPackageIds = [];

      if (!isNumeric && !isUuid) {
        try {
          const [profilesRes, servicesRes, packagesRes] = await Promise.all([
            supabase.from('profiles').select('id').or(`name.ilike.${searchPattern},email.ilike.${searchPattern},phone_number.ilike.${searchPattern}`).limit(15),
            supabase.from('services').select('id').ilike('name', searchPattern).limit(15),
            supabase.from('promotion_packages').select('id').ilike('name', searchPattern).limit(15)
          ]);

          matchingUserIds = profilesRes.data?.map(p => p.id) || [];
          matchingServiceIds = servicesRes.data?.map(s => s.id) || [];
          matchingPackageIds = packagesRes.data?.map(p => p.id) || [];
        } catch (subErr) {
          console.warn('Sub-queries failed:', subErr);
        }
      }

      const conditions = [...orderConditions];
      if (matchingUserIds.length > 0) {
        conditions.push(...matchingUserIds.slice(0, 15).map(id => `user_id.eq.${id}`));
      }
      if (matchingServiceIds.length > 0) {
        conditions.push(...matchingServiceIds.slice(0, 15).map(id => `service_id.eq.${id}`));
      }
      if (matchingPackageIds.length > 0) {
        conditions.push(...matchingPackageIds.slice(0, 15).map(id => `promotion_package_id.eq.${id}`));
      }

      if (conditions.length > 0) {
        query = query.or(conditions.join(','));
      }
    }

    let { data, error, count } = await query;

    // Fallback combo order JSONB lookup if no standard order matches found
    if ((!data || data.length === 0) && !error) {
      try {
        const jsonMatchString = JSON.stringify([{ provider_order_id: trimmedSearch }]);
        const fallbackRes = await supabase
          .from('orders')
          .select(selectFields, { count: 'exact' })
          .contains('component_provider_order_ids', jsonMatchString)
          .limit(limit);

        if (fallbackRes.data && fallbackRes.data.length > 0) {
          data = fallbackRes.data;
          count = fallbackRes.count || fallbackRes.data.length;
        }
      } catch (fallbackErr) {
        console.warn('Combo JSONB fallback search error:', fallbackErr);
      }
    }

    if (error) {
      console.error('Server Action Order Search DB Error:', error);
      return res.status(500).json({ error: 'Database search failed', details: error.message });
    }

    const searchTimeMs = Math.round(performance.now() - startTime);

    return res.status(200).json({
      success: true,
      orders: data || [],
      searchTimeMs,
      total: count || (data?.length || 0)
    });

  } catch (err) {
    console.error('Server Action Order Search Internal Error:', err);
    return res.status(500).json({
      error: 'Internal server error during order search',
      message: err.message
    });
  }
}
