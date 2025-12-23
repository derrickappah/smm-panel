/**
 * Lightweight API endpoint to check transaction status
 * Optimized for frequent polling from frontend
 * 
 * This endpoint returns minimal data needed for polling:
 * - Transaction status
 * - Transaction amount
 * - User balance (if transaction is approved)
 * 
 * Environment Variables Required:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (for server-side operations)
 * 
 * Query Parameters:
 * - transactionId: The transaction ID to check
 * 
 * Returns:
 * {
 *   status: 'pending' | 'approved' | 'rejected' | 'failed',
 *   amount: number,
 *   balance?: number (only if approved)
 * }
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transactionId } = req.query;

    if (!transactionId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: transactionId' 
      });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ 
        error: 'Supabase credentials not configured' 
      });
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Fetch transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('id, status, amount, user_id, type, deposit_method, moolre_reference, moolre_status, created_at')
      .eq('id', transactionId)
      .single();

    if (transactionError) {
      console.error('Error fetching transaction:', transactionError);
      return res.status(404).json({ 
        error: 'Transaction not found',
        details: transactionError.message 
      });
    }

    if (!transaction) {
      return res.status(404).json({ 
        error: 'Transaction not found' 
      });
    }

    // If transaction is Moolre or Moolre Web and still pending, verify with Moolre API
    if ((transaction.deposit_method === 'moolre' || transaction.deposit_method === 'moolre_web') && 
        transaction.status === 'pending' && 
        transaction.moolre_reference) {
      try {
        const MOOLRE_API_USER = process.env.MOOLRE_API_USER;
        const MOOLRE_API_PUBKEY = process.env.MOOLRE_API_PUBKEY;
        const MOOLRE_ACCOUNT_NUMBER = process.env.MOOLRE_ACCOUNT_NUMBER;

        if (MOOLRE_API_USER && MOOLRE_API_PUBKEY && MOOLRE_ACCOUNT_NUMBER) {
          // Verify payment with Moolre API
          const moolreResponse = await fetch('https://api.moolre.com/open/transact/status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-USER': MOOLRE_API_USER,
              'X-API-PUBKEY': MOOLRE_API_PUBKEY
            },
            body: JSON.stringify({
              type: 1,
              idtype: 1, // 1 = Unique externalref
              id: transaction.moolre_reference,
              accountnumber: MOOLRE_ACCOUNT_NUMBER
            })
          });

          if (moolreResponse.ok) {
            const moolreData = await moolreResponse.json();
            const txstatus = moolreData.data?.txstatus; // 1=Success, 0=Pending, 2=Failed

            if (txstatus === 1) {
              // Payment successful - update transaction status and balance atomically
              // IMPORTANT: Only call approve_deposit_transaction_universal if transaction is still pending
              // If already approved, we need to manually ensure balance was updated
              // Using universal function which supports all payment methods (Moolre, Paystack, Korapay, etc.)
              
              if (transaction.status === 'pending') {
                // Transaction is still pending - use universal atomic function to update both status and balance
                // This function supports all payment methods including Moolre
                const { data: approvalResult, error: balanceError } = await supabase.rpc('approve_deposit_transaction_universal', {
                  p_transaction_id: transaction.id,
                  p_payment_method: transaction.deposit_method || 'moolre',
                  p_payment_status: 'success',
                  p_payment_reference: transaction.moolre_reference
                });

                if (balanceError) {
                  console.error('Error updating balance for Moolre transaction:', balanceError);
                  // Even if there's an error, continue - the balance might have been updated
                } else if (approvalResult && approvalResult.length > 0) {
                  const result = approvalResult[0];
                  console.log('Moolre transaction approved via atomic function:', {
                    transactionId: transaction.id,
                    success: result.success,
                    message: result.message,
                    oldBalance: result.old_balance,
                    newBalance: result.new_balance
                  });
                  
                  // Verify the function actually succeeded
                  if (!result.success) {
                    console.error('approve_deposit_transaction returned success=false:', result.message);
                    // The function failed - we should still try to update balance manually
                    // But for now, log it and let the already-approved check handle it
                  }
                } else {
                  console.warn('approve_deposit_transaction returned no result for Moolre transaction:', transaction.id);
                }
              } else if (transaction.status === 'approved') {
                // Transaction already approved - ensure balance was updated
                // This is a safety check in case balance wasn't updated when transaction was first approved
                console.log('Moolre transaction already approved, ensuring balance was updated...', transaction.id);
                
                // Get all approved deposits, orders, and refunds to calculate expected balance
                const { data: allDeposits } = await supabase
                  .from('transactions')
                  .select('amount, type, status')
                  .eq('user_id', transaction.user_id)
                  .eq('type', 'deposit')
                  .eq('status', 'approved');

                const { data: allOrders } = await supabase
                  .from('transactions')
                  .select('amount, type, status')
                  .eq('user_id', transaction.user_id)
                  .eq('type', 'order')
                  .eq('status', 'approved');

                const { data: allRefunds } = await supabase
                  .from('transactions')
                  .select('amount, type, status')
                  .eq('user_id', transaction.user_id)
                  .eq('type', 'refund')
                  .eq('status', 'approved');

                const { data: profile } = await supabase
                  .from('profiles')
                  .select('balance')
                  .eq('id', transaction.user_id)
                  .single();

                if (profile && allDeposits && allOrders) {
                  const totalDeposits = allDeposits.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
                  const totalOrders = allOrders.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
                  const totalRefunds = allRefunds ? allRefunds.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) : 0;
                  const expectedBalance = totalDeposits + totalRefunds - totalOrders;
                  const currentBalance = parseFloat(profile.balance || 0);
                  
                  // If balance is significantly different from expected, update it
                  // Use a tolerance to account for rounding errors
                  const tolerance = 0.01;
                  if (Math.abs(currentBalance - expectedBalance) > tolerance) {
                    console.warn('Balance mismatch detected for already-approved Moolre transaction:', {
                      transactionId: transaction.id,
                      currentBalance,
                      expectedBalance,
                      difference: expectedBalance - currentBalance,
                      totalDeposits,
                      totalOrders,
                      totalRefunds
                    });
                    
                    // Update balance to match expected (this fixes missing balance updates)
                    const { error: balanceUpdateError } = await supabase
                      .from('profiles')
                      .update({ balance: expectedBalance })
                      .eq('id', transaction.user_id);
                    
                    if (balanceUpdateError) {
                      console.error('Failed to update balance for already-approved transaction:', balanceUpdateError);
                    } else {
                      console.log('Balance corrected for already-approved Moolre transaction:', {
                        transactionId: transaction.id,
                        oldBalance: currentBalance,
                        newBalance: expectedBalance
                      });
                    }
                  } else {
                    console.log('Balance is correct for already-approved Moolre transaction:', {
                      transactionId: transaction.id,
                      currentBalance,
                      expectedBalance
                    });
                  }
                }
              }

              // Update Moolre-specific fields
              await supabase
                .from('transactions')
                .update({
                  moolre_status: 'success'
                })
                .eq('id', transaction.id);

              // Refetch transaction to get updated status
              const { data: updatedTransaction } = await supabase
                .from('transactions')
                .select('status, amount')
                .eq('id', transaction.id)
                .single();

              // Return updated status
              return res.status(200).json({
                status: updatedTransaction?.status || 'approved',
                amount: updatedTransaction?.amount || transaction.amount,
                transactionId: transaction.id
              });
            } else if (txstatus === 2) {
              // Payment failed
              // First attempt with pending check
              let { error: updateError } = await supabase
                .from('transactions')
                .update({
                  status: 'rejected',
                  moolre_status: 'failed'
                })
                .eq('id', transaction.id)
                .eq('status', 'pending');

              // If that fails, retry without pending check (only if still pending)
              if (updateError && (updateError.code === 'PGRST116' || updateError.message?.includes('No rows'))) {
                const { data: currentTx } = await supabase
                  .from('transactions')
                  .select('status')
                  .eq('id', transaction.id)
                  .single();
                
                if (currentTx?.status === 'pending') {
                  const { error: retryError } = await supabase
                    .from('transactions')
                    .update({
                      status: 'rejected',
                      moolre_status: 'failed'
                    })
                    .eq('id', transaction.id);
                  
                  if (!retryError) {
                    updateError = null;
                  }
                }
              }

              if (!updateError) {
                return res.status(200).json({
                  status: 'rejected',
                  amount: transaction.amount,
                  transactionId: transaction.id
                });
              }
            }
            // If txstatus === 0, still pending, continue with normal flow
          }
        }
      } catch (moolreError) {
        // Don't fail the request if Moolre verification fails
        console.warn('Error verifying Moolre payment:', moolreError);
      }
    }

    // Return minimal data for polling
    const response = {
      status: transaction.status,
      amount: transaction.amount,
      transactionId: transaction.id
    };

    // If transaction is approved, also return current balance
    if (transaction.status === 'approved' && transaction.user_id) {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', transaction.user_id)
          .single();

        if (!profileError && profile) {
          response.balance = parseFloat(profile.balance || 0);
        }
      } catch (balanceError) {
        // Don't fail the request if balance fetch fails
        console.warn('Could not fetch balance:', balanceError);
      }
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in check-transaction-status:', error);
    return res.status(500).json({ 
      error: 'Failed to check transaction status',
      message: error.message 
    });
  }
}
