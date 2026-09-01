import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { redis } from '../utils/redisClient.js';
import { dispatchProviderOrder } from '../utils/providerClient.js';
import { processComboBuilderRefund } from '../utils/comboRefundHelper.js';

export default async function handler(req, res) {
  // CORS Setup
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

  // Rate Limiting
  const rateLimitResult = await rateLimit(req, res);
  if (rateLimitResult.blocked) {
    return res.status(429).json({ error: rateLimitResult.message });
  }

  let user;
  try {
    const authResult = await verifyAuth(req);
    user = authResult.user;
  } catch (authError) {
    return res.status(401).json({ error: 'Authentication required', message: authError.message });
  }

  const { combo_service_id, service_id, link, quantity } = req.body;

  if (!link || typeof link !== 'string' || link.trim() === '') {
    return res.status(400).json({ error: 'Valid URL/link is required' });
  }
  const qtyNum = Number(quantity || 1);
  if (isNaN(qtyNum) || qtyNum <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer' });
  }

  const targetComboId = combo_service_id || service_id;
  if (!targetComboId) {
    return res.status(400).json({ error: 'combo_service_id or service_id required' });
  }

  const supabase = getServiceRoleClient();

  // Resolve target combo service definition
  let comboDef = null;
  const { data: comboByDirectId } = await supabase
    .from('combo_services')
    .select('*')
    .eq('id', targetComboId)
    .single();

  if (comboByDirectId) {
    comboDef = comboByDirectId;
  } else {
    const { data: comboByServiceId } = await supabase
      .from('combo_services')
      .select('*')
      .eq('service_id', targetComboId)
      .single();
    comboDef = comboByServiceId;
  }

  if (!comboDef || comboDef.status !== 'active') {
    return res.status(404).json({ error: 'Combo Service not found or inactive' });
  }

  // Idempotency check with Redis (10 second lock)
  if (redis) {
    const orderLockKey = `smm:lock:combo:${user.id}:${comboDef.id}:${encodeURIComponent(link.trim())}`;
    const acquired = await redis.set(orderLockKey, 'locked', { nx: true, ex: 10 });
    if (!acquired) {
      return res.status(409).json({
        error: 'An identical combo order is currently being processed. Please wait a few seconds.'
      });
    }
  }

  try {
    // 1. Execute Atomic RPC to deduct balance & create Parent/Child DB records
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('place_combo_order_atomic', {
      p_user_id: user.id,
      p_combo_service_id: comboDef.id,
      p_link: link.trim(),
      p_quantity: qtyNum
    });

    if (rpcErr || !rpcRes || !rpcRes.success) {
      const errMsg = rpcErr?.message || rpcRes?.error || 'Failed to place combo order';
      return res.status(400).json({ error: errMsg });
    }

    const { parent_order_id, child_orders } = rpcRes;

    // 2. Dispatch child orders asynchronously
    // Immediate child orders (delay === 0) dispatch right away
    if (Array.isArray(child_orders)) {
      for (const child of child_orders) {
        const delaySec = child.delay_seconds || 0;

        const processChild = async () => {
          try {
            // Log Provider Request Attempt
            await supabase.from('combo_logs').insert({
              parent_order_id,
              child_order_id: child.id,
              log_type: 'provider_request',
              message: `Sending order to ${child.provider} (Service ID ${child.provider_service_id})`,
              details: { provider: child.provider, service_id: child.provider_service_id, quantity: child.fixed_quantity, link: link.trim() }
            });

            const providerResult = await dispatchProviderOrder({
              provider: child.provider,
              service_id: child.provider_service_id,
              link: link.trim(),
              quantity: child.fixed_quantity
            });

            if (providerResult.success) {
              await supabase
                .from('combo_child_orders')
                .update({
                  provider_order_id: providerResult.provider_order_id,
                  status: 'processing',
                  dispatched_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('id', child.id);

              await supabase.from('combo_logs').insert({
                parent_order_id,
                child_order_id: child.id,
                log_type: 'provider_response',
                message: `Provider order placed successfully with Order ID ${providerResult.provider_order_id}`,
                details: providerResult.raw_response
              });
            } else {
              await supabase
                .from('combo_child_orders')
                .update({
                  status: 'failed',
                  error_message: providerResult.error || 'Provider API error',
                  updated_at: new Date().toISOString()
                })
                .eq('id', child.id);

              await supabase.from('combo_logs').insert({
                parent_order_id,
                child_order_id: child.id,
                log_type: 'failure',
                message: `Provider placement failed: ${providerResult.error}`,
                details: { error: providerResult.error, raw: providerResult.raw_response }
              });

              // Calculate proportional refund for this failed child sub-order
              const totalChildrenCost = child_orders.reduce((sum, c) => sum + parseFloat(c.cost || 0), 0);
              const parentPrice = parseFloat(comboDef.selling_price || 0);
              const childRefundShare = totalChildrenCost > 0
                ? (parseFloat(child.cost || 0) / totalChildrenCost) * parentPrice
                : parentPrice / child_orders.length;

              await processComboBuilderRefund(supabase, {
                parentOrderId: parent_order_id,
                childOrderId: child.id,
                userId: user.id,
                amount: childRefundShare,
                refundType: 'partial',
                reason: `Refund for failed sub-order (${child.service_type}) in Combo #${parent_order_id.slice(0, 8)}: ${providerResult.error || 'Provider placement failed'}`
              });
            }

            // Recalculate Parent Order Status
            await supabase.rpc('update_combo_parent_order_status', {
              p_parent_order_id: parent_order_id
            });
          } catch (childErr) {
            console.error(`[ComboChildDispatch] Exception for child ${child.id}:`, childErr);
          }
        };

        if (delaySec === 0) {
          // Immediate dispatch
          processChild();
        } else {
          // Scheduled timeout dispatch in Node.js
          setTimeout(processChild, delaySec * 1000);
        }
      }
    }

    // 3. Return clean Parent Order response to customer
    return res.status(200).json({
      success: true,
      message: 'Combo order placed successfully',
      order: {
        id: parent_order_id,
        service_name: comboDef.name,
        selling_price: comboDef.selling_price,
        quantity: qtyNum,
        status: 'pending'
      }
    });
  } catch (err) {
    console.error('[place-combo-order] Exception:', err);
    return res.status(500).json({ error: err.message });
  }
}
