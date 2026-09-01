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

  let adminClient = supabase;
  try {
    adminClient = getServiceRoleClient();
  } catch (e) {
    adminClient = supabase;
  }

  try {
    // 1. Fetch split combo orders from public.orders
    const { data: splitOrders, error: splitErr } = await adminClient
      .from('orders')
      .select(`
        id, user_id, service_id, link, quantity, total_cost, status,
        smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, g1618_order_id, oldsmm_order_id, apiowner_order_id,
        combo_id, combo_name, combo_item_name, service_name, is_combo,
        created_at, updated_at,
        profiles ( name, email )
      `)
      .or('is_combo.eq.true,combo_id.not.is.null')
      .order('created_at', { ascending: false })
      .limit(200);

    if (splitErr) console.warn('[AdminComboOrders] split orders fetch warning:', splitErr.message);

    // Group split orders by combo_id or order_id
    const groupedMap = new Map();
    (splitOrders || []).forEach(order => {
      const groupKey = order.combo_id || order.id;
      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, {
          id: groupKey,
          combo_service_name: order.combo_name || order.service_name || 'Combo Package',
          user_id: order.user_id,
          link: order.link,
          quantity: order.quantity,
          selling_price: 0,
          status: order.status,
          created_at: order.created_at,
          profiles: order.profiles,
          child_orders: []
        });
      }

      const grp = groupedMap.get(groupKey);
      grp.selling_price += parseFloat(order.total_cost || 0);

      const pId = order.apiowner_order_id || order.oldsmm_order_id || order.g1618_order_id || order.worldofsmm_order_id || order.smmcost_order_id || order.jbsmmpanel_order_id || order.smmgen_order_id || order.id.slice(0, 8);
      let providerName = 'smmgen';
      if (order.apiowner_order_id) providerName = 'apiowner';
      else if (order.oldsmm_order_id) providerName = 'oldsmm';
      else if (order.g1618_order_id) providerName = 'g1618';
      else if (order.worldofsmm_order_id) providerName = 'worldofsmm';
      else if (order.smmcost_order_id) providerName = 'smmcost';
      else if (order.jbsmmpanel_order_id) providerName = 'jbsmmpanel';

      grp.child_orders.push({
        id: order.id,
        service_type: order.combo_item_name || order.service_name || 'Sub-service',
        provider: providerName,
        provider_order_id: pId,
        fixed_quantity: order.quantity,
        cost: order.total_cost,
        status: order.status,
        created_at: order.created_at
      });
    });

    const formattedSplitGroups = Array.from(groupedMap.values());

    // 2. Fetch legacy combo builder parent orders
    const { data: legacyOrders } = await adminClient
      .from('combo_parent_orders')
      .select(`
        *,
        child_orders:combo_child_orders(*),
        logs:combo_logs(*),
        profiles:user_id(name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    const allOrders = [...formattedSplitGroups, ...(legacyOrders || [])];
    allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.status(200).json({
      success: true,
      orders: allOrders
    });
  } catch (err) {
    console.error('[AdminComboOrders GET] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
