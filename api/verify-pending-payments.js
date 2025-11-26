/**
 * Server-Side Pending Payments Verification Endpoint
 * 
 * This endpoint can be called by a cron job or scheduled task to verify all pending payments
 * server-side, independent of user activity. This ensures payments are verified even if users
 * don't visit the Dashboard.
 * 
 * Environment Variables Required:
 * - PAYSTACK_SECRET_KEY: Your Paystack secret key
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (for server-side operations)
 * 
 * Usage:
 * - Set up a cron job (e.g., using Vercel Cron, GitHub Actions, or external service)
 * - Call this endpoint every 5-15 minutes: POST /api/verify-pending-payments
 * - Optionally pass ?hours=24 to check transactions from last N hours (default: 48)
 * 
 * Example cron job (Vercel):
 * - Create vercel.json with cron configuration
 * - Or use external service like EasyCron, Cron-job.org
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

    // Optional: Check for authorization token to prevent unauthorized access
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

    console.log(`Verifying pending payments from last ${hours} hours...`);

    // Find all pending deposit transactions within the time window
    const { data: pendingTransactions, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('type', 'deposit')
      .eq('status', 'pending')
      .gte('created_at', timeWindow)
      .order('created_at', { ascending: false })
      .limit(100); // Limit to prevent timeout

    if (fetchError) {
      console.error('Error fetching pending transactions:', fetchError);
      return res.status(500).json({ 
        error: 'Failed to fetch pending transactions',
        details: fetchError.message 
      });
    }

    if (!pendingTransactions || pendingTransactions.length === 0) {
      return res.status(200).json({ 
        message: 'No pending transactions found',
        count: 0,
        verified: 0,
        updated: 0
      });
    }

    console.log(`Found ${pendingTransactions.length} pending transactions to verify`);

    let verified = 0;
    let updated = 0;
    let errors = [];

    // Verify each pending transaction
    for (const transaction of pendingTransactions) {
      try {
        const transactionAge = Date.now() - new Date(transaction.created_at).getTime();
        const thirtyMinutes = 30 * 60 * 1000;
        const oneHour = 60 * 60 * 1000;

        // Verify Paystack transactions
        if (transaction.paystack_reference && transaction.deposit_method === 'paystack') {
          try {
            const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${transaction.paystack_reference}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
              }
            });

            if (verifyResponse.ok) {
              const verifyData = await verifyResponse.json();
              const paymentStatus = verifyData.data?.status;

              if (paymentStatus === 'success') {
                // Payment was successful, update transaction
                const { error: updateError } = await supabase
                  .from('transactions')
                  .update({ 
                    status: 'approved',
                    paystack_status: 'success',
                    paystack_reference: transaction.paystack_reference
                  })
                  .eq('id', transaction.id)
                  .eq('status', 'pending');

                if (!updateError) {
                  // Update user balance
                  const { data: profile } = await supabase
                    .from('profiles')
                    .select('balance')
                    .eq('id', transaction.user_id)
                    .single();

                  if (profile) {
                    const newBalance = (profile.balance || 0) + transaction.amount;
                    await supabase
                      .from('profiles')
                      .update({ balance: newBalance })
                      .eq('id', transaction.user_id);
                  }

                  updated++;
                  console.log(`Transaction ${transaction.id} updated to approved`);
                } else {
                  errors.push(`Failed to update transaction ${transaction.id}: ${updateError.message}`);
                }
              } else if (paymentStatus === 'failed' || paymentStatus === 'abandoned') {
                // Payment failed, mark as rejected
                await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    paystack_status: paymentStatus
                  })
                  .eq('id', transaction.id)
                  .eq('status', 'pending');
                
                updated++;
                console.log(`Transaction ${transaction.id} marked as rejected`);
              } else if (transactionAge > oneHour && paymentStatus !== 'success') {
                // Transaction is old and still not successful, mark as rejected
                await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    paystack_status: 'timeout'
                  })
                  .eq('id', transaction.id)
                  .eq('status', 'pending');
                
                updated++;
                console.log(`Transaction ${transaction.id} timed out and marked as rejected`);
              } else {
                // Still pending, just update status
                await supabase
                  .from('transactions')
                  .update({ 
                    paystack_status: paymentStatus
                  })
                  .eq('id', transaction.id);
              }

              verified++;
            } else {
              // Verification request failed
              if (transactionAge > oneHour) {
                await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    paystack_status: 'verification_failed'
                  })
                  .eq('id', transaction.id)
                  .eq('status', 'pending');
                
                updated++;
              }
              errors.push(`Verification failed for transaction ${transaction.id}`);
            }
          } catch (verifyError) {
            console.error(`Error verifying transaction ${transaction.id}:`, verifyError);
            if (transactionAge > oneHour) {
              await supabase
                .from('transactions')
                .update({ 
                  status: 'rejected',
                  paystack_status: 'verification_error'
                })
                .eq('id', transaction.id)
                .eq('status', 'pending');
              
              updated++;
            }
            errors.push(`Error verifying transaction ${transaction.id}: ${verifyError.message}`);
          }
        } else {
          // No reference stored - mark as rejected if old enough
          if (transactionAge > thirtyMinutes) {
            await supabase
              .from('transactions')
              .update({ 
                status: 'rejected',
                paystack_status: 'no_reference'
              })
              .eq('id', transaction.id)
              .eq('status', 'pending');
            
            updated++;
            console.log(`Transaction ${transaction.id} marked as rejected (no reference)`);
          }
        }
      } catch (error) {
        console.error(`Error processing transaction ${transaction.id}:`, error);
        errors.push(`Error processing transaction ${transaction.id}: ${error.message}`);
      }
    }

    return res.status(200).json({
      message: 'Verification completed',
      count: pendingTransactions.length,
      verified,
      updated,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in verify-pending-payments:', error);
    return res.status(500).json({ 
      error: 'Failed to verify pending payments',
      message: error.message 
    });
  }
}

