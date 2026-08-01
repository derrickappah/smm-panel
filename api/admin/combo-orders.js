import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user;
  try {
    const authResult = await verifyAuth(req);
    user = authResult.user;
  } catch (authError) {
    return res.status(401).json({ error: 'Authentication required', message: authError.message });
  }

  const supabase = getServiceRoleClient();

  // Check admin privileges
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { data: orders, error } = await supabase
      .from('combo_parent_orders')
      .select(`
        *,
        child_orders:combo_child_orders(*),
        logs:combo_logs(*)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      orders: orders || []
    });
  } catch (err) {
    console.error('[AdminComboOrders GET] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
