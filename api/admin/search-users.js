/**
 * High-Speed Admin User Search Server Action Endpoint
 * 
 * Path: /api/admin/search-users
 * Description: Server-side admin user search powered by Supabase Service Role client.
 * Bypasses RLS and returns rich 360 user profiles with aggregated stats.
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
    const roleFilter = (req.method === 'POST' ? req.body.roleFilter : req.query.roleFilter) || 'all';
    const limit = Math.min(parseInt((req.method === 'POST' ? req.body.limit : req.query.limit) || '50', 10), 100);

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply Role Filter
    if (roleFilter && roleFilter !== 'all') {
      query = query.eq('role', roleFilter);
    }

    // Apply Search Term Filter if provided
    if (searchTerm && searchTerm.trim()) {
      const trimmedSearch = searchTerm.trim();
      const searchPattern = `%${trimmedSearch}%`;
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmedSearch);

      const conditions = [
        `name.ilike.${searchPattern}`,
        `email.ilike.${searchPattern}`,
        `phone_number.ilike.${searchPattern}`,
        `referral_code.ilike.${searchPattern}`
      ];

      if (isUuid) {
        conditions.push(`id.eq.${trimmedSearch}`);
      }

      query = query.or(conditions.join(','));
    }

    const { data: users, error: usersError, count } = await query;

    if (usersError) {
      console.error('Server Action User Search DB Error:', usersError);
      return res.status(500).json({ error: 'Database search failed', details: usersError.message });
    }

    if (!users || users.length === 0) {
      return res.status(200).json({
        success: true,
        users: [],
        searchTimeMs: Math.round(performance.now() - startTime),
        total: 0
      });
    }

    // Extract User IDs for batch statistics fetching
    const userIds = users.map(u => u.id);

    // Batch fetch statistics for matching users in parallel
    const [ordersRes, depositsRes, bannedRes, referralWalletsRes] = await Promise.all([
      // Fetch order counts & total spent per user
      supabase
        .from('orders')
        .select('user_id, total_cost, status')
        .in('user_id', userIds),

      // Fetch deposit transactions per user
      supabase
        .from('transactions')
        .select('user_id, amount, status')
        .eq('type', 'deposit')
        .in('user_id', userIds),

      // Check banned users status
      supabase
        .from('banned_users')
        .select('user_id, reason, banned_at')
        .in('user_id', userIds),

      // Fetch referral wallets
      supabase
        .from('referral_wallets')
        .select('user_id, balance, total_earned')
        .in('user_id', userIds)
    ]);

    const ordersMap = new Map();
    const depositsMap = new Map();
    const bannedMap = new Map();
    const referralMap = new Map();

    // Aggregate Orders
    (ordersRes.data || []).forEach(o => {
      if (!ordersMap.has(o.user_id)) {
        ordersMap.set(o.user_id, { count: 0, totalSpent: 0, completedCount: 0 });
      }
      const entry = ordersMap.get(o.user_id);
      entry.count += 1;
      if (o.status !== 'canceled' && o.status !== 'refunded') {
        entry.totalSpent += Number(o.total_cost || 0);
      }
      if (o.status === 'completed') {
        entry.completedCount += 1;
      }
    });

    // Aggregate Deposits
    (depositsRes.data || []).forEach(d => {
      if (!depositsMap.has(d.user_id)) {
        depositsMap.set(d.user_id, { count: 0, totalDeposited: 0, approvedCount: 0 });
      }
      const entry = depositsMap.get(d.user_id);
      if (d.status === 'approved' || d.status === 'completed') {
        entry.approvedCount += 1;
        entry.totalDeposited += Number(d.amount || 0);
      }
      entry.count += 1;
    });

    // Map Banned Status
    (bannedRes.data || []).forEach(b => {
      bannedMap.set(b.user_id, { isBanned: true, reason: b.reason, bannedAt: b.banned_at });
    });

    // Map Referral Wallets
    (referralWalletsRes.data || []).forEach(rw => {
      referralMap.set(rw.user_id, { referralBalance: Number(rw.balance || 0), referralTotalEarned: Number(rw.total_earned || 0) });
    });

    // Combine user profiles with rich statistics
    const enrichedUsers = users.map(user => {
      const orderStats = ordersMap.get(user.id) || { count: 0, totalSpent: 0, completedCount: 0 };
      const depositStats = depositsMap.get(user.id) || { count: 0, totalDeposited: 0, approvedCount: 0 };
      const banInfo = bannedMap.get(user.id) || { isBanned: false, reason: null, bannedAt: null };
      const refInfo = referralMap.get(user.id) || { referralBalance: 0, referralTotalEarned: 0 };

      return {
        ...user,
        balance: Number(user.balance || 0),
        stats: {
          totalOrders: orderStats.count,
          completedOrders: orderStats.completedCount,
          totalSpent: Math.round(orderStats.totalSpent * 100) / 100,
          totalDeposits: depositStats.count,
          approvedDeposits: depositStats.approvedCount,
          totalDeposited: Math.round(depositStats.totalDeposited * 100) / 100,
          referralBalance: refInfo.referralBalance,
          referralTotalEarned: refInfo.referralTotalEarned
        },
        banInfo
      };
    });

    const searchTimeMs = Math.round(performance.now() - startTime);

    return res.status(200).json({
      success: true,
      users: enrichedUsers,
      searchTimeMs,
      total: count || enrichedUsers.length
    });

  } catch (err) {
    console.error('Server Action User Search Internal Error:', err);
    return res.status(500).json({
      error: 'Internal server error during user search',
      message: err.message
    });
  }
}
