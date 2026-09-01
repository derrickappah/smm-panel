import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';
import { fetchProviderOrderStatus } from '../utils/providerClient.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

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
  } catch (authErr) {
    return res.status(401).json({ error: 'Authentication required', message: authErr.message });
  }

  const { combo_order_id, parent_order_id, order_id } = req.body || {};
  const targetId = parent_order_id || combo_order_id || order_id;

  if (!targetId) {
    return res.status(400).json({ error: 'Order ID is required' });
  }

  const supabase = getServiceRoleClient();

  try {
    // 1. Try finding in combo_parent_orders (Combo Builder table)
    const { data: parentOrder, error: pErr } = await supabase
      .from('combo_parent_orders')
      .select('*, combo_child_orders(*)')
      .eq('id', targetId)
      .maybeSingle();

    if (parentOrder) {
      // Enforce user authorization
      if (parentOrder.user_id !== user.id) {
        // Check if user is admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized to view this order' });
        }
      }

      const childOrders = parentOrder.combo_child_orders || [];
      let childUpdated = false;

      for (const child of childOrders) {
        // Only check status for active/processing child orders with provider ID
        if (child.provider_order_id && ['pending', 'processing', 'in progress'].includes(child.status)) {
          const statusRes = await fetchProviderOrderStatus({
            provider: child.provider,
            provider_order_id: child.provider_order_id
          });

          if (statusRes.success && statusRes.status) {
            const raw = String(statusRes.status).toLowerCase();
            let newStatus = child.status;

            if (raw.includes('completed') || raw.includes('success')) {
              newStatus = 'completed';
            } else if (raw.includes('cancel')) {
              newStatus = 'canceled';
            } else if (raw.includes('partial')) {
              newStatus = 'partial';
            } else if (raw.includes('fail')) {
              newStatus = 'failed';
            } else if (raw.includes('processing') || raw.includes('in progress')) {
              newStatus = 'processing';
            }

            if (newStatus !== child.status) {
              childUpdated = true;
              await supabase
                .from('combo_child_orders')
                .update({
                  status: newStatus,
                  completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', child.id);

              await supabase.from('combo_logs').insert({
                parent_order_id: parentOrder.id,
                child_order_id: child.id,
                log_type: 'provider_response',
                message: `Status check updated child order status from ${child.status} to ${newStatus}`,
                details: statusRes.raw_response
              });
            }
          }
        }
      }

      if (childUpdated) {
        // Recalculate parent status via RPC
        await supabase.rpc('update_combo_parent_order_status', {
          p_parent_order_id: parentOrder.id
        });
      }

      // Fetch fresh updated state
      const { data: updatedParent } = await supabase
        .from('combo_parent_orders')
        .select('*, combo_child_orders(*)')
        .eq('id', parentOrder.id)
        .single();

      return res.status(200).json({
        success: true,
        type: 'combo_builder',
        order: updatedParent,
        child_orders: updatedParent?.combo_child_orders || []
      });
    }

    // 2. Otherwise, check public.orders table for combo package/legacy combo
    const { data: regularOrder, error: regErr } = await supabase
      .from('orders')
      .select('*, services(name, platform, service_type), promotion_packages(name, platform, service_type)')
      .eq('id', targetId)
      .maybeSingle();

    if (!regularOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Enforce authorization
    if (regularOrder.user_id !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized to view this order' });
      }
    }

    const components = regularOrder.component_provider_order_ids;
    if (Array.isArray(components) && components.length > 0) {
      let componentsChanged = false;
      const updatedComponents = [];
      let allCompleted = true;
      let anyInProgress = false;
      let anyCanceled = false;
      let anyFailed = false;

      for (const comp of components) {
        let compStatus = comp.status || 'pending';

        if (comp.provider_order_id && ['pending', 'processing', 'in progress'].includes(compStatus)) {
          const statusRes = await fetchProviderOrderStatus({
            provider: comp.provider,
            provider_order_id: comp.provider_order_id
          });

          if (statusRes.success && statusRes.status) {
            const raw = String(statusRes.status).toLowerCase();
            let mapped = compStatus;

            if (raw.includes('completed') || raw.includes('success')) {
              mapped = 'completed';
            } else if (raw.includes('cancel')) {
              mapped = 'canceled';
            } else if (raw.includes('partial')) {
              mapped = 'partial';
            } else if (raw.includes('fail')) {
              mapped = 'failed';
            } else if (raw.includes('processing') || raw.includes('in progress')) {
              mapped = 'processing';
            }

            if (mapped !== compStatus) {
              componentsChanged = true;
              compStatus = mapped;
            }
          }
        }

        updatedComponents.push({
          ...comp,
          status: compStatus
        });

        if (compStatus !== 'completed') allCompleted = false;
        if (['in progress', 'processing'].includes(compStatus)) anyInProgress = true;
        if (['canceled', 'cancelled', 'refunded'].includes(compStatus)) anyCanceled = true;
        if (compStatus === 'failed') anyFailed = true;
      }

      const completedCount = updatedComponents.filter(c => c.status === 'completed').length;
      const inactiveFailedCount = updatedComponents.filter(c => ['canceled', 'cancelled', 'refunded', 'failed'].includes(c.status)).length;
      const inProgressCount = updatedComponents.filter(c => ['in progress', 'processing'].includes(c.status)).length;
      const totalCount = updatedComponents.length;

      let newParentStatus = regularOrder.status;
      if (completedCount === totalCount) {
        newParentStatus = 'completed';
      } else if (inactiveFailedCount === totalCount) {
        newParentStatus = 'canceled';
      } else if (completedCount > 0 && inactiveFailedCount > 0) {
        newParentStatus = 'partial';
      } else if (inProgressCount > 0 || completedCount > 0) {
        newParentStatus = 'processing';
      } else if (inactiveFailedCount > 0) {
        newParentStatus = 'canceled';
      }


      const updatePayload = {
        component_provider_order_ids: updatedComponents,
        last_status_check: new Date().toISOString()
      };

      if (newParentStatus !== regularOrder.status) {
        updatePayload.status = newParentStatus;
        if (newParentStatus === 'completed') {
          updatePayload.completed_at = new Date().toISOString();
        }
      }

      await supabase.from('orders').update(updatePayload).eq('id', regularOrder.id);

      const { data: refreshedOrder } = await supabase
        .from('orders')
        .select('*, services(name, platform, service_type), promotion_packages(name, platform, service_type)')
        .eq('id', regularOrder.id)
        .single();

      return res.status(200).json({
        success: true,
        type: 'package_combo',
        order: refreshedOrder,
        child_orders: refreshedOrder.component_provider_order_ids || []
      });
    }

    return res.status(200).json({
      success: true,
      type: 'single_order',
      order: regularOrder
    });

  } catch (err) {
    console.error('[CheckComboStatus] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
