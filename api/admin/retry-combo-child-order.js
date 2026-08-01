import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';
import { dispatchProviderOrder } from '../utils/providerClient.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
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

  const { child_order_id } = req.body;
  if (!child_order_id) {
    return res.status(400).json({ error: 'child_order_id is required' });
  }

  try {
    // 1. Fetch child order details
    const { data: child, error: childErr } = await supabase
      .from('combo_child_orders')
      .select('*')
      .eq('id', child_order_id)
      .single();

    if (childErr || !child) {
      return res.status(404).json({ error: 'Child order not found' });
    }

    // Safety constraint: NEVER resubmit completed orders!
    if (child.status === 'completed') {
      return res.status(400).json({ error: 'Child order is already completed and cannot be retried' });
    }

    // 2. Fetch parent order link
    const { data: parent, error: parentErr } = await supabase
      .from('combo_parent_orders')
      .select('link')
      .eq('id', child.parent_order_id)
      .single();

    if (parentErr || !parent || !parent.link) {
      return res.status(400).json({ error: 'Parent order or link missing' });
    }

    // Log manual retry attempt
    await supabase.from('combo_logs').insert({
      parent_order_id: child.parent_order_id,
      child_order_id: child.id,
      log_type: 'manual_retry',
      message: `Admin initiated manual retry for child order (Attempt #${child.retry_count + 1})`,
      details: { admin_id: user.id, previous_status: child.status, previous_error: child.error_message }
    });

    // 3. Dispatch to provider API
    const providerResult = await dispatchProviderOrder({
      provider: child.provider,
      service_id: child.provider_service_id,
      link: parent.link,
      quantity: child.fixed_quantity
    });

    if (providerResult.success) {
      await supabase
        .from('combo_child_orders')
        .update({
          provider_order_id: providerResult.provider_order_id,
          status: 'processing',
          error_message: null,
          retry_count: child.retry_count + 1,
          dispatched_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', child.id);

      await supabase.from('combo_logs').insert({
        parent_order_id: child.parent_order_id,
        child_order_id: child.id,
        log_type: 'provider_response',
        message: `Manual retry succeeded. New Provider Order ID: ${providerResult.provider_order_id}`,
        details: providerResult.raw_response
      });

      // Recalculate Parent Order status
      await supabase.rpc('update_combo_parent_order_status', {
        p_parent_order_id: child.parent_order_id
      });

      return res.status(200).json({
        success: true,
        message: 'Child order manually retried successfully',
        provider_order_id: providerResult.provider_order_id
      });
    } else {
      await supabase
        .from('combo_child_orders')
        .update({
          status: 'failed',
          error_message: providerResult.error || 'Manual retry failed',
          retry_count: child.retry_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', child.id);

      await supabase.from('combo_logs').insert({
        parent_order_id: child.parent_order_id,
        child_order_id: child.id,
        log_type: 'failure',
        message: `Manual retry failed: ${providerResult.error}`,
        details: { error: providerResult.error, raw: providerResult.raw_response }
      });

      await supabase.rpc('update_combo_parent_order_status', {
        p_parent_order_id: child.parent_order_id
      });

      return res.status(400).json({
        success: false,
        error: providerResult.error || 'Manual retry failed'
      });
    }
  } catch (err) {
    console.error('[retry-combo-child-order] Exception:', err);
    return res.status(500).json({ error: err.message });
  }
}
