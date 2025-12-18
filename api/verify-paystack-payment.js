/**
 * Vercel Serverless Function to verify Paystack payment status
 * 
 * SECURITY: Requires authentication. Users can only verify their own transactions.
 * 
 * This uses the Paystack secret key to verify payment status and ensures
 * users can only access their own transaction data.
 * 
 * Environment Variables Required:
 * - PAYSTACK_SECRET_KEY: Your Paystack secret key
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
 * - SUPABASE_ANON_KEY: Your Supabase anon key (for JWT verification)
 * 
 * Request Body:
 * {
 *   "reference": "paystack-reference"
 * }
 * 
 * Headers:
 * - Authorization: Bearer <supabase_jwt_token>
 */

import { verifyAuth, getServiceRoleClient } from './utils/auth.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const { user, supabase: userSupabase } = await verifyAuth(req);

    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ 
        error: 'Missing required field: reference' 
      });
    }

    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ 
        error: 'Paystack secret key not configured. Set PAYSTACK_SECRET_KEY in Vercel environment variables.' 
      });
    }

    // Verify payment with Paystack API
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return res.status(response.status).json({ 
        error: errorData.message || errorData.error || 'Failed to verify payment' 
      });
    }

    const data = await response.json();
    
    // Check if payment was successful
    const isSuccessful = data.status && data.data && data.data.status === 'success';
    const amount = data.data?.amount ? data.data.amount / 100 : null; // Convert from pesewas to cedis
    const metadata = data.data?.metadata || {};
    const transactionId = metadata.transaction_id || null;

    // Verify transaction ownership if transaction_id is in metadata
    if (transactionId) {
      const supabase = getServiceRoleClient();
      
      // Get transaction to check ownership
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('user_id, type, deposit_method')
        .eq('id', transactionId)
        .single();

      if (!txError && transaction) {
        // Get user profile to check if admin
        const { data: profile } = await userSupabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        const isAdmin = profile?.role === 'admin';

        // Check ownership or admin
        if (!isAdmin && transaction.user_id !== user.id) {
          return res.status(403).json({
            error: 'Access denied: You can only verify your own transactions'
          });
        }
      }
    } else {
      // If no transaction_id in metadata, try to find transaction by reference
      const supabase = getServiceRoleClient();
      const { data: transaction } = await supabase
        .from('transactions')
        .select('user_id')
        .eq('paystack_reference', reference)
        .maybeSingle();

      if (transaction) {
        // Get user profile to check if admin
        const { data: profile } = await userSupabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        const isAdmin = profile?.role === 'admin';

        // Check ownership or admin
        if (!isAdmin && transaction.user_id !== user.id) {
          return res.status(403).json({
            error: 'Access denied: You can only verify your own transactions'
          });
        }
      }
    }
    
    return res.status(200).json({
      success: isSuccessful,
      status: data.data?.status || 'unknown',
      amount: amount,
      reference: data.data?.reference || reference,
      paid_at: data.data?.paid_at || null,
      customer: data.data?.customer || null,
      metadata: metadata,
      transaction_id: transactionId
    });
  } catch (error) {
    // Handle authentication errors
    if (error.message === 'Missing or invalid authorization header' ||
        error.message === 'Missing authentication token' ||
        error.message === 'Invalid or expired token') {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }

    console.error('Paystack verification error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to verify payment' 
    });
  }
}

