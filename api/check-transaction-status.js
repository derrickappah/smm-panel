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
      .select('id, status, amount, user_id, type')
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
