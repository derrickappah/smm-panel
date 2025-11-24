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
    // Check if refund was already attempted
    if (order.refund_status === 'succeeded') {
      console.log('Refund already processed for order:', order.id);
      return { success: true, message: 'Refund already processed' };
    }

    // Skip if order is not cancelled or failed
    if (order.status !== 'cancelled') {
      console.log('Order is not cancelled, skipping refund:', order.id, order.status);
      return { success: false, error: 'Order is not cancelled' };
    }

    // Mark refund as pending
    const { error: pendingError } = await supabase
      .from('orders')
      .update({
        refund_status: 'pending',
        refund_attempted_at: new Date().toISOString()
      })
      .eq('id', order.id);

    if (pendingError) {
      console.error('Error marking refund as pending:', pendingError);
      throw pendingError;
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

    // Create a transaction record for the refund
    try {
      await supabase
        .from('transactions')
        .insert({
          user_id: order.user_id,
          amount: refundAmount,
          type: 'deposit',
          status: 'approved'
        });
    } catch (transactionError) {
      // Don't fail the refund if transaction record creation fails, but log it
      console.warn('Failed to create refund transaction record:', transactionError);
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

    // Create a transaction record for the refund
    try {
      await supabase
        .from('transactions')
        .insert({
          user_id: order.user_id,
          amount: refundAmount,
          type: 'deposit',
          status: 'approved'
        });
    } catch (transactionError) {
      console.warn('Failed to create refund transaction record:', transactionError);
    }

    // Update order status and refund status
    const { error: orderError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
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

