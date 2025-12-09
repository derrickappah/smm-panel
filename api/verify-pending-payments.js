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

/**
 * Query Paystack transactions API for successful transactions within a date range
 * @param {string} secretKey - Paystack secret key
 * @param {Date} startDate - Start date for query
 * @param {Date} endDate - End date for query
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<Array>} Array of successful Paystack transactions
 */
async function queryPaystackTransactions(secretKey, startDate, endDate, maxRetries = 3) {
  const transactions = [];
  let page = 1;
  let hasMore = true;
  
  // Convert dates to Paystack format (YYYY-MM-DD)
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  console.log(`Querying Paystack transactions from ${startDateStr} to ${endDateStr}`);
  
  while (hasMore && page <= 100) { // Limit to 100 pages to prevent infinite loops
    let retries = 0;
    let success = false;
    let response = null;
    
    // Retry logic for API calls
    while (retries < maxRetries && !success) {
      try {
        const url = `https://api.paystack.co/transaction?perPage=100&page=${page}&status=success&from=${startDateStr}&to=${endDateStr}`;
        
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          success = true;
        } else if (response.status === 429) {
          // Rate limited - wait and retry
          const waitTime = Math.pow(2, retries) * 1000; // Exponential backoff
          console.log(`Rate limited, waiting ${waitTime}ms before retry ${retries + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
        } else {
          // Other error - don't retry
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          console.error(`Paystack API error (page ${page}):`, response.status, errorData.message);
          throw new Error(`Paystack API error: ${errorData.message || response.statusText}`);
        }
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          console.error(`Failed to query Paystack transactions after ${maxRetries} retries:`, error);
          throw error;
        }
        const waitTime = Math.pow(2, retries) * 1000;
        console.log(`Error querying Paystack, retrying in ${waitTime}ms (${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    if (!response || !response.ok) {
      break;
    }
    
    const data = await response.json();
    
    if (data.status && data.data) {
      // Filter for successful transactions only
      const successfulTxs = data.data.filter(tx => tx.status === 'success');
      transactions.push(...successfulTxs);
      
      // Check if there are more pages
      hasMore = data.meta && data.meta.page < data.meta.totalPages;
      page++;
      
      // Add small delay to respect rate limits
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } else {
      hasMore = false;
    }
  }
  
  console.log(`Found ${transactions.length} successful Paystack transactions`);
  return transactions;
}

/**
 * Match a Paystack transaction to a pending database transaction
 * @param {Object} paystackTx - Paystack transaction object
 * @param {Array} pendingTransactions - Array of pending database transactions
 * @returns {Object|null} Matched transaction or null
 */
function matchPaystackToPending(paystackTx, pendingTransactions) {
  const paystackAmount = paystackTx.amount / 100; // Convert from pesewas to cedis
  const paystackTime = new Date(paystackTx.created_at || paystackTx.paid_at);
  const paystackEmail = paystackTx.customer?.email || paystackTx.metadata?.user_email;
  const paystackUserId = paystackTx.metadata?.user_id;
  
  // Time window for matching (2 hours)
  const timeWindow = 2 * 60 * 60 * 1000;
  
  // Find best match
  let bestMatch = null;
  let bestScore = 0;
  
  for (const pendingTx of pendingTransactions) {
    // Skip if already has a reference (should be verified by reference)
    if (pendingTx.paystack_reference) {
      continue;
    }
    
    // Skip if not a Paystack deposit
    if (pendingTx.deposit_method !== 'paystack') {
      continue;
    }
    
    let score = 0;
    
    // Amount match (exact match = 100 points)
    const amountDiff = Math.abs(pendingTx.amount - paystackAmount);
    if (amountDiff < 0.01) { // Allow small floating point differences
      score += 100;
    } else {
      continue; // Amount must match exactly
    }
    
    // Time proximity match (closer = more points, max 50 points)
    const pendingTime = new Date(pendingTx.created_at);
    const timeDiff = Math.abs(paystackTime - pendingTime);
    if (timeDiff <= timeWindow) {
      score += Math.max(0, 50 - (timeDiff / timeWindow) * 50);
    } else {
      continue; // Must be within time window
    }
    
    // User match (if available, 30 points)
    if (paystackUserId && pendingTx.user_id === paystackUserId) {
      score += 30;
    } else if (paystackEmail) {
      // Try to match by email if we have user data
      // This would require fetching user email from profiles table
      // For now, we'll skip this to avoid extra queries
    }
    
    // Check if this is a better match
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pendingTx;
    }
  }
  
  // Only return match if score is high enough (at least amount + time match)
  if (bestMatch && bestScore >= 100) {
    return bestMatch;
  }
  
  return null;
}

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
    let matchedFromPaystack = 0;
    const unmatchedPaystackTxs = [];

    // Separate transactions with and without references
    const transactionsWithRef = pendingTransactions.filter(tx => 
      tx.paystack_reference && tx.deposit_method === 'paystack'
    );
    const transactionsWithoutRef = pendingTransactions.filter(tx => 
      !tx.paystack_reference && tx.deposit_method === 'paystack'
    );

    console.log(`Transactions with reference: ${transactionsWithRef.length}`);
    console.log(`Transactions without reference: ${transactionsWithoutRef.length}`);

    // If we have transactions without references, query Paystack to find matches
    if (transactionsWithoutRef.length > 0) {
      try {
        const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
        const endDate = new Date();
        
        console.log('Querying Paystack for successful transactions to match...');
        const paystackTransactions = await queryPaystackTransactions(
          PAYSTACK_SECRET_KEY,
          startDate,
          endDate
        );

        // Match Paystack transactions to pending transactions
        for (const paystackTx of paystackTransactions) {
          const matchedTx = matchPaystackToPending(paystackTx, transactionsWithoutRef);
          
          if (matchedTx) {
            console.log(`Matched Paystack transaction ${paystackTx.reference} to pending transaction ${matchedTx.id}`);
            
            try {
              // Update transaction with reference and approve
              const { error: updateError } = await supabase
                .from('transactions')
                .update({
                  status: 'approved',
                  paystack_status: 'success',
                  paystack_reference: paystackTx.reference
                })
                .eq('id', matchedTx.id)
                .eq('status', 'pending');

              if (!updateError) {
                // Update user balance
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('balance')
                  .eq('id', matchedTx.user_id)
                  .single();

                if (profile) {
                  const newBalance = (profile.balance || 0) + matchedTx.amount;
                  await supabase
                    .from('profiles')
                    .update({ balance: newBalance })
                    .eq('id', matchedTx.user_id);
                }

                updated++;
                matchedFromPaystack++;
                verified++;
                console.log(`Transaction ${matchedTx.id} matched and approved from Paystack query`);
                
                // Remove from transactionsWithoutRef to avoid duplicate matches
                const index = transactionsWithoutRef.findIndex(tx => tx.id === matchedTx.id);
                if (index > -1) {
                  transactionsWithoutRef.splice(index, 1);
                }
              } else {
                errors.push(`Failed to update matched transaction ${matchedTx.id}: ${updateError.message}`);
              }
            } catch (matchError) {
              console.error(`Error processing matched transaction ${matchedTx.id}:`, matchError);
              errors.push(`Error processing matched transaction ${matchedTx.id}: ${matchError.message}`);
            }
          } else {
            // Track unmatched Paystack transactions for manual review
            unmatchedPaystackTxs.push({
              reference: paystackTx.reference,
              amount: paystackTx.amount / 100,
              created_at: paystackTx.created_at || paystackTx.paid_at,
              customer_email: paystackTx.customer?.email
            });
          }
        }

        if (unmatchedPaystackTxs.length > 0) {
          console.log(`Found ${unmatchedPaystackTxs.length} successful Paystack transactions that couldn't be matched to pending transactions`);
        }
      } catch (queryError) {
        console.error('Error querying Paystack transactions:', queryError);
        errors.push(`Error querying Paystack: ${queryError.message}`);
        // Continue with normal verification even if query fails
      }
    }

    // Verify each pending transaction (those with references and any remaining without)
    const transactionsToVerify = [...transactionsWithRef, ...transactionsWithoutRef];
    
    for (const transaction of transactionsToVerify) {
      try {
        const transactionAge = Date.now() - new Date(transaction.created_at).getTime();
        const thirtyMinutes = 30 * 60 * 1000;
        const oneHour = 60 * 60 * 1000;

        // Verify Paystack transactions
        if (transaction.paystack_reference && transaction.deposit_method === 'paystack') {
          let verifyResponse = null;
          let verifyData = null;
          let verifySuccess = false;
          const maxRetries = 3;
          
          // Retry logic for verification
          try {
            for (let retry = 0; retry < maxRetries && !verifySuccess; retry++) {
              try {
                verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${transaction.paystack_reference}`, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                  }
                });

                if (verifyResponse.ok) {
                  verifyData = await verifyResponse.json();
                  verifySuccess = true;
                } else if (verifyResponse.status === 429 && retry < maxRetries - 1) {
                  // Rate limited - wait and retry
                  const waitTime = Math.pow(2, retry) * 1000;
                  console.log(`Rate limited for transaction ${transaction.id}, waiting ${waitTime}ms before retry ${retry + 1}/${maxRetries}`);
                  await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                  // Other error - break retry loop
                  break;
                }
              } catch (fetchError) {
                if (retry < maxRetries - 1) {
                  const waitTime = Math.pow(2, retry) * 1000;
                  console.log(`Error verifying transaction ${transaction.id}, retrying in ${waitTime}ms (${retry + 1}/${maxRetries}):`, fetchError.message);
                  await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                  throw fetchError;
                }
              }
            }

            if (verifySuccess && verifyResponse && verifyResponse.ok) {
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
        } else if (transaction.deposit_method === 'paystack') {
          // Paystack transaction without reference - we already tried to match it above
          // Only mark as rejected if it's very old (24 hours) and still no reference
          const oneDay = 24 * 60 * 60 * 1000;
          if (transactionAge > oneDay) {
            await supabase
              .from('transactions')
              .update({ 
                status: 'rejected',
                paystack_status: 'no_reference'
              })
              .eq('id', transaction.id)
              .eq('status', 'pending');
            
            updated++;
            console.log(`Transaction ${transaction.id} marked as rejected (no reference after 24 hours)`);
          } else {
            console.log(`Transaction ${transaction.id} still pending without reference (age: ${Math.round(transactionAge / 60000)} minutes)`);
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
      matchedFromPaystack,
      unmatchedPaystackTransactions: unmatchedPaystackTxs.length > 0 ? unmatchedPaystackTxs.slice(0, 10) : undefined, // Limit to first 10 for response size
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

