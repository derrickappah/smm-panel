/**
 * Advanced Admin User Export Server Action Endpoint
 * 
 * Path: /api/admin/export-users
 * Description: Server action for filtering and exporting users to CSV, JSON, or Excel with custom column selection, date ranges, and live preview count.
 */

import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import zlib from 'zlib';

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

    const body = req.method === 'POST' ? req.body : req.query;
    const {
      startDate,
      endDate,
      dateField = 'created_at', // 'created_at' | 'last_seen_at'
      roleFilter = 'all',
      balanceFilter = 'all', // 'all' | 'positive' | 'zero'
      banFilter = 'all', // 'all' | 'active' | 'banned'
      activityFilter = 'all', // 'all' | 'active_30d' | 'inactive_30d'
      depositFilter = 'all', // 'all' | 'has_deposited' | 'no_deposits'
      exportFormat = 'csv', // 'csv' | 'json' | 'excel'
      selectedColumns = ['name', 'email', 'phone_number', 'role', 'balance', 'total_spend', 'total_orders', 'created_at', 'last_seen_at'],
      exportLimit = 10000, // Default to 10,000 records
      previewCountOnly = false
    } = body;

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    // Helper builder for profiles query
    const buildProfilesQuery = () => {
      let q = supabase.from('profiles').select('*', { count: 'exact' });
      if (startDate) {
        q = q.gte(dateField, new Date(startDate).toISOString());
      }
      if (endDate) {
        q = q.lte(dateField, new Date(endDate + 'T23:59:59.999Z').toISOString());
      }
      if (roleFilter && roleFilter !== 'all') {
        q = q.eq('role', roleFilter);
      }
      if (balanceFilter === 'positive') {
        q = q.gt('balance', 0);
      } else if (balanceFilter === 'zero') {
        q = q.or('balance.eq.0,balance.is.null');
      }
      if (activityFilter === 'active_30d') {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte('last_seen_at', thirtyDaysAgo);
      } else if (activityFilter === 'inactive_30d') {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        q = q.or(`last_seen_at.lt.${thirtyDaysAgo},last_seen_at.is.null`);
      }
      return q.order('created_at', { ascending: false });
    };

    // If only previewing match count
    if (previewCountOnly) {
      const { count, error: countErr } = await buildProfilesQuery().limit(1);
      if (countErr) throw countErr;
      return res.status(200).json({
        success: true,
        count: count || 0
      });
    }

    // Always fetch ALL matching records from the database
    const { count: totalMatchCount, error: countErr } = await buildProfilesQuery().limit(1);
    if (countErr) {
      console.error('Count query error:', countErr);
      return res.status(500).json({ error: 'Failed to count matching users', details: countErr.message });
    }

    const totalToFetch = totalMatchCount || 0;
    const BATCH_SIZE = 1000;
    const CONCURRENCY = 8; // 8 parallel requests per step (8,000 items per roundtrip)
    let allUsers = [];

    for (let offset = 0; offset < totalToFetch; offset += BATCH_SIZE * CONCURRENCY) {
      const promises = [];
      for (let c = 0; c < CONCURRENCY; c++) {
        const pageFrom = offset + (c * BATCH_SIZE);
        if (pageFrom >= totalToFetch) break;
        const pageTo = Math.min(pageFrom + BATCH_SIZE - 1, totalToFetch - 1);
        promises.push(buildProfilesQuery().range(pageFrom, pageTo));
      }

      const results = await Promise.all(promises);
      for (const resBatch of results) {
        if (resBatch.error) {
          console.warn('Batch fetch warning:', resBatch.error.message);
        }
        if (resBatch.data && resBatch.data.length > 0) {
          allUsers = allUsers.concat(resBatch.data);
        }
      }
    }

    let filteredUsers = allUsers;

    // Filter by Banned status if specified
    if (banFilter && banFilter !== 'all') {
      const { data: bannedList } = await supabase.from('banned_users').select('user_id');
      const bannedUserIds = new Set((bannedList || []).map(b => b.user_id));

      if (banFilter === 'banned') {
        filteredUsers = filteredUsers.filter(u => bannedUserIds.has(u.id));
      } else if (banFilter === 'active') {
        filteredUsers = filteredUsers.filter(u => !bannedUserIds.has(u.id));
      }
    }

    // Check if order/deposit statistics are required by selected columns or deposit filter
    const activeCols = Array.isArray(selectedColumns) && selectedColumns.length > 0 ? selectedColumns : [];
    const needsStats = activeCols.includes('total_spend') || activeCols.includes('total_orders') || activeCols.includes('total_deposits') || depositFilter !== 'all';

    const ordersMap = new Map();
    const depositsMap = new Map();

    if (needsStats && filteredUsers.length > 0) {
      const userIds = filteredUsers.map(u => u.id);
      const CHUNK_SIZE = 500;

      // Process user IDs in chunks of 500 to stay within URL parameter boundaries
      for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        const chunkUserIds = userIds.slice(i, i + CHUNK_SIZE);
        const [ordersRes, depositsRes] = await Promise.all([
          supabase.from('orders').select('user_id, total_cost, status').in('user_id', chunkUserIds),
          supabase.from('transactions').select('user_id, amount, status').eq('type', 'deposit').in('user_id', chunkUserIds)
        ]);

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
    }

    // Filter by Deposit Status if specified
    if (depositFilter === 'has_deposited') {
      filteredUsers = filteredUsers.filter(u => (depositsMap.get(u.id)?.totalDeposited || 0) > 0);
    } else if (depositFilter === 'no_deposits') {
      filteredUsers = filteredUsers.filter(u => (depositsMap.get(u.id)?.totalDeposited || 0) === 0);
    }

    // Map column keys to human labels
    const columnLabels = {
      id: 'User ID',
      name: 'Full Name',
      email: 'Email Address',
      phone_number: 'Phone Number',
      role: 'Role',
      balance: 'Balance (GHS ₵)',
      referral_code: 'Referral Code',
      referred_by: 'Referred By',
      total_spend: 'Total Spent (GHS ₵)',
      total_orders: 'Total Orders',
      total_deposits: 'Total Deposited (GHS ₵)',
      created_at: 'Date Joined',
      last_seen_at: 'Last Active Date'
    };

    const effectiveCols = activeCols.length > 0
      ? activeCols
      : ['name', 'email', 'phone_number', 'role', 'balance', 'total_spend', 'total_orders', 'created_at', 'last_seen_at'];

    // CSV Formula / DDE Sanitizer against injection
    const sanitizeCell = (val) => {
      const str = String(val ?? '');
      if (/^[=\+\-@\t\r]/.test(str)) {
        return `'${str}`;
      }
      return str;
    };

    // Format JSON Response
    if (exportFormat === 'json') {
      const formattedJson = filteredUsers.map(u => {
        const orderStats = ordersMap.get(u.id) || { count: 0, totalSpent: 0 };
        const depositStats = depositsMap.get(u.id) || { count: 0, totalDeposited: 0 };

        const obj = {};
        effectiveCols.forEach(col => {
          if (col === 'total_spend') obj[columnLabels[col]] = Math.round(orderStats.totalSpent * 100) / 100;
          else if (col === 'total_orders') obj[columnLabels[col]] = orderStats.count;
          else if (col === 'total_deposits') obj[columnLabels[col]] = Math.round(depositStats.totalDeposited * 100) / 100;
          else if (col === 'balance') obj[columnLabels[col]] = Math.round(Number(u.balance || 0) * 100) / 100;
          else if (col === 'created_at') obj[columnLabels[col]] = u.created_at ? new Date(u.created_at).toISOString() : null;
          else if (col === 'last_seen_at') obj[columnLabels[col]] = u.last_seen_at ? new Date(u.last_seen_at).toISOString() : null;
          else obj[columnLabels[col]] = u[col] ?? '';
        });
        return obj;
      });

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=users_export_${new Date().toISOString().split('T')[0]}.json`);
      return res.status(200).json(formattedJson);
    }

    // Format CSV / Excel TSV Content
    const delimiter = exportFormat === 'excel' ? '\t' : ',';
    const headers = effectiveCols.map(c => columnLabels[c] || c);
    const csvRows = [headers.join(delimiter)];

    filteredUsers.forEach(u => {
      const orderStats = ordersMap.get(u.id) || { count: 0, totalSpent: 0 };
      const depositStats = depositsMap.get(u.id) || { count: 0, totalDeposited: 0 };

      const row = effectiveCols.map(col => {
        let cellVal = '';
        if (col === 'total_spend') cellVal = (Math.round(orderStats.totalSpent * 100) / 100).toFixed(2);
        else if (col === 'total_orders') cellVal = String(orderStats.count);
        else if (col === 'total_deposits') cellVal = (Math.round(depositStats.totalDeposited * 100) / 100).toFixed(2);
        else if (col === 'balance') cellVal = (Math.round(Number(u.balance || 0) * 100) / 100).toFixed(2);
        else if (col === 'created_at') cellVal = u.created_at ? new Date(u.created_at).toLocaleString() : '';
        else if (col === 'last_seen_at') cellVal = u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : 'Never';
        else cellVal = u[col] ?? '';

        const sanitized = sanitizeCell(cellVal);
        if (delimiter === ',') {
          return `"${String(sanitized).replace(/"/g, '""')}"`;
        }
        return String(sanitized).replace(/[\t\r\n]/g, ' ');
      });

      csvRows.push(row.join(delimiter));
    });

    const fileContent = csvRows.join('\n');
    const gzipped = zlib.gzipSync(Buffer.from(fileContent, 'utf-8'));

    const fileExt = exportFormat === 'excel' ? 'xls' : 'csv';
    const mimeType = exportFormat === 'excel' ? 'application/vnd.ms-excel' : 'text/csv; charset=utf-8';

    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename=users_export_${new Date().toISOString().split('T')[0]}.${fileExt}`);

    return res.status(200).send(gzipped);

  } catch (err) {
    console.error('Advanced user export endpoint error:', err);
    return res.status(500).json({
      error: 'Internal server error during user export',
      message: err.message
    });
  }
}
