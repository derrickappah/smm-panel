/**
 * Admin API Endpoint to Fetch ALL Banned Users
 * 
 * Path: /api/admin/banned-users
 * Description: High-speed server action endpoint returning 100% of banned accounts from the database.
 * Uses range batching to bypass PostgREST's default row limit.
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

    const searchTerm = req.method === 'POST' ? req.body.searchTerm : req.query.searchTerm || req.query.q || '';

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    // 2. Fetch total count of banned records first
    const { count: totalBannedCount, error: countErr } = await supabase
      .from('banned_users')
      .select('*', { count: 'exact', head: true });

    if (countErr) {
      console.error('Count banned users error:', countErr);
      return res.status(500).json({ error: 'Failed to count banned users' });
    }

    const totalToFetch = totalBannedCount || 0;
    if (totalToFetch === 0) {
      return res.status(200).json({
        success: true,
        bannedUsers: [],
        searchTimeMs: Math.round(performance.now() - startTime),
        total: 0
      });
    }

    // 3. Fetch ALL banned_users rows in range-based batches of 1,000 to bypass PostgREST row caps
    const BATCH_SIZE = 1000;
    let allBannedRecords = [];
    let from = 0;
    let hasMore = true;

    while (hasMore && allBannedRecords.length < totalToFetch) {
      const to = Math.min(from + BATCH_SIZE - 1, totalToFetch - 1);
      const { data: pageData, error: pageErr } = await supabase
        .from('banned_users')
        .select('*')
        .order('banned_at', { ascending: false })
        .range(from, to);

      if (pageErr) {
        console.error('Error fetching banned users page batch:', pageErr);
        break;
      }

      if (pageData && pageData.length > 0) {
        allBannedRecords = allBannedRecords.concat(pageData);
        hasMore = pageData.length === (to - from + 1) && allBannedRecords.length < totalToFetch;
        from += pageData.length;
      } else {
        hasMore = false;
      }
    }

    // Extract User IDs
    const userIds = allBannedRecords.map(b => b.user_id);

    // 4. Chunked fetch of profiles, orders, and deposits in batches of 500
    const CHUNK_SIZE = 500;
    const profilesMap = new Map();
    const ordersMap = new Map();
    const depositsMap = new Map();

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunkIds = userIds.slice(i, i + CHUNK_SIZE);

      const [profilesRes, ordersRes, depositsRes] = await Promise.all([
        supabase.from('profiles').select('id, name, email, phone_number, balance, role, created_at, referral_code').in('id', chunkIds),
        supabase.from('orders').select('user_id, total_cost, status').in('user_id', chunkIds),
        supabase.from('transactions').select('user_id, amount, status').eq('type', 'deposit').in('user_id', chunkIds)
      ]);

      (profilesRes.data || []).forEach(p => profilesMap.set(p.id, p));

      (ordersRes.data || []).forEach(o => {
        if (!ordersMap.has(o.user_id)) ordersMap.set(o.user_id, { count: 0, totalSpent: 0 });
        const entry = ordersMap.get(o.user_id);
        entry.count += 1;
        if (o.status !== 'canceled' && o.status !== 'refunded') {
          entry.totalSpent += Number(o.total_cost || 0);
        }
      });

      (depositsRes.data || []).forEach(d => {
        if (!depositsMap.has(d.user_id)) depositsMap.set(d.user_id, { count: 0, totalDeposited: 0 });
        const entry = depositsMap.get(d.user_id);
        entry.count += 1;
        if (d.status === 'approved' || d.status === 'completed') {
          entry.totalDeposited += Number(d.amount || 0);
        }
      });
    }

    // 5. Combine banned info with profiles
    let combinedBannedUsers = allBannedRecords.map(b => {
      const profile = profilesMap.get(b.user_id) || {};
      const orderStats = ordersMap.get(b.user_id) || { count: 0, totalSpent: 0 };
      const depositStats = depositsMap.get(b.user_id) || { count: 0, totalDeposited: 0 };

      return {
        banId: b.id,
        userId: b.user_id,
        reason: b.reason || 'No reason specified',
        bannedAt: b.banned_at,
        bannedBy: b.banned_by,
        user: {
          id: b.user_id,
          name: profile.name || 'Unknown User',
          email: profile.email || 'N/A',
          phone_number: profile.phone_number || '',
          balance: Number(profile.balance || 0),
          role: profile.role || 'user',
          created_at: profile.created_at,
          referral_code: profile.referral_code
        },
        stats: {
          totalOrders: orderStats.count,
          totalSpent: Math.round(orderStats.totalSpent * 100) / 100,
          totalDeposits: depositStats.count,
          totalDeposited: Math.round(depositStats.totalDeposited * 100) / 100
        }
      };
    });

    // 6. Filter by search term if provided
    if (searchTerm && searchTerm.trim()) {
      const clean = searchTerm.trim().toLowerCase();
      combinedBannedUsers = combinedBannedUsers.filter(item => 
        (item.user.name && item.user.name.toLowerCase().includes(clean)) ||
        (item.user.email && item.user.email.toLowerCase().includes(clean)) ||
        (item.user.phone_number && item.user.phone_number.toLowerCase().includes(clean)) ||
        (item.reason && item.reason.toLowerCase().includes(clean)) ||
        item.userId.toLowerCase() === clean
      );
    }

    const searchTimeMs = Math.round(performance.now() - startTime);

    return res.status(200).json({
      success: true,
      bannedUsers: combinedBannedUsers,
      searchTimeMs,
      total: combinedBannedUsers.length
    });

  } catch (err) {
    console.error('Fetch banned users endpoint error:', err);
    return res.status(500).json({
      error: 'Internal server error fetching banned users'
    });
  }
}
