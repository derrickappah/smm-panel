/**
 * High-Speed Admin High Deposits Server Action Endpoint
 * 
 * Path: /api/admin/high-deposits
 * Description: High-speed server action for fetching deposits higher than a specified threshold (default > 200 GHS),
 * status filtering, multi-field search, pagination, and full database-level KPI metric aggregations.
 */

import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { getCached, setCached } from '../utils/redisClient.js';

export default async function handler(req, res) {
  // CORS setup
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = performance.now();

  try {
    // 1. Verify Admin caller
    let authResult;
    try {
      authResult = await verifyAdmin(req);
    } catch (authError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: authError.message
      });
    }

    const body = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const {
      page = 1,
      limit = 50,
      minAmount = 200,
      statusFilter = 'all',
      dateFilter = '',
      searchTerm = ''
    } = body;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
    const minThreshold = Math.max(0, parseFloat(minAmount) || 200);

    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    // 2. Compute accurate stats across ALL deposits exceeding minThreshold
    // Cache stats for 60 seconds based on minThreshold
    const statsCacheKey = `smm:admin:high_deposits_stats:${minThreshold}`;
    let stats = await getCached(statsCacheKey);

    if (!stats) {
      try {
        // Fetch count first
        const { count: totalHighCount, error: countErr } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'deposit')
          .gt('amount', minThreshold);

        if (!countErr && totalHighCount !== null) {
          // Batch fetch amounts & status to calculate accurate totals without PostgREST row-cap
          const BATCH_SIZE = 1000;
          let allDepositsData = [];
          let batchFrom = 0;
          let hasMore = true;

          while (hasMore && allDepositsData.length < totalHighCount) {
            const batchTo = Math.min(batchFrom + BATCH_SIZE - 1, totalHighCount - 1);
            const { data: chunk, error: chunkErr } = await supabase
              .from('transactions')
              .select('amount, status')
              .eq('type', 'deposit')
              .gt('amount', minThreshold)
              .range(batchFrom, batchTo);

            if (chunkErr || !chunk || chunk.length === 0) {
              break;
            }

            allDepositsData = allDepositsData.concat(chunk);
            hasMore = chunk.length === (batchTo - batchFrom + 1) && allDepositsData.length < totalHighCount;
            batchFrom += chunk.length;
          }

          let approvedVol = 0;
          let totalVol = 0;
          let approvedCount = 0;
          let pendingCount = 0;
          let rejectedCount = 0;
          let maxApprovedDeposit = 0;
          let maxOverallDeposit = 0;

          for (const item of allDepositsData) {
            const amt = parseFloat(item.amount) || 0;
            totalVol += amt;
            if (amt > maxOverallDeposit) maxOverallDeposit = amt;

            if (item.status === 'approved') {
              approvedVol += amt;
              approvedCount++;
              if (amt > maxApprovedDeposit) maxApprovedDeposit = amt;
            } else if (item.status === 'pending') {
              pendingCount++;
            } else if (item.status === 'rejected') {
              rejectedCount++;
            }
          }

          const avgApprovedDeposit = approvedCount > 0 ? (approvedVol / approvedCount) : 0;
          const avgOverallDeposit = totalHighCount > 0 ? (totalVol / totalHighCount) : 0;

          stats = {
            totalCount: totalHighCount,
            totalVolume: approvedVol > 0 ? approvedVol : totalVol,
            totalApprovedVolume: approvedVol,
            totalOverallVolume: totalVol,
            approvedCount,
            pendingCount,
            rejectedCount,
            avgDeposit: avgApprovedDeposit > 0 ? avgApprovedDeposit : avgOverallDeposit,
            avgApprovedDeposit,
            avgOverallDeposit,
            maxDeposit: maxApprovedDeposit > 0 ? maxApprovedDeposit : maxOverallDeposit,
            maxApprovedDeposit,
            maxOverallDeposit
          };

          // Cache in Redis for 60s
          await setCached(statsCacheKey, stats, 60).catch(() => {});
        }
      } catch (statsErr) {
        console.warn('[admin/high-deposits] Stats aggregation warning:', statsErr.message);
      }
    }

    // 3. Build paginated query
    let query = supabase
      .from('transactions')
      .select('id, user_id, amount, type, status, created_at, paystack_status, paystack_reference, manual_reference, korapay_reference, moolre_id, moolre_reference, deposit_method, payment_proof_url, profiles!transactions_user_id_fkey(name, email, phone_number)', { count: 'exact' })
      .eq('type', 'deposit')
      .gt('amount', minThreshold)
      .order('created_at', { ascending: false });

    // Status Filter
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    // Date Filter
    if (dateFilter) {
      const startOfDay = new Date(dateFilter);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateFilter);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.gte('created_at', startOfDay.toISOString()).lte('created_at', endOfDay.toISOString());
    }

    // Search Filter
    if (searchTerm && searchTerm.trim()) {
      const searchClean = searchTerm.trim();
      const searchEscaped = searchClean.replace(/[,()]/g, '');
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchClean);

      // Search matching users first
      const { data: matchedProfiles } = await supabase
        .from('profiles')
        .select('id')
        .or(`name.ilike.%${searchEscaped}%,email.ilike.%${searchEscaped}%,phone_number.ilike.%${searchEscaped}%`)
        .limit(100);

      const matchingUserIds = matchedProfiles ? matchedProfiles.map(p => p.id) : [];

      const orConditions = [];
      if (matchingUserIds.length > 0) {
        orConditions.push(`user_id.in.(${matchingUserIds.join(',')})`);
      }
      if (isUuid) {
        orConditions.push(`id.eq.${searchClean}`);
      }
      if (searchEscaped) {
        orConditions.push(`paystack_reference.ilike.%${searchEscaped}%`);
        orConditions.push(`manual_reference.ilike.%${searchEscaped}%`);
        orConditions.push(`korapay_reference.ilike.%${searchEscaped}%`);
        orConditions.push(`moolre_reference.ilike.%${searchEscaped}%`);
      }

      if (orConditions.length > 0) {
        query = query.or(orConditions.join(','));
      } else {
        // No match found
        return res.status(200).json({
          success: true,
          data: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
          stats: stats || {},
          queryTimeMs: Math.round(performance.now() - startTime)
        });
      }
    }

    // 4. Fetch the paginated dataset
    const { data: deposits, error: dbError, count: totalCount } = await query.range(from, to);

    if (dbError) {
      console.error('[admin/high-deposits] Database Query Error:', dbError);
      return res.status(500).json({
        error: 'Database query failed',
        details: dbError.message
      });
    }

    return res.status(200).json({
      success: true,
      data: deposits || [],
      total: totalCount || 0,
      page: pageNum,
      limit: limitNum,
      stats: stats || {},
      queryTimeMs: Math.round(performance.now() - startTime)
    });

  } catch (error) {
    console.error('[admin/high-deposits] Unexpected error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
