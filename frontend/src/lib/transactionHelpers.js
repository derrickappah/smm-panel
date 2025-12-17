// Transaction helper utilities
// Functions for creating transaction records and auto-classifying transactions

import { supabase } from './supabase';

/**
 * Creates a transaction record in the database
 * @param {string} userId - User ID for the transaction
 * @param {number} amount - Transaction amount (positive for credits, negative for debits)
 * @param {string} type - Transaction type: 'deposit', 'order', 'refund', 'referral_bonus', 'manual_adjustment', 'unknown'
 * @param {string} description - Human-readable description
 * @param {string} adminId - Admin user ID (optional, for manual adjustments)
 * @param {string} status - Transaction status: 'pending', 'approved', 'rejected' (default: 'approved')
 * @param {string} orderId - Order ID (optional, for refunds and orders)
 * @param {boolean} autoClassified - Whether this was auto-classified (default: false)
 * @returns {Promise<{success: boolean, transaction?: object, error?: string}>}
 */
export const createTransactionRecord = async ({
  userId,
  amount,
  type,
  description,
  adminId = null,
  status = 'approved',
  orderId = null,
  autoClassified = false
}) => {
  try {
    if (!userId || amount === undefined || !type) {
      throw new Error('Missing required fields: userId, amount, and type are required');
    }

    const transactionData = {
      user_id: userId,
      amount: Math.abs(amount), // Store absolute value
      type,
      status,
      description: description || null,
      admin_id: adminId || null,
      order_id: orderId || null,
      auto_classified: autoClassified
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert(transactionData)
      .select()
      .single();

    if (error) {
      console.error('Error creating transaction record:', error);
      return { success: false, error: error.message };
    }

    return { success: true, transaction: data };
  } catch (error) {
    console.error('Error in createTransactionRecord:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Auto-classifies a transaction based on context
 * @param {Object} context - Context object with balance change information
 * @param {string} context.userId - User ID
 * @param {number} context.amount - Balance change amount (positive or negative)
 * @param {string} context.orderId - Order ID (if linked to an order)
 * @param {boolean} context.isAdminAction - Whether this was triggered by an admin
 * @param {string} context.paymentMethod - Payment method (if applicable)
 * @param {string} context.paymentReference - Payment reference (if applicable)
 * @param {Object} context.referralInfo - Referral information (if applicable)
 * @returns {Promise<{type: string, description: string, autoClassified: boolean}>}
 */
export const autoClassifyTransaction = async (context) => {
  const {
    userId,
    amount,
    orderId = null,
    isAdminAction = false,
    paymentMethod = null,
    paymentReference = null,
    referralInfo = null
  } = context;

  // Check if linked to an order (refund scenario)
  if (orderId && amount > 0) {
    // Check if order is cancelled
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('status, refund_status')
        .eq('id', orderId)
        .single();

      if (order && (order.status === 'cancelled' || order.status === 'canceled' || order.refund_status === 'succeeded')) {
        return {
          type: 'refund',
          description: `Refund for cancelled order ${orderId}`,
          autoClassified: true
        };
      }
    } catch (error) {
      console.warn('Error checking order status for classification:', error);
    }
  }

  // Check for referral bonus scenario
  if (referralInfo && amount > 0) {
    return {
      type: 'referral_bonus',
      description: 'Referral bonus for first deposit',
      autoClassified: true
    };
  }

  // Check if admin action (manual adjustment)
  if (isAdminAction) {
    const adjustmentType = amount > 0 ? 'credit' : 'debit';
    return {
      type: 'manual_adjustment',
      description: `Manual balance ${adjustmentType} by admin`,
      autoClassified: false // Admin actions are explicit, not auto-classified
    };
  }

  // Check for payment method (deposit scenario)
  if (paymentMethod || paymentReference) {
    const methodMap = {
      'paystack': 'Paystack',
      'korapay': 'Korapay',
      'moolre': 'Moolre',
      'moolre_web': 'Moolre Web',
      'hubtel': 'Hubtel',
      'manual': 'Manual Deposit',
      'momo': 'Mobile Money'
    };

    const methodName = methodMap[paymentMethod] || paymentMethod || 'Payment';
    return {
      type: 'deposit',
      description: `Deposit via ${methodName}${paymentReference ? ` (${paymentReference})` : ''}`,
      autoClassified: true
    };
  }

  // Default to unknown if no pattern matches
  return {
    type: 'unknown',
    description: `Unclassified balance change of ₵${Math.abs(amount).toFixed(2)}`,
    autoClassified: true
  };
};

/**
 * Creates a transaction record with auto-classification
 * @param {Object} context - Context object for auto-classification
 * @param {string} adminId - Admin user ID (optional)
 * @returns {Promise<{success: boolean, transaction?: object, error?: string}>}
 */
export const createAutoClassifiedTransaction = async (context, adminId = null) => {
  try {
    const classification = await autoClassifyTransaction(context);
    
    return await createTransactionRecord({
      userId: context.userId,
      amount: context.amount,
      type: classification.type,
      description: classification.description,
      adminId,
      status: 'approved',
      orderId: context.orderId || null,
      autoClassified: classification.autoClassified
    });
  } catch (error) {
    console.error('Error in createAutoClassifiedTransaction:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Creates a manual adjustment transaction record
 * @param {string} userId - User ID
 * @param {number} amount - Adjustment amount (positive for credit, negative for debit)
 * @param {string} adminId - Admin user ID
 * @param {string} reason - Reason for adjustment (optional)
 * @returns {Promise<{success: boolean, transaction?: object, error?: string}>}
 */
export const createManualAdjustmentTransaction = async (userId, amount, adminId, reason = null) => {
  const adjustmentType = amount > 0 ? 'credit' : 'debit';
  const description = reason || `Manual balance ${adjustmentType} by admin`;

  return await createTransactionRecord({
    userId,
    amount: Math.abs(amount),
    type: 'manual_adjustment',
    description,
    adminId,
    status: 'approved',
    autoClassified: false
  });
};
