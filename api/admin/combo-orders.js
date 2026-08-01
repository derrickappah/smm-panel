import { verifyAdmin } from '../utils/auth.js';

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

  let user, supabase;
  try {
    const authResult = await verifyAdmin(req);
    user = authResult.user;
    supabase = authResult.supabase;
  } catch (authError) {
    console.error('[AdminComboOrders Auth Error]:', authError.message);
    const statusCode = authError.message.includes('Authentication') ? 401 : 403;
    return res.status(statusCode).json({ error: authError.message });
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
