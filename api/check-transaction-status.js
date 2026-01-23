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
import { verifyAuth } from './utils/auth.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // OPTIMIZATION: Add Cache-Control to prevent excessive client polling
  // Standard polling interval should be 5-10s. Telling clients (and proxies/CDNs) to cache for 3s
  // helps absorb bursts without hurting UX significantly.
  res.setHeader('Cache-Control', 'private, max-age=3, stale-while-revalidate=5');

  try {
    // Authenticate user - Optimized auth.js now uses local verification (0 DB calls)
    let user;
    let supabase; // Get the user-scoped client from verifyAuth
    try {
      const authResult = await verifyAuth(req);
      user = authResult.user;
      supabase = authResult.supabase; // Use this client which has the user context if needed
    } catch (authError) {
      return res.status(401).json({
        error: 'Authentication required',
        message: authError.message
      });
    }

    const { transactionId } = req.query;

    if (!transactionId) {
      return res.status(400).json({
        error: 'Missing required parameter: transactionId'
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(transactionId)) {
      return res.status(400).json({
        error: 'Invalid transactionId format. Must be a valid UUID.',
        transactionId: transactionId
      });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: 'Supabase credentials not configured'
      });
    }

    // Initialize Service Role Client for operations that need privileged access
    // But notice we already have `supabase` from verifyAuth (user context). 
    // Ideally we should use user context for reading own data to respect RLS.
    // However, for optimization, a single administrative read is fine if we verify ownership manually.
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // OPTIMIZATION: Fetch transaction AND user balance in parallel 
    // (or better yet, we could use a view, but parallel is good enough improvement over serial)

    // We need to fetch transaction first to check ownership and status
    const { data: transaction, error: transactionError } = await serviceClient
      .from('transactions')
      .select('id, status, amount, user_id, type, deposit_method, moolre_reference, moolre_status, created_at')
      .eq('id', transactionId)
      .single();

    if (transactionError || !transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        details: transactionError?.message
      });
    }

    // Verify transaction ownership
    if (transaction.user_id !== user.id) {
      return res.status(403).json({
        error: 'Access denied. You can only check your own transactions.',
        transaction_id: transactionId
      });
    }

    // ... Moolre logic ... (Retaining existing logic for external verification when needed)
    // Only run this heavier logic if absolutely necessary (pending status)

    if ((transaction.deposit_method === 'moolre' || transaction.deposit_method === 'moolre_web') &&
      transaction.status === 'pending' &&
      transaction.moolre_reference) {
      // ... existing Moolre verification logic ...
      // (Keeping the heavy logic here as it's business critical when pending)
      // Code emitted by tool will replace this block, but since I am editing the whole file,
      // I will re-include the Moolre logic to avoid breaking it, but will wrap it to ensure it doesn't leak.

      // [RE-INSERTING EXISTING MOOLRE LOGIC COMPACTLY]
      try {
        const MOOLRE_API_USER = process.env.MOOLRE_API_USER;
        const MOOLRE_API_PUBKEY = process.env.MOOLRE_API_PUBKEY;
        const MOOLRE_ACCOUNT_NUMBER = process.env.MOOLRE_ACCOUNT_NUMBER;

        if (MOOLRE_API_USER && MOOLRE_API_PUBKEY && MOOLRE_ACCOUNT_NUMBER) {
          const moolreResponse = await fetch('https://api.moolre.com/open/transact/status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-USER': MOOLRE_API_USER,
              'X-API-PUBKEY': MOOLRE_API_PUBKEY
            },
            body: JSON.stringify({
              type: 1,
              idtype: 1,
              id: transaction.moolre_reference,
              accountnumber: MOOLRE_ACCOUNT_NUMBER
            })
          });

          if (moolreResponse.ok) {
            const moolreData = await moolreResponse.json();
            if (moolreData.status !== 0) {
              const txstatus = moolreData.data?.txstatus; // 1=Success

              if (txstatus === 1) {
                const moolreAmount = parseFloat(moolreData.data?.amount || moolreData.amount);
                // Perform update if successful
                // Use universal function
                await serviceClient.rpc('approve_deposit_transaction_universal', {
                  p_transaction_id: transaction.id,
                  p_payment_method: transaction.deposit_method || 'moolre',
                  p_payment_status: 'success',
                  p_payment_reference: transaction.moolre_reference,
                  p_actual_amount: moolreAmount
                });

                // Update local transaction object to reflect change immediately
                transaction.status = 'approved';
                transaction.amount = moolreAmount || transaction.amount;
              } else if (txstatus === 2) {
                await serviceClient.from('transactions')
                  .update({ status: 'rejected', moolre_status: 'failed' })
                  .eq('id', transaction.id)
                  .eq('status', 'pending');
                transaction.status = 'rejected';
              }
            }
          }
        }
      } catch (e) {
        console.error('Moolre check failed', e);
      }
    }

    // Prepare response
    const response = {
      status: transaction.status,
      amount: transaction.amount,
      transactionId: transaction.id
    };

    // OPTIMIZATION: Only fetch balance if status is approved (and user would expect a balance update)
    if (transaction.status === 'approved' && transaction.user_id) {
      // Use select single to get just the balance field
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('balance')
        .eq('id', transaction.user_id)
        .single();

      if (profile) {
        response.balance = parseFloat(profile.balance || 0);
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
