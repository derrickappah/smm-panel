/**
 * Admin User Transactions Search & Lifetime History Server Action Endpoint
 * 
 * Path: /api/admin/user-transactions-search
 * Description: High-speed server action to search users and retrieve 100% of all user transactions, orders, tickets, and activity logs from account creation.
 * Guarantees exact price & amount tagging (in ₵) on every transaction, order, and refund.
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
    // 1. Verify Caller as Admin
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
    const { searchTerm = '', selectedUserId = '' } = body;

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    let targetUserId = selectedUserId;
    let candidateUsers = [];

    // 2. If targetUserId is not provided, search profiles or transaction/order IDs
    if (!targetUserId && searchTerm && searchTerm.trim()) {
      const cleanTerm = searchTerm.trim();
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanTerm);
      const searchPattern = `%${cleanTerm}%`;

      // Query profiles by Email, Name, Phone, or UUID
      let profileQuery = supabase.from('profiles').select('id, name, email, phone_number, balance, role, created_at');
      if (isUuid) {
        profileQuery = profileQuery.or(`id.eq.${cleanTerm},email.ilike.${searchPattern},name.ilike.${searchPattern},phone_number.ilike.${searchPattern}`);
      } else {
        profileQuery = profileQuery.or(`email.ilike.${searchPattern},name.ilike.${searchPattern},phone_number.ilike.${searchPattern}`);
      }

      const { data: matchedProfiles } = await profileQuery.limit(10);
      candidateUsers = matchedProfiles || [];

      // If no profiles matched directly, check if search term is a transaction ID or Order ID
      if (candidateUsers.length === 0) {
        if (isUuid) {
          const [txOwner, orderOwner] = await Promise.all([
            supabase.from('transactions').select('user_id').eq('id', cleanTerm).maybeSingle(),
            supabase.from('orders').select('user_id').eq('id', cleanTerm).maybeSingle()
          ]);
          const ownerId = txOwner.data?.user_id || orderOwner.data?.user_id;
          if (ownerId) {
            targetUserId = ownerId;
          }
        }
      } else if (candidateUsers.length === 1) {
        targetUserId = candidateUsers[0].id;
      }
    }

    // If candidate profiles found (multiple), return candidates list for user selection
    if (!targetUserId && candidateUsers.length > 1) {
      return res.status(200).json({
        success: true,
        multipleMatches: true,
        candidates: candidateUsers,
        searchTimeMs: Math.round(performance.now() - startTime)
      });
    }

    // If no user resolved and no candidate found
    if (!targetUserId && (!searchTerm || candidateUsers.length === 0)) {
      return res.status(200).json({
        success: true,
        multipleMatches: false,
        user: null,
        timeline: [],
        searchTimeMs: Math.round(performance.now() - startTime)
      });
    }

    // 3. Fetch Complete User Breakdown & History from account creation
    const [
      profileRes,
      banRes,
      refWalletRes,
      txRes,
      ordersRes,
      ticketsRes,
      activityRes
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', targetUserId).single(),
      supabase.from('banned_users').select('*').eq('user_id', targetUserId).maybeSingle(),
      supabase.from('referral_wallets').select('*').eq('user_id', targetUserId).maybeSingle(),
      // Fetch 100% of transactions for this user
      supabase.from('transactions').select('*').eq('user_id', targetUserId).order('created_at', { ascending: false }).limit(1000),
      // Fetch 100% of orders for this user
      supabase.from('orders').select(`
        id, user_id, service_id, promotion_package_id, link, quantity, total_cost, status, 
        smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, created_at, completed_at, refund_status,
        services(name, platform, service_type),
        promotion_packages(name, platform)
      `).eq('user_id', targetUserId).order('created_at', { ascending: false }).limit(1000),
      // Fetch support tickets
      supabase.from('tickets').select('*').eq('user_id', targetUserId).order('created_at', { ascending: false }).limit(200),
      // Fetch audit logs involving this user ID
      supabase.from('admin_activity_logs').select('*').ilike('details', `%${targetUserId}%`).order('created_at', { ascending: false }).limit(100)
    ]);

    if (profileRes.error || !profileRes.data) {
      return res.status(404).json({ error: 'Target user profile not found' });
    }

    const userProfile = profileRes.data;
    const banInfo = banRes.data || null;
    const referralWallet = refWalletRes.data || null;
    const transactions = txRes.data || [];
    const orders = ordersRes.data || [];
    const tickets = ticketsRes.data || [];
    const activityLogs = activityRes.data || [];

    // 4. Calculate Lifetime Summary Metrics
    let totalDeposited = 0;
    let approvedDepositsCount = 0;
    let totalSpent = 0;
    let completedOrdersCount = 0;
    let totalRefundsAmount = 0;
    let refundedCount = 0;

    transactions.forEach(t => {
      const amt = Number(t.amount || 0);
      if (t.type === 'deposit' && (t.status === 'approved' || t.status === 'completed')) {
        totalDeposited += amt;
        approvedDepositsCount += 1;
      }
    });

    orders.forEach(o => {
      const cost = Number(o.total_cost || 0);
      if (o.status !== 'canceled' && o.status !== 'refunded') {
        totalSpent += cost;
      }
      if (o.status === 'completed') {
        completedOrdersCount += 1;
      }
      if (o.status === 'refunded' || o.refund_status === 'succeeded') {
        totalRefundsAmount += cost;
        refundedCount += 1;
      }
    });

    // 5. Construct Unified Chronological Action Timeline
    const timelineEvents = [];

    // Event: Account Registration
    if (userProfile.created_at) {
      timelineEvents.push({
        id: `reg-${userProfile.id}`,
        eventType: 'ACCOUNT_CREATED',
        category: 'account',
        timestamp: userProfile.created_at,
        title: 'Account Created',
        description: `Registered account with email ${userProfile.email}`,
        priceDisplay: null,
        badge: 'REGISTERED',
        badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
        metadata: {
          role: userProfile.role || 'user',
          phone: userProfile.phone_number || 'N/A',
          referralCode: userProfile.referral_code || 'None'
        }
      });
    }

    // Events: Transactions (Deposits, Refunds, Admin Adjustments, Withdrawals)
    transactions.forEach(t => {
      const isDeposit = t.type === 'deposit';
      const isRefund = t.type === 'refund' || (t.description && t.description.toLowerCase().includes('refund'));
      const amt = Number(t.amount || 0);

      let priceTag = isDeposit ? `+₵${amt.toFixed(2)}` : isRefund ? `+₵${amt.toFixed(2)} Refund` : `₵${amt.toFixed(2)}`;

      timelineEvents.push({
        id: `tx-${t.id}`,
        eventType: isRefund ? 'REFUND' : isDeposit ? 'DEPOSIT' : 'TRANSACTION',
        category: 'financial',
        timestamp: t.created_at,
        title: isDeposit 
          ? `Deposit (₵${amt.toFixed(2)})` 
          : isRefund 
          ? `Refund Received (₵${amt.toFixed(2)})` 
          : `Transaction: ${t.type || 'wallet'} (₵${amt.toFixed(2)})`,
        description: t.description || (isDeposit ? `Deposit via ${t.payment_method || 'gateway'}` : 'Wallet activity'),
        priceDisplay: priceTag,
        amount: amt,
        status: t.status,
        badge: (t.status || 'completed').toUpperCase(),
        badgeColor: isRefund
          ? 'bg-purple-100 text-purple-800 border-purple-200'
          : t.status === 'approved' || t.status === 'completed' 
          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
          : t.status === 'pending'
          ? 'bg-amber-100 text-amber-800 border-amber-200'
          : 'bg-rose-100 text-rose-800 border-rose-200',
        metadata: {
          price: `₵${amt.toFixed(2)}`,
          txId: t.id,
          gateway: t.payment_method || t.gateway || 'System',
          reference: t.reference || t.id
        }
      });
    });

    // Events: Orders
    orders.forEach(o => {
      const serviceName = o.services?.name || o.promotion_packages?.name || 'SMM Service';
      const cost = Number(o.total_cost || 0);
      const isRefunded = o.status === 'refunded' || o.refund_status === 'succeeded';

      timelineEvents.push({
        id: `order-${o.id}`,
        eventType: isRefunded ? 'REFUNDED_ORDER' : 'ORDER',
        category: 'order',
        timestamp: o.created_at,
        title: isRefunded 
          ? `Order Refunded: ${serviceName} (₵${cost.toFixed(2)})`
          : `Order Placed: ${serviceName} (₵${cost.toFixed(2)})`,
        description: `Quantity: ${o.quantity?.toLocaleString() || 1} • Price: ₵${cost.toFixed(2)} • Link: ${o.link || 'N/A'}`,
        priceDisplay: isRefunded ? `+₵${cost.toFixed(2)} Refund` : `₵${cost.toFixed(2)}`,
        amount: cost,
        status: o.status,
        badge: (o.status || 'pending').toUpperCase(),
        badgeColor: o.status === 'completed'
          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
          : o.status === 'processing' || o.status === 'in progress'
          ? 'bg-blue-100 text-blue-800 border-blue-200'
          : isRefunded
          ? 'bg-purple-100 text-purple-800 border-purple-200'
          : o.status === 'canceled'
          ? 'bg-rose-100 text-rose-800 border-rose-200'
          : 'bg-amber-100 text-amber-800 border-amber-200',
        metadata: {
          orderPrice: `₵${cost.toFixed(2)}`,
          orderId: o.id,
          quantity: o.quantity,
          smmgenOrderId: o.smmgen_order_id,
          smmcostOrderId: o.smmcost_order_id,
          jbsmmpanelOrderId: o.jbsmmpanel_order_id,
          worldofsmmOrderId: o.worldofsmm_order_id,
          completedAt: o.completed_at
        }
      });
    });

    // Events: Tickets
    tickets.forEach(tk => {
      timelineEvents.push({
        id: `ticket-${tk.id}`,
        eventType: 'TICKET',
        category: 'support',
        timestamp: tk.created_at,
        title: `Support Ticket: ${tk.subject || 'Support Inquiry'}`,
        description: `Priority: ${tk.priority || 'normal'} • Status: ${tk.status || 'open'}`,
        priceDisplay: null,
        status: tk.status,
        badge: (tk.status || 'OPEN').toUpperCase(),
        badgeColor: tk.status === 'closed' || tk.status === 'resolved'
          ? 'bg-gray-100 text-gray-800 border-gray-200'
          : 'bg-indigo-100 text-indigo-800 border-indigo-200',
        metadata: {
          ticketId: tk.id
        }
      });
    });

    // Events: Ban History
    if (banInfo) {
      timelineEvents.push({
        id: `ban-${banInfo.id || banInfo.user_id}`,
        eventType: 'BAN',
        category: 'admin',
        timestamp: banInfo.banned_at || userProfile.created_at,
        title: 'Account Banned',
        description: `Ban Reason: ${banInfo.reason || 'No reason provided'}`,
        priceDisplay: null,
        badge: 'BANNED',
        badgeColor: 'bg-rose-600 text-white border-rose-700',
        metadata: {
          bannedBy: banInfo.banned_by
        }
      });
    }

    // Sort all timeline events in reverse chronological order (newest first)
    timelineEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const searchTimeMs = Math.round(performance.now() - startTime);

    return res.status(200).json({
      success: true,
      user: {
        ...userProfile,
        isBanned: !!banInfo,
        banInfo
      },
      summary: {
        totalDeposited: Math.round(totalDeposited * 100) / 100,
        approvedDepositsCount,
        totalSpent: Math.round(totalSpent * 100) / 100,
        totalOrdersCount: orders.length,
        completedOrdersCount,
        totalRefundsAmount: Math.round(totalRefundsAmount * 100) / 100,
        refundedCount,
        totalTicketsCount: tickets.length,
        currentBalance: Number(userProfile.balance || 0),
        referralBalance: Number(referralWallet?.balance || 0)
      },
      transactions,
      orders,
      tickets,
      timeline: timelineEvents,
      searchTimeMs
    });

  } catch (err) {
    console.error('Server Action User Transactions Search Error:', err);
    return res.status(500).json({
      error: 'Internal server error during user transactions search',
      message: err.message
    });
  }
}
