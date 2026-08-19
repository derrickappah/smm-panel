/**
 * Admin API Endpoint to Fetch 360 Full User Details Breakdown
 * 
 * Path: /api/admin/user-details-full
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

    const userId = req.method === 'POST' ? req.body.userId : req.query.userId || req.query.id;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    let supabase;
    try {
      supabase = getServiceRoleClient();
    } catch (e) {
      supabase = authResult.supabase;
    }

    // Parallel fetch profile, orders, transactions, tickets, banned status, referral wallet
    const [profileRes, ordersRes, txRes, ticketsRes, banRes, refRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('orders').select('id, link, quantity, total_cost, status, smmgen_order_id, jbsmmpanel_order_id, created_at, services(name)').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      supabase.from('transactions').select('id, amount, type, status, description, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      supabase.from('tickets').select('id, subject, status, priority, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      supabase.from('banned_users').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('referral_wallets').select('*').eq('user_id', userId).maybeSingle()
    ]);

    if (profileRes.error || !profileRes.data) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    return res.status(200).json({
      success: true,
      profile: profileRes.data,
      orders: ordersRes.data || [],
      transactions: txRes.data || [],
      tickets: ticketsRes.data || [],
      banInfo: banRes.data || null,
      referralWallet: refRes.data || null
    });

  } catch (err) {
    console.error('Fetch full user details endpoint error:', err);
    return res.status(500).json({
      error: 'Internal server error fetching user details',
      message: err.message
    });
  }
}
