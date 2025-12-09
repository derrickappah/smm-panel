// Refund utility functions
// Handles automatic and manual refunds for orders

import { supabase } from './supabase';

/**
 * Process automatic refund for a cancelled or failed order
 * @param {Object} order - Order object with id, user_id, total_cost, etc.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const processAutomaticRefund = async (order) => {
  try {
    // Check if refund was already attempted (check both succeeded and pending to prevent race conditions)
    if (order.refund_status === 'succeeded' || order.refund_status === 'pending') {
      console.log('Refund already processed or in progress for order:', order.id, order.refund_status);
      return { success: order.refund_status === 'succeeded', message: order.refund_status === 'succeeded' ? 'Refund already processed' : 'Refund already in progress' };
    }

    // Skip if order is not cancelled or failed (also check for 'canceled' to match SMMGen)
    if (order.status !== 'cancelled' && order.status !== 'canceled') {
      console.log('Order is not cancelled, skipping refund:', order.id, order.status);
      return { success: false, error: 'Order is not cancelled' };
    }

    // Atomically mark refund as pending ONLY if it's not already pending or succeeded
    // This prevents race conditions where multiple calls try to refund simultaneously
    const { data: updatedOrder, error: pendingError } = await supabase
      .from('orders')
      .update({
        refund_status: 'pending',
        refund_attempted_at: new Date().toISOString()
      })
      .eq('id', order.id)
      .is('refund_status', null) // Only update if refund_status is null (not already set)
      .select()
      .single();

    // If no rows were updated, it means refund_status was already set (race condition prevented)
    if (pendingError || !updatedOrder) {
      // Check if it's because refund_status was already set
      const { data: currentOrder } = await supabase
        .from('orders')
        .select('refund_status')
        .eq('id', order.id)
        .single();
      
      if (currentOrder && (currentOrder.refund_status === 'succeeded' || currentOrder.refund_status === 'pending')) {
        console.log('Refund already processed or in progress (race condition prevented):', order.id);
        return { success: currentOrder.refund_status === 'succeeded', message: 'Refund already processed or in progress' };
      }
      
      console.error('Error marking refund as pending:', pendingError);
      throw pendingError || new Error('Failed to update refund status');
    }

    // Get user's current balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, name, email')
      .eq('id', order.user_id)
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

    if (!profile) {
      throw new Error('User profile not found');
    }

    const currentBalance = parseFloat(profile.balance || 0);
    const refundAmount = parseFloat(order.total_cost || 0);
    const newBalance = currentBalance + refundAmount;

    console.log('Processing automatic refund:', {
      orderId: order.id,
      userId: order.user_id,
      currentBalance,
      refundAmount,
      newBalance
    });

    // Refund the amount
    const { data: updatedProfile, error: balanceError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', order.user_id)
      .select('balance')
      .single();

    if (balanceError) {
      throw new Error(`Failed to update balance: ${balanceError.message}`);
    }

    // Verify the balance was updated correctly
    if (!updatedProfile || parseFloat(updatedProfile.balance) !== newBalance) {
      throw new Error('Balance update verification failed');
    }

    // Create a refund transaction record
    const { data: refundTransaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: order.user_id,
        amount: refundAmount,
        type: 'refund',
        status: 'approved',
        order_id: order.id // Link to the order being refunded
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Failed to create refund transaction record:', transactionError);
      // Log error but don't fail the refund - balance was already updated
      // The transaction record is important for audit trail, so log it prominently
    } else {
      console.log('Refund transaction created successfully:', refundTransaction);
    }

    // Mark refund as succeeded
    const { error: statusError } = await supabase
      .from('orders')
      .update({
        refund_status: 'succeeded',
        refund_error: null
      })
      .eq('id', order.id);

    if (statusError) {
      console.warn('Failed to update refund status to succeeded:', statusError);
      // Balance was updated, so refund is successful even if status update fails
    }

    console.log('Automatic refund processed successfully:', {
      orderId: order.id,
      refundAmount,
      newBalance: updatedProfile.balance
    });

    return { success: true, refundAmount, newBalance: updatedProfile.balance };
  } catch (error) {
    console.error('Error processing automatic refund:', error);

    // Mark refund as failed
    try {
      await supabase
        .from('orders')
        .update({
          refund_status: 'failed',
          refund_error: error.message || 'Unknown error'
        })
        .eq('id', order.id);
    } catch (updateError) {
      console.error('Failed to update refund status to failed:', updateError);
    }

    return { success: false, error: error.message || 'Failed to process refund' };
  }
};

/**
 * Process manual refund (for admins when automatic refund fails)
 * @param {Object} order - Order object
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const processManualRefund = async (order) => {
  try {
    // Validate order object
    if (!order) {
      throw new Error('Order object is required');
    }

    if (!order.user_id) {
      throw new Error('Order is missing user_id. Cannot process refund.');
    }

    if (!order.id) {
      throw new Error('Order is missing id. Cannot process refund.');
    }

    console.log('Processing manual refund for order:', {
      orderId: order.id,
      userId: order.user_id,
      totalCost: order.total_cost
    });

    // Get user's current balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, name, email')
      .eq('id', order.user_id)
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

    if (!profile) {
      throw new Error('User profile not found');
    }

    const currentBalance = parseFloat(profile.balance || 0);
    const refundAmount = parseFloat(order.total_cost || 0);
    const newBalance = currentBalance + refundAmount;

    console.log('Processing manual refund:', {
      orderId: order.id,
      userId: order.user_id,
      currentBalance,
      refundAmount,
      newBalance
    });

    // Refund the amount
    const { data: updatedProfile, error: balanceError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', order.user_id)
      .select('balance')
      .single();

    if (balanceError) {
      throw new Error(`Failed to update balance: ${balanceError.message}`);
    }

    // Verify the balance was updated correctly
    if (!updatedProfile || parseFloat(updatedProfile.balance) !== newBalance) {
      throw new Error('Balance update verification failed');
    }

    // Create a refund transaction record
    const { data: refundTransaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: order.user_id,
        amount: refundAmount,
        type: 'refund',
        status: 'approved',
        order_id: order.id // Link to the order being refunded
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Failed to create refund transaction record:', transactionError);
      // Log error but don't fail the refund - balance was already updated
      // The transaction record is important for audit trail, so log it prominently
    } else {
      console.log('Refund transaction created successfully:', refundTransaction);
    }

    // Update order status and refund status
    const { error: orderError } = await supabase
      .from('orders')
      .update({
        status: 'refunded',
        refund_status: 'succeeded',
        refund_error: null
      })
      .eq('id', order.id);

    if (orderError) {
      console.warn('Failed to update order status:', orderError);
      // Balance was updated, so refund is successful even if status update fails
    }

    return { success: true, refundAmount, newBalance: updatedProfile.balance };
  } catch (error) {
    console.error('Error processing manual refund:', error);
    return { success: false, error: error.message || 'Failed to process refund' };
  }
};

