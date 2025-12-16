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
      .select('id, status, amount, user_id, type, deposit_method, moolre_reference, moolre_status')
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

    // If transaction is Moolre and still pending, verify with Moolre API
    if (transaction.deposit_method === 'moolre' && 
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
              // Payment successful - update transaction status and balance
              // First update transaction status
              const { error: updateError } = await supabase
                .from('transactions')
                .update({
                  status: 'approved',
                  moolre_status: 'success'
                })
                .eq('id', transaction.id)
                .eq('status', 'pending');

              if (!updateError) {
                // Update user balance using atomic function
                // The function signature: approve_deposit_transaction(p_transaction_id UUID, p_paystack_status TEXT DEFAULT NULL, p_paystack_reference TEXT DEFAULT NULL)
                const { error: balanceError } = await supabase.rpc('approve_deposit_transaction', {
                  p_transaction_id: transaction.id,
                  p_paystack_status: null,
                  p_paystack_reference: null
                });

                if (balanceError) {
                  console.error('Error updating balance for Moolre transaction:', balanceError);
                }

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
              }
            } else if (txstatus === 2) {
              // Payment failed
              const { error: updateError } = await supabase
                .from('transactions')
                .update({
                  status: 'rejected',
                  moolre_status: 'failed'
                })
                .eq('id', transaction.id)
                .eq('status', 'pending');

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
