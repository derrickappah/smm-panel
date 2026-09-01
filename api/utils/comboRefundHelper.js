/**
 * Accurate Proportional Refund & Status Calculation Helper for Combo Orders
 */

/**
 * Calculate accurate proportional refund for a multi-component package combo order
 * @param {Object} order - The root order from public.orders
 * @param {Array} updatedComponents - Array of component objects with live status and remains
 * @returns {Object} { refundAmount, refundType, totalRemains, newParentStatus, reason }
 */
export function calculatePackageComboRefund(order, updatedComponents) {
  if (!Array.isArray(updatedComponents) || updatedComponents.length === 0) {
    return { refundAmount: 0, refundType: 'none', totalRemains: 0, newParentStatus: order.status };
  }

  const totalCost = parseFloat(order.total_cost || 0);
  const totalComponents = updatedComponents.length;
  let totalCalculatedRefund = 0;
  let totalRemains = 0;

  const completedCount = updatedComponents.filter(c => c.status === 'completed').length;
  const canceledFailedCount = updatedComponents.filter(c => ['canceled', 'cancelled', 'refunded', 'failed'].includes(c.status)).length;
  const inProgressCount = updatedComponents.filter(c => ['in progress', 'processing'].includes(c.status)).length;
  const partialCount = updatedComponents.filter(c => c.status === 'partial').length;

  // Component share of the total package cost
  const defaultShare = totalCost / totalComponents;

  updatedComponents.forEach((comp, idx) => {
    // If component has its own assigned cost, use it; otherwise split total cost equally
    const compCost = comp.cost ? parseFloat(comp.cost) : defaultShare;
    const compQty = parseInt(comp.quantity || comp.fixed_quantity || order.quantity || 1, 10);
    const compStatus = String(comp.status || '').toLowerCase();

    if (['canceled', 'cancelled', 'refunded', 'failed'].includes(compStatus)) {
      // 100% refund for this canceled/failed component
      totalCalculatedRefund += compCost;
      totalRemains += compQty;
    } else if (compStatus === 'partial') {
      const compRemains = parseInt(comp.remains || 0, 10);
      if (compRemains > 0 && compQty > 0) {
        const partialShare = (compCost / compQty) * compRemains;
        totalCalculatedRefund += partialShare;
        totalRemains += compRemains;
      } else {
        // Fallback: 50% refund if provider didn't return remains count
        totalCalculatedRefund += (compCost * 0.5);
      }
    }
  });

  // Precision formatting: round to 2 decimals
  let finalRefundAmount = Math.round((totalCalculatedRefund + Number.EPSILON) * 100) / 100;
  if (finalRefundAmount > totalCost) finalRefundAmount = totalCost;

  // Determine aggregate root order status
  let newParentStatus = order.status;
  let refundType = 'partial';

  if (completedCount === totalComponents) {
    newParentStatus = 'completed';
    refundType = 'none';
    finalRefundAmount = 0;
  } else if (canceledFailedCount === totalComponents) {
    newParentStatus = 'canceled';
    refundType = 'full';
    finalRefundAmount = totalCost;
  } else if (completedCount > 0 && (canceledFailedCount > 0 || partialCount > 0)) {
    newParentStatus = 'partial';
    refundType = 'partial';
  } else if (inProgressCount > 0 || completedCount > 0) {
    newParentStatus = 'processing';
  } else if (canceledFailedCount > 0 || partialCount > 0) {
    newParentStatus = 'canceled';
  }

  return {
    refundAmount: finalRefundAmount,
    refundType,
    totalRemains,
    newParentStatus,
    reason: `Combo Package status: ${newParentStatus} (${completedCount} completed, ${canceledFailedCount} canceled/failed, ${partialCount} partial)`
  };
}

/**
 * Execute wallet refund for a builder combo child order or parent order atomically
 * @param {Object} supabase - Supabase service role client
 * @param {Object} params - Refund parameters
 */
export async function processComboBuilderRefund(supabase, {
  parentOrderId,
  childOrderId = null,
  userId,
  amount,
  refundType = 'partial',
  reason = 'Combo sub-order cancellation'
}) {
  const refundAmount = Math.round((parseFloat(amount || 0) + Number.EPSILON) * 100) / 100;
  if (refundAmount <= 0) return { success: false, error: 'Refund amount must be greater than zero' };

  try {
    // 1. Fetch current profile balance
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, balance')
      .eq('id', userId)
      .single();

    if (pErr || !profile) {
      throw new Error(`Profile not found for user ${userId}: ${pErr?.message}`);
    }

    const newBalance = parseFloat((parseFloat(profile.balance || 0) + refundAmount).toFixed(2));

    // 2. Credit profile balance
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', userId);

    if (updateErr) {
      throw new Error(`Failed to update profile balance: ${updateErr.message}`);
    }

    // 3. Record in transactions table (order_id is null to respect foreign key to public.orders)
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        amount: refundAmount,
        type: 'refund',
        status: 'approved',
        description: reason,
        order_id: null
      })
      .select()
      .single();

    if (txErr) {
      console.warn(`[ComboRefund] Warning: transaction record insertion error: ${txErr.message}`);
    }

    // 4. Log in combo_logs
    await supabase.from('combo_logs').insert({
      parent_order_id: parentOrderId,
      child_order_id: childOrderId,
      log_type: 'refund',
      message: `Refund of ₵${refundAmount.toFixed(2)} processed to user wallet (${reason})`,
      details: {
        refund_amount: refundAmount,
        new_balance: newBalance,
        refund_type: refundType,
        transaction_id: tx?.id
      }
    });

    console.log(`[ComboRefund] Successfully credited ₵${refundAmount.toFixed(2)} to user ${userId} for combo order ${parentOrderId}. New balance: ₵${newBalance}`);

    return {
      success: true,
      amount_refunded: refundAmount,
      new_balance: newBalance,
      transaction_id: tx?.id
    };
  } catch (error) {
    console.error(`[ComboRefund] Error processing refund for combo order ${parentOrderId}:`, error);
    return { success: false, error: error.message };
  }
}
