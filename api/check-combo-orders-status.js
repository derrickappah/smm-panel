import { getServiceRoleClient } from './utils/auth.js';
import { dispatchProviderOrder, fetchProviderOrderStatus } from './utils/providerClient.js';
import { setCorsHeaders } from './utils/corsHeaders.js';

export default async function handler(req, res) {
  // CORS Headers
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getServiceRoleClient();

  try {
    const nowIso = new Date().toISOString();

    // 1. Process delayed pending child orders that are now due for dispatch
    const { data: pendingChilds } = await supabase
      .from('combo_child_orders')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .limit(50);

    if (Array.isArray(pendingChilds) && pendingChilds.length > 0) {
      for (const child of pendingChilds) {
        // Fetch parent order link
        const { data: parent } = await supabase
          .from('combo_parent_orders')
          .select('link')
          .eq('id', child.parent_order_id)
          .single();

        if (!parent || !parent.link) continue;

        await supabase.from('combo_logs').insert({
          parent_order_id: child.parent_order_id,
          child_order_id: child.id,
          log_type: 'provider_request',
          message: `Background worker dispatching delayed child order to ${child.provider}`,
          details: { provider: child.provider, service_id: child.provider_service_id }
        });

        const providerRes = await dispatchProviderOrder({
          provider: child.provider,
          service_id: child.provider_service_id,
          link: parent.link,
          quantity: child.fixed_quantity
        });

        if (providerRes.success) {
          await supabase
            .from('combo_child_orders')
            .update({
              provider_order_id: providerRes.provider_order_id,
              status: 'processing',
              dispatched_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', child.id);

          await supabase.from('combo_logs').insert({
            parent_order_id: child.parent_order_id,
            child_order_id: child.id,
            log_type: 'provider_response',
            message: `Delayed order successfully placed with provider (Order ID: ${providerRes.provider_order_id})`,
            details: providerRes.raw_response
          });
        } else {
          await supabase
            .from('combo_child_orders')
            .update({
              status: 'failed',
              error_message: providerRes.error || 'Delayed order placement failed',
              updated_at: new Date().toISOString()
            })
            .eq('id', child.id);

          await supabase.from('combo_logs').insert({
            parent_order_id: child.parent_order_id,
            child_order_id: child.id,
            log_type: 'failure',
            message: `Delayed order placement failed: ${providerRes.error}`,
            details: { error: providerRes.error }
          });
        }

        await supabase.rpc('update_combo_parent_order_status', {
          p_parent_order_id: child.parent_order_id
        });
      }
    }

    // 2. Sync status for child orders in 'processing' state
    const { data: processingChilds } = await supabase
      .from('combo_child_orders')
      .select('*')
      .eq('status', 'processing')
      .not('provider_order_id', 'is', null)
      .limit(50);

    let updatedCount = 0;
    const touchedParentIds = new Set();

    if (Array.isArray(processingChilds) && processingChilds.length > 0) {
      for (const child of processingChilds) {
        const statusRes = await fetchProviderOrderStatus({
          provider: child.provider,
          provider_order_id: child.provider_order_id
        });

        if (statusRes.success) {
          const rawStatus = (statusRes.status || '').toLowerCase();
          let mappedStatus = 'processing';

          if (rawStatus.includes('completed') || rawStatus.includes('success')) {
            mappedStatus = 'completed';
          } else if (rawStatus.includes('cancel') || rawStatus.includes('canceled')) {
            mappedStatus = 'canceled';
          } else if (rawStatus.includes('partial')) {
            mappedStatus = 'partial';
          } else if (rawStatus.includes('fail')) {
            mappedStatus = 'failed';
          }

          if (mappedStatus !== child.status) {
            await supabase
              .from('combo_child_orders')
              .update({
                status: mappedStatus,
                completed_at: mappedStatus === 'completed' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
              })
              .eq('id', child.id);

            await supabase.from('combo_logs').insert({
              parent_order_id: child.parent_order_id,
              child_order_id: child.id,
              log_type: 'provider_response',
              message: `Child order status updated from ${child.status} to ${mappedStatus}`,
              details: statusRes.raw_response
            });

            touchedParentIds.add(child.parent_order_id);
            updatedCount++;
          }
        }
      }
    }

    // 3. Recalculate parent status for all touched parent orders
    for (const parentId of touchedParentIds) {
      await supabase.rpc('update_combo_parent_order_status', {
        p_parent_order_id: parentId
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Combo orders status check completed',
      dispatched_pending: pendingChilds ? pendingChilds.length : 0,
      updated_processing: updatedCount
    });
  } catch (err) {
    console.error('[check-combo-orders-status] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
