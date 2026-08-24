/**
 * Admin API Endpoint to Fetch Banned Users List
 * 
 * Path: /api/admin/banned-users
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
    const limit = Math.min(parseInt((req.method === 'POST' ? req.body.limit : req.query.limit) || '100', 10), 500);

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    // 2. Fetch all rows from banned_users table
    const { data: bannedRecords, error: banErr, count } = await supabase
      .from('banned_users')
      .select('*', { count: 'exact' })
      .order('banned_at', { ascending: false })
      .limit(limit);

    if (banErr) {
      console.error('Fetch banned users DB error:', banErr);
      return res.status(500).json({ error: 'Failed to fetch banned users from database', details: banErr.message });
    }

    if (!bannedRecords || bannedRecords.length === 0) {
      return res.status(200).json({
        success: true,
        bannedUsers: [],
        searchTimeMs: Math.round(performance.now() - startTime),
        total: 0
      });
    }

    // Extract User IDs
    const userIds = bannedRecords.map(b => b.user_id);

    // 3. Batch fetch profiles, admin logs, and stats in parallel
    const [profilesRes, ordersRes, depositsRes] = await Promise.all([
      supabase.from('profiles').select('*').in('id', userIds),
      supabase.from('orders').select('user_id, total_cost, status').in('user_id', userIds),
      supabase.from('transactions').select('user_id, amount, status').eq('type', 'deposit').in('user_id', userIds)
    ]);

    const profilesMap = new Map();
    (profilesRes.data || []).forEach(p => profilesMap.set(p.id, p));

    const ordersMap = new Map();
    (ordersRes.data || []).forEach(o => {
      if (!ordersMap.has(o.user_id)) ordersMap.set(o.user_id, { count: 0, totalSpent: 0 });
      const entry = ordersMap.get(o.user_id);
      entry.count += 1;
      if (o.status !== 'canceled' && o.status !== 'refunded') {
        entry.totalSpent += Number(o.total_cost || 0);
      }
    });

    const depositsMap = new Map();
    (depositsRes.data || []).forEach(d => {
      if (!depositsMap.has(d.user_id)) depositsMap.set(d.user_id, { count: 0, totalDeposited: 0 });
      const entry = depositsMap.get(d.user_id);
      entry.count += 1;
      if (d.status === 'approved' || d.status === 'completed') {
        entry.totalDeposited += Number(d.amount || 0);
      }
    });

    // 4. Combine banned info with profiles
    let combinedBannedUsers = bannedRecords.map(b => {
      const profile = profilesMap.get(b.user_id) || {};
      const orderStats = ordersMap.get(b.user_id) || { count: 0, totalSpent: 0 };
      const depositStats = depositsMap.get(b.user_id) || { count: 0, totalDeposited: 0 };

      return {
        banId: b.id,
        userId: b.user_id,
        reason: b.reason || 'No reason provided',
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

    // 5. Filter by search term if provided
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
      error: 'Internal server error fetching banned users',
      message: err.message
    });
  }
}
