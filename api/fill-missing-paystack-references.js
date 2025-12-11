/**
 * Fill Missing Paystack References Endpoint
 * 
 * This endpoint finds Paystack deposits without references and attempts to retrieve
 * them from Paystack API by matching transaction amounts, dates, and user emails.
 * 
 * Can be run manually or as a cron job to fill in missing references.
 * 
 * Environment Variables Required:
 * - PAYSTACK_SECRET_KEY: Your Paystack secret key
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
 * 
 * Usage:
 * POST /api/fill-missing-paystack-references
 * Query params: ?hours=48 (default: 48 hours to look back)
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST and GET requests
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ 
        error: 'Paystack secret key not configured' 
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ 
        error: 'Supabase credentials not configured' 
      });
    }

    // Optional: Check for authorization token
    const authToken = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    const expectedToken = process.env.CRON_SECRET_TOKEN;
    
    if (expectedToken && authToken !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get hours parameter (default: 48 hours)
    const hours = parseInt(req.query.hours || '48', 10);
    const timeWindow = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Initialize Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log(`[FILL-REFERENCES] Finding Paystack deposits without references from last ${hours} hours...`);

    // Find all Paystack deposits without references
    const { data: depositsWithoutRef, error: fetchError } = await supabase
      .from('transactions')
      .select('id, user_id, amount, created_at, deposit_method')
      .eq('type', 'deposit')
      .eq('deposit_method', 'paystack')
      .is('paystack_reference', null)
      .gte('created_at', timeWindow)
      .order('created_at', { ascending: false })
      .limit(100); // Limit to prevent timeout

    if (fetchError) {
      console.error('[FILL-REFERENCES] Error fetching deposits:', fetchError);
      return res.status(500).json({ 
        error: 'Failed to fetch deposits',
        details: fetchError.message 
      });
    }

    if (!depositsWithoutRef || depositsWithoutRef.length === 0) {
      return res.status(200).json({ 
        message: 'No Paystack deposits without references found',
        count: 0,
        filled: 0
      });
    }

    console.log(`[FILL-REFERENCES] Found ${depositsWithoutRef.length} deposits without references`);

    let filled = 0;
    let errors = [];
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const endDate = new Date();
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Query Paystack for all transactions in the time window
    console.log(`[FILL-REFERENCES] Querying Paystack transactions from ${startDateStr} to ${endDateStr}...`);
    
    let allPaystackTxs = [];
    let page = 1;
    let hasMore = true;
    const maxPages = 10; // Limit to prevent excessive API calls

    while (hasMore && page <= maxPages) {
      try {
        const paystackQueryUrl = `https://api.paystack.co/transaction?perPage=100&page=${page}&from=${startDateStr}&to=${endDateStr}`;
        const paystackResponse = await fetch(paystackQueryUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (paystackResponse.ok) {
          const paystackData = await paystackResponse.json();
          
          if (paystackData.status && paystackData.data) {
            allPaystackTxs.push(...paystackData.data);
            
            // Check if there are more pages
            hasMore = paystackData.meta && paystackData.meta.page < paystackData.meta.totalPages;
            page++;
            
            // Add delay to respect rate limits
            if (hasMore) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } else {
            hasMore = false;
          }
        } else {
          console.error(`[FILL-REFERENCES] Paystack API error (page ${page}):`, paystackResponse.status);
          hasMore = false;
        }
      } catch (queryError) {
        console.error(`[FILL-REFERENCES] Error querying Paystack (page ${page}):`, queryError);
        hasMore = false;
      }
    }

    console.log(`[FILL-REFERENCES] Retrieved ${allPaystackTxs.length} Paystack transactions`);

    // Match deposits to Paystack transactions
    for (const deposit of depositsWithoutRef) {
      try {
        // Get user email for matching
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', deposit.user_id)
          .single();

        const depositAmount = Math.round(deposit.amount * 100); // Convert to pesewas
        const depositTime = new Date(deposit.created_at);
        const timeWindow = 2 * 60 * 60 * 1000; // 2 hours

        // Find matching Paystack transaction
        const matchingTx = allPaystackTxs.find(tx => {
          const txAmount = tx.amount; // Already in pesewas
          const amountMatch = Math.abs(txAmount - depositAmount) < 10; // Allow small difference
          
          if (!amountMatch) return false;

          // Match by time (within 2 hours)
          const txTime = new Date(tx.created_at || tx.paid_at);
          const timeDiff = Math.abs(txTime - depositTime);
          if (timeDiff > timeWindow) return false;

          // Match by email if available
          if (userProfile?.email && tx.customer?.email) {
            return tx.customer.email.toLowerCase() === userProfile.email.toLowerCase();
          }

          // If no email match, still match by amount and time
          return true;
        });

        if (matchingTx && matchingTx.reference) {
          console.log(`[FILL-REFERENCES] Found match for deposit ${deposit.id}, storing reference: ${matchingTx.reference}`);
          
          // Store the reference
          const { error: updateError } = await supabase
            .from('transactions')
            .update({ paystack_reference: matchingTx.reference })
            .eq('id', deposit.id);

          if (updateError) {
            console.error(`[FILL-REFERENCES] Error storing reference for deposit ${deposit.id}:`, updateError);
            errors.push(`Failed to store reference for deposit ${deposit.id}: ${updateError.message}`);
          } else {
            filled++;
            console.log(`[FILL-REFERENCES] ✅ Reference stored for deposit ${deposit.id}`);
          }
        } else {
          console.log(`[FILL-REFERENCES] No matching Paystack transaction found for deposit ${deposit.id}`);
        }
      } catch (depositError) {
        console.error(`[FILL-REFERENCES] Error processing deposit ${deposit.id}:`, depositError);
        errors.push(`Error processing deposit ${deposit.id}: ${depositError.message}`);
      }
    }

    return res.status(200).json({
      message: 'Reference filling completed',
      total: depositsWithoutRef.length,
      filled,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('[FILL-REFERENCES] Error in fill-missing-paystack-references:', error);
    return res.status(500).json({ 
      error: 'Failed to fill missing references',
      message: error.message 
    });
  }
}


