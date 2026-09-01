import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { redis } from '../utils/redisClient.js';
import { placeProviderOrder, extractOrderId } from '../utils/providers.js';
import { cleanUrl } from '../utils/orderValidation.js';
import crypto from 'crypto';

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

  const { combo_service_id, service_id, package_id, link: rawLink, quantity, comments } = req.body;

  if (!rawLink || typeof rawLink !== 'string' || rawLink.trim() === '') {
    return res.status(400).json({ error: 'Valid URL/link is required' });
  }

  const cleanedLink = cleanUrl(rawLink.trim());
  if (!cleanedLink) {
    return res.status(400).json({ error: 'Enter a valid URL.' });
  }

  const qtyNum = Number(quantity || 1);
  if (isNaN(qtyNum) || qtyNum <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer' });
  }

  const targetComboId = combo_service_id || service_id || package_id;
  if (!targetComboId) {
    return res.status(400).json({ error: 'combo_service_id, service_id, or package_id required' });
  }

  const supabase = getServiceRoleClient();

  let comboName = 'Combo Package';
  let totalSellingPrice = 0;
  let resolvedItems = []; // Array of { provider, provider_service_id, service_type, quantity, estimated_rate }
  let parentServiceId = null;

  // ── 1. TRY COMBO BUILDER TABLE (combo_services & combo_service_items) ─────────
  let comboDef = null;
  const { data: comboByDirectId } = await supabase
    .from('combo_services')
    .select('*')
    .eq('id', targetComboId)
    .maybeSingle();

  if (comboByDirectId) {
    comboDef = comboByDirectId;
  } else {
    const { data: comboByServiceId } = await supabase
      .from('combo_services')
      .select('*')
      .eq('service_id', targetComboId)
      .maybeSingle();
    comboDef = comboByServiceId;
  }

  if (comboDef && comboDef.status === 'active') {
    comboName = comboDef.name;
    parentServiceId = comboDef.service_id || null;
    totalSellingPrice = Math.round(Number(comboDef.selling_price || 0) * 100) / 100;

    const { data: childItems, error: itemsErr } = await supabase
      .from('combo_service_items')
      .select('*')
      .eq('combo_service_id', comboDef.id)
      .eq('enabled', true)
      .order('display_order', { ascending: true });

    if (!itemsErr && childItems && childItems.length > 0) {
      resolvedItems = childItems.map((item, idx) => ({
        provider: item.provider,
        provider_service_id: String(item.provider_service_id),
        service_type: item.service_type || `Item #${idx + 1}`,
        quantity: Number(item.fixed_quantity || qtyNum),
        estimated_rate: Number(item.estimated_cost) || 1
      }));
    }
  }

  // ── 2. TRY SERVICES TABLE (is_combo with combo_service_ids / combo_smmgen_service_ids) ──
  if (resolvedItems.length === 0) {
    const { data: svc } = await supabase
      .from('services')
      .select('*')
      .eq('id', targetComboId)
      .maybeSingle();

    if (svc && svc.is_combo) {
      comboName = svc.name;
      parentServiceId = svc.id;
      
      // Calculate selling price
      const ratePerThousand = Number(svc.rate || 0);
      const isPerThousand = !svc.is_fixed_price && svc.service_type !== 'Package';
      if (isPerThousand && qtyNum > 1) {
        totalSellingPrice = Math.round(((ratePerThousand * qtyNum) / 1000) * 100) / 100;
      } else {
        totalSellingPrice = Math.round(ratePerThousand * 100) / 100;
      }

      if (svc.combo_service_ids && Array.isArray(svc.combo_service_ids) && svc.combo_service_ids.length > 0) {
        const componentIds = svc.combo_service_ids.map(item => typeof item === 'object' && item !== null ? item.id : item);
        const { data: compServices, error: compErr } = await supabase
          .from('services')
          .select('id, name, service_type, rate, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, worldofsmm_service_id, g1618_service_id, oldsmm_service_id, apiowner_service_id')
          .in('id', componentIds);

        if (!compErr && compServices) {
          const orderedServices = componentIds.map(id => compServices.find(s => s.id === id)).filter(Boolean);
          for (let i = 0; i < orderedServices.length; i++) {
            const s = orderedServices[i];
            const rawCompConfig = svc.combo_service_ids.find(item => (typeof item === 'object' && item !== null ? item.id : item) === s.id);
            const compRate = (typeof rawCompConfig === 'object' && rawCompConfig?.combo_rate) ? Number(rawCompConfig.combo_rate) : Number(s.rate || 1);

            let provider = null;
            let provider_service_id = null;
            if (s.apiowner_service_id) {
              provider = 'apiowner';
              provider_service_id = s.apiowner_service_id;
            } else if (s.oldsmm_service_id) {
              provider = 'oldsmm';
              provider_service_id = s.oldsmm_service_id;
            } else if (s.g1618_service_id) {
              provider = 'g1618';
              provider_service_id = s.g1618_service_id;
            } else if (s.worldofsmm_service_id) {
              provider = 'worldofsmm';
              provider_service_id = s.worldofsmm_service_id;
            } else if (s.smmcost_service_id) {
              provider = 'smmcost';
              provider_service_id = s.smmcost_service_id;
            } else if (s.jbsmmpanel_service_id) {
              provider = 'jbsmmpanel';
              provider_service_id = s.jbsmmpanel_service_id;
            } else if (s.smmgen_service_id) {
              provider = 'smmgen';
              provider_service_id = s.smmgen_service_id;
            }

            if (provider && provider_service_id) {
              resolvedItems.push({
                provider,
                provider_service_id: String(provider_service_id),
                service_type: s.service_type || s.name || `Item #${i + 1}`,
                quantity: qtyNum,
                estimated_rate: compRate > 0 ? compRate : 1
              });
            }
          }
        }
      } else if (svc.combo_smmgen_service_ids && Array.isArray(svc.combo_smmgen_service_ids) && svc.combo_smmgen_service_ids.length > 0) {
        resolvedItems = svc.combo_smmgen_service_ids.map((sid, idx) => ({
          provider: 'smmgen',
          provider_service_id: String(sid),
          service_type: `Item #${idx + 1}`,
          quantity: qtyNum,
          estimated_rate: 1
        }));
      }
    }
  }

  // ── 3. TRY PROMOTION_PACKAGES TABLE (is_combo with combo_package_ids) ─────────
  if (resolvedItems.length === 0) {
    const { data: pkg } = await supabase
      .from('promotion_packages')
      .select('*')
      .eq('id', targetComboId)
      .maybeSingle();

    if (pkg && pkg.is_combo) {
      comboName = pkg.name;
      totalSellingPrice = Math.round(Number(pkg.price || 0) * 100) / 100;

      if (pkg.combo_package_ids && Array.isArray(pkg.combo_package_ids) && pkg.combo_package_ids.length > 0) {
        const componentIds = pkg.combo_package_ids.map(item => typeof item === 'object' && item !== null ? item.id : item);
        const { data: compPkgs, error: compErr } = await supabase
          .from('promotion_packages')
          .select('id, name, service_type, price, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, worldofsmm_service_id, g1618_service_id, oldsmm_service_id, apiowner_service_id')
          .in('id', componentIds);

        if (!compErr && compPkgs) {
          const orderedPkgs = componentIds.map(id => compPkgs.find(p => p.id === id)).filter(Boolean);
          for (let i = 0; i < orderedPkgs.length; i++) {
            const p = orderedPkgs[i];
            const rawCompConfig = pkg.combo_package_ids.find(item => (typeof item === 'object' && item !== null ? item.id : item) === p.id);
            const compPrice = (typeof rawCompConfig === 'object' && rawCompConfig?.combo_price) ? Number(rawCompConfig.combo_price) : Number(p.price || 1);

            let provider = null;
            let provider_service_id = null;
            if (p.apiowner_service_id) {
              provider = 'apiowner';
              provider_service_id = p.apiowner_service_id;
            } else if (p.oldsmm_service_id) {
              provider = 'oldsmm';
              provider_service_id = p.oldsmm_service_id;
            } else if (p.g1618_service_id) {
              provider = 'g1618';
              provider_service_id = p.g1618_service_id;
            } else if (p.worldofsmm_service_id) {
              provider = 'worldofsmm';
              provider_service_id = p.worldofsmm_service_id;
            } else if (p.smmcost_service_id) {
              provider = 'smmcost';
              provider_service_id = p.smmcost_service_id;
            } else if (p.jbsmmpanel_service_id) {
              provider = 'jbsmmpanel';
              provider_service_id = p.jbsmmpanel_service_id;
            } else if (p.smmgen_service_id) {
              provider = 'smmgen';
              provider_service_id = p.smmgen_service_id;
            }

            if (provider && provider_service_id) {
              resolvedItems.push({
                provider,
                provider_service_id: String(provider_service_id),
                service_type: p.service_type || p.name || `Package #${i + 1}`,
                quantity: qtyNum,
                estimated_rate: compPrice > 0 ? compPrice : 1
              });
            }
          }
        }
      } else if (pkg.combo_smmgen_service_ids && Array.isArray(pkg.combo_smmgen_service_ids) && pkg.combo_smmgen_service_ids.length > 0) {
        resolvedItems = pkg.combo_smmgen_service_ids.map((sid, idx) => ({
          provider: 'smmgen',
          provider_service_id: String(sid),
          service_type: `Item #${idx + 1}`,
          quantity: qtyNum,
          estimated_rate: 1
        }));
      }
    }
  }

  // If still not resolved or empty child items
  if (resolvedItems.length === 0) {
    return res.status(404).json({ error: 'Combo Service not found or inactive' });
  }

  if (isNaN(totalSellingPrice) || totalSellingPrice <= 0) {
    return res.status(400).json({ error: 'Invalid selling price for combo service' });
  }

  // ── 4. CALCULATE PROPORTIONAL ALLOCATED SELLING PRICES ─────────────────────────
  const totalEstimatedCost = resolvedItems.reduce((sum, item) => sum + (Number(item.estimated_rate) || 0), 0);
  let allocatedSum = 0;
  const allocatedCosts = [];

  for (let i = 0; i < resolvedItems.length; i++) {
    const item = resolvedItems[i];
    if (i === resolvedItems.length - 1) {
      // Last item gets the exact remaining balance to guarantee exact sum = totalSellingPrice
      const lastCost = Math.round((totalSellingPrice - allocatedSum + Number.EPSILON) * 100) / 100;
      allocatedCosts.push(Math.max(0, lastCost));
    } else {
      let costShare = 0;
      if (totalEstimatedCost > 0) {
        costShare = ((Number(item.estimated_rate) || 0) / totalEstimatedCost) * totalSellingPrice;
      } else {
        costShare = totalSellingPrice / resolvedItems.length;
      }
      const roundedShare = Math.round((costShare + Number.EPSILON) * 100) / 100;
      allocatedCosts.push(roundedShare);
      allocatedSum += roundedShare;
    }
  }

  const itemsPayload = resolvedItems.map((item, idx) => ({
    provider: item.provider,
    provider_service_id: String(item.provider_service_id),
    service_type: item.service_type || `Item #${idx + 1}`,
    quantity: Number(item.quantity || qtyNum),
    allocated_cost: allocatedCosts[idx]
  }));

  // Idempotency check with Redis (10 second lock)
  if (redis) {
    const orderLockKey = `smm:lock:combo:${user.id}:${targetComboId}:${encodeURIComponent(cleanedLink)}`;
    const acquired = await redis.set(orderLockKey, 'locked', { nx: true, ex: 10 });
    if (!acquired) {
      return res.status(409).json({
        error: 'An identical combo order is currently being processed. Please wait a few seconds.'
      });
    }
  }

  const hashData = `${user.id}-${targetComboId}-${cleanedLink}-${Math.floor(Date.now() / 60000)}`;
  const idempotencyHash = crypto.createHash('md5').update(hashData).digest('hex');

  try {
    // 1. Execute Atomic RPC to deduct balance & create separate independent order records in public.orders
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_secure_combo_orders', {
      p_user_id: user.id,
      p_service_id: parentServiceId,
      p_combo_name: comboName,
      p_link: cleanedLink,
      p_total_cost: totalSellingPrice,
      p_items: itemsPayload,
      p_idempotency_key: idempotencyHash
    });

    if (rpcErr || !rpcRes || !rpcRes.success) {
      const errMsg = rpcErr?.message || rpcRes?.message || 'Failed to process combo order';
      return res.status(400).json({ error: errMsg });
    }

    const { combo_id, created_orders, new_balance } = rpcRes;
    const splitOrderResults = [];

    // 2. Dispatch each split order independently to its provider API
    for (const splitOrder of (created_orders || [])) {
      try {
        console.log(`[ComboSplit] Dispatching split order ${splitOrder.id} (${splitOrder.service_type}) to ${splitOrder.provider} (Service ID: ${splitOrder.provider_service_id})...`);

        const providerResponse = await placeProviderOrder(splitOrder.provider, {
          service: splitOrder.provider_service_id,
          link: cleanedLink,
          quantity: splitOrder.quantity,
          comments: comments || undefined
        });

        console.log(`[ComboSplit] Provider response for ${splitOrder.id}:`, providerResponse);
        const extId = extractOrderId(providerResponse);

        if (extId) {
          // Success: Update this specific order with provider order ID and status='processing'
          const updateData = {
            status: 'processing',
            submitted_at: new Date().toISOString(),
            last_status_check: new Date().toISOString()
          };

          const p = splitOrder.provider.toLowerCase();
          const pid = String(extId);
          if (p === 'smmgen')     updateData.smmgen_order_id     = pid;
          if (p === 'smmcost')    updateData.smmcost_order_id   = pid;
          if (p === 'jbsmmpanel') updateData.jbsmmpanel_order_id = parseInt(pid, 10) || 0;
          if (p === 'worldofsmm') updateData.worldofsmm_order_id = pid;
          if (p === 'g1618')      updateData.g1618_order_id      = pid;
          if (p === 'oldsmm')     updateData.oldsmm_order_id     = pid;
          if (p === 'apiowner')   updateData.apiowner_order_id   = pid;

          await supabase.from('orders').update(updateData).eq('id', splitOrder.id);

          splitOrderResults.push({
            order_id: splitOrder.id,
            service: splitOrder.service_name,
            provider: splitOrder.provider,
            provider_order_id: pid,
            quantity: splitOrder.quantity,
            allocated_cost: splitOrder.allocated_cost,
            status: 'processing'
          });
        } else {
          // Placement failed for this specific split order: auto-refund its allocated amount ONLY
          const errMsg = providerResponse?.error || providerResponse?.message || 'Provider order placement failed';
          console.warn(`[ComboSplit] Split order ${splitOrder.id} failed:`, errMsg);

          await supabase.from('orders').update({
            status: 'failed',
            last_provider_error: errMsg,
            provider_error_details: providerResponse || {}
          }).eq('id', splitOrder.id);

          // Auto-refund ONLY the allocated selling price for this specific child order
          await supabase.rpc('process_automatic_refund', {
            p_order_id: String(splitOrder.id),
            p_refund_amount: parseFloat(splitOrder.allocated_cost || 0),
            p_refund_type: 'full',
            p_remains: 0
          });

          splitOrderResults.push({
            order_id: splitOrder.id,
            service: splitOrder.service_name,
            provider: splitOrder.provider,
            provider_order_id: null,
            quantity: splitOrder.quantity,
            allocated_cost: splitOrder.allocated_cost,
            status: 'refunded',
            refunded: true,
            error: errMsg
          });
        }
      } catch (childErr) {
        console.error(`[ComboSplit] Exception placing order ${splitOrder.id}:`, childErr.message);

        await supabase.from('orders').update({
          status: 'failed',
          last_provider_error: childErr.message
        }).eq('id', splitOrder.id);

        // Auto-refund for this child order
        await supabase.rpc('process_automatic_refund', {
          p_order_id: String(splitOrder.id),
          p_refund_amount: parseFloat(splitOrder.allocated_cost || 0),
          p_refund_type: 'full',
          p_remains: 0
        });

        splitOrderResults.push({
          order_id: splitOrder.id,
          service: splitOrder.service_name,
          provider: splitOrder.provider,
          provider_order_id: null,
          quantity: splitOrder.quantity,
          allocated_cost: splitOrder.allocated_cost,
          status: 'refunded',
          refunded: true,
          error: childErr.message
        });
      }
    }

    // 3. Return clean response with split order details
    return res.status(200).json({
      success: true,
      message: 'Combo order placed and split successfully',
      combo_id,
      combo_name: comboName,
      total_cost: totalSellingPrice,
      orders: splitOrderResults,
      new_balance
    });

  } catch (err) {
    console.error('[place-combo-order] Fatal exception:', err);
    return res.status(500).json({ error: err.message });
  }
}
