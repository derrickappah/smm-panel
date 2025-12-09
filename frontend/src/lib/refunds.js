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
      status: order.status,
      refundStatus: order.refund_status,
      totalCost: order.total_cost
    });

    // Validation: Check if already refunded
    if (order.refund_status === 'succeeded') {
      console.log('Refund already processed for order:', order.id);
      return { 
        success: false, 
        error: 'This order has already been refunded. Refund status: succeeded' 
      };
    }

    if (order.status === 'refunded') {
      console.log('Order status is already refunded:', order.id);
      return { 
        success: false, 
        error: 'This order has already been refunded. Order status: refunded' 
      };
    }

    // Validation: Check if refund is in progress
    if (order.refund_status === 'pending') {
      console.log('Refund already in progress for order:', order.id);
      return { 
        success: false, 
        error: 'Refund is already in progress for this order. Please wait for it to complete.' 
      };
    }

    // Validation: Ensure order is cancelled
    if (order.status !== 'cancelled' && order.status !== 'canceled') {
      console.log('Order is not cancelled, cannot process refund:', order.id, order.status);
      return { 
        success: false, 
        error: `Order must be cancelled to process refund. Current status: ${order.status}` 
      };
    }

    // Check for existing refund transaction
    const { data: existingTransactions, error: transactionCheckError } = await supabase
      .from('transactions')
      .select('id, amount, created_at')
      .eq('order_id', order.id)
      .eq('type', 'refund')
      .eq('status', 'approved');

    if (transactionCheckError) {
      console.warn('Error checking for existing refund transactions:', transactionCheckError);
      // Continue anyway - this is just a check
    } else if (existingTransactions && existingTransactions.length > 0) {
      console.warn('Refund transaction already exists for this order:', {
        orderId: order.id,
        existingTransactions: existingTransactions.length,
        transactions: existingTransactions
      });
      // Don't fail - we'll check again before creating, but log the warning
    }

    // Pre-check: Fetch current refund_status before attempting atomic update
    // This allows early return if refund is already in progress or completed
    const { data: currentOrderCheck, error: checkError } = await supabase
      .from('orders')
      .select('refund_status, status')
      .eq('id', order.id)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking current refund status:', checkError);
      throw new Error(`Failed to check refund status: ${checkError.message}`);
    }

    if (currentOrderCheck) {
      // Early return if refund is already in progress or completed
      if (currentOrderCheck.refund_status === 'succeeded') {
        console.log('Refund already processed:', order.id);
        return { 
          success: false, 
          error: 'Refund already processed. This order has already been refunded.' 
        };
      }
      if (currentOrderCheck.refund_status === 'pending') {
        console.log('Refund already in progress:', order.id);
        return { 
          success: false, 
          error: 'Refund already in progress. Please wait for it to complete or check with another admin.' 
        };
      }
      // Only proceed if refund_status is NULL or 'failed' (allow retry of failed refunds)
      if (currentOrderCheck.refund_status !== null && currentOrderCheck.refund_status !== 'failed') {
        console.log('Unexpected refund status:', order.id, currentOrderCheck.refund_status);
        return { 
          success: false, 
          error: `Cannot process refund. Unexpected refund status: ${currentOrderCheck.refund_status}` 
        };
      }
    }

    // Atomic update: Mark refund as pending ONLY if it's not already set
    // This prevents race conditions where multiple admins try to refund simultaneously
    // Use maybeSingle() to handle 0 rows gracefully (when condition doesn't match)
    const { data: updatedOrder, error: pendingError } = await supabase
      .from('orders')
      .update({
        refund_status: 'pending'
      })
      .eq('id', order.id)
      .or(`refund_status.is.null,refund_status.eq.failed`) // Only update if null or failed (allow retry of failed refunds)
      .select()
      .maybeSingle();

    // Handle update result
    if (pendingError) {
      // Actual database error occurred
      console.error('Error marking refund as pending:', pendingError);
      throw new Error(`Failed to update refund status: ${pendingError.message}`);
    }

    if (!updatedOrder) {
      // No rows were updated - condition didn't match (race condition or status changed)
      // Re-check current status to provide accurate error message
      const { data: currentOrderRecheck } = await supabase
        .from('orders')
        .select('refund_status, status')
        .eq('id', order.id)
        .maybeSingle();
      
      if (currentOrderRecheck) {
        if (currentOrderRecheck.refund_status === 'succeeded') {
          console.log('Refund already processed (race condition detected):', order.id);
          return { 
            success: false, 
            error: 'Refund already processed. Another admin may have processed it while you were attempting the refund.' 
          };
        }
        if (currentOrderRecheck.refund_status === 'pending') {
          console.log('Refund already in progress (race condition detected):', order.id);
          return { 
            success: false, 
            error: 'Refund already in progress. Another admin may be processing it.' 
          };
        }
      }
      
      // Unknown reason for no update
      console.error('Failed to update refund status: No rows updated and status check returned:', currentOrderRecheck);
      throw new Error('Failed to update refund status. The order may have been modified by another process.');
    }

    console.log('Refund marked as pending, proceeding with refund processing');

    // Get user's current balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, name, email')
      .eq('id', order.user_id)
      .single();

    if (profileError) {
      // Rollback: Clear pending status on error
      await supabase
        .from('orders')
        .update({ refund_status: 'failed', refund_error: `Failed to fetch profile: ${profileError.message}` })
        .eq('id', order.id);
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

    if (!profile) {
      // Rollback: Clear pending status on error
      await supabase
        .from('orders')
        .update({ refund_status: 'failed', refund_error: 'User profile not found' })
        .eq('id', order.id);
      throw new Error('User profile not found');
    }

    const currentBalance = parseFloat(profile.balance || 0);
    const refundAmount = parseFloat(order.total_cost || 0);
    
    if (refundAmount <= 0) {
      // Rollback: Clear pending status on error
      await supabase
        .from('orders')
        .update({ refund_status: 'failed', refund_error: 'Invalid refund amount' })
        .eq('id', order.id);
      throw new Error('Invalid refund amount. Order total cost must be greater than 0.');
    }

    const newBalance = currentBalance + refundAmount;

    console.log('Processing manual refund:', {
      orderId: order.id,
      userId: order.user_id,
      currentBalance,
      refundAmount,
      newBalance,
      userName: profile.name,
      userEmail: profile.email
    });

    // Refund the amount
    const { data: updatedProfile, error: balanceError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', order.user_id)
      .select('balance')
      .single();

    if (balanceError) {
      // Rollback: Clear pending status on error
      await supabase
        .from('orders')
        .update({ refund_status: 'failed', refund_error: `Failed to update balance: ${balanceError.message}` })
        .eq('id', order.id);
      throw new Error(`Failed to update balance: ${balanceError.message}`);
    }

    // Verify the balance was updated correctly
    if (!updatedProfile || parseFloat(updatedProfile.balance) !== newBalance) {
      // Rollback: Clear pending status on error
      await supabase
        .from('orders')
        .update({ refund_status: 'failed', refund_error: 'Balance update verification failed' })
        .eq('id', order.id);
      throw new Error('Balance update verification failed');
    }

    console.log('Balance updated successfully:', {
      orderId: order.id,
      oldBalance: currentBalance,
      newBalance: updatedProfile.balance,
      refundAmount
    });

    // Check again for existing refund transaction before creating
    const { data: finalTransactionCheck } = await supabase
      .from('transactions')
      .select('id')
      .eq('order_id', order.id)
      .eq('type', 'refund')
      .eq('status', 'approved')
      .limit(1);

    let refundTransaction = null;
    if (finalTransactionCheck && finalTransactionCheck.length > 0) {
      console.warn('Refund transaction already exists, skipping creation:', {
        orderId: order.id,
        existingTransactionId: finalTransactionCheck[0].id
      });
    } else {
      // Create a refund transaction record
      const { data: newTransaction, error: transactionError } = await supabase
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
        refundTransaction = newTransaction;
        console.log('Refund transaction created successfully:', refundTransaction);
      }
    }

    // Update order status and refund status
    // Keep the original cancelled status but mark refund as succeeded
    const { error: orderError } = await supabase
      .from('orders')
      .update({
        status: 'refunded', // Change to refunded to indicate refund was processed
        refund_status: 'succeeded',
        refund_error: null
      })
      .eq('id', order.id);

    if (orderError) {
      console.warn('Failed to update order status:', orderError);
      // Balance was updated, so refund is successful even if status update fails
      // But try to at least mark refund as succeeded
      await supabase
        .from('orders')
        .update({ refund_status: 'succeeded', refund_error: null })
        .eq('id', order.id);
    }

    console.log('Manual refund processed successfully:', {
      orderId: order.id,
      refundAmount,
      newBalance: updatedProfile.balance,
      transactionCreated: !!refundTransaction
    });

    return { success: true, refundAmount, newBalance: updatedProfile.balance };
  } catch (error) {
    console.error('Error processing manual refund:', {
      error: error.message,
      orderId: order?.id,
      stack: error.stack
    });
    return { success: false, error: error.message || 'Failed to process refund' };
  }
};

