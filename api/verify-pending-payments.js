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

    const startTime = Date.now();
    const sessionMetrics = {
      startTime: new Date().toISOString(),
      hours: hours,
      totalTransactions: 0,
      verified: 0,
      updated: 0,
      matchedFromPaystack: 0,
      moolreWebProcessed: 0,
      errors: [],
      transactionMetrics: []
    };

    console.log(`[VERIFY] Verifying pending payments from last ${hours} hours...`);

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
      console.error('[VERIFY] Error fetching pending transactions:', fetchError);
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
        updated: 0,
        metrics: sessionMetrics
      });
    }

    sessionMetrics.totalTransactions = pendingTransactions.length;
    console.log(`[VERIFY] Found ${pendingTransactions.length} pending transactions to verify`);

    let verified = 0;
    let updated = 0;
    let errors = [];
    let matchedFromPaystack = 0;
    let moolreWebProcessed = 0;
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
              // Use atomic database function to approve transaction and update balance
              // This prevents race conditions and ensures consistency
              let approvalSuccess = false;
              let approvalError = null;
              const maxRetries = 3;

              for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                  const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction', {
                    p_transaction_id: matchedTx.id,
                    p_paystack_status: 'success',
                    p_paystack_reference: paystackTx.reference
                  });

                  if (rpcError) {
                    approvalError = rpcError;
                    if (attempt < maxRetries) {
                      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                      continue;
                    }
                    break;
                  }

                  const approvalResult = result && result.length > 0 ? result[0] : null;

                  if (!approvalResult) {
                    approvalError = new Error('Database function returned no result');
                    if (attempt < maxRetries) {
                      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                      continue;
                    }
                    break;
                  }

                  if (approvalResult.success) {
                    approvalSuccess = true;
                    console.log(`Transaction ${matchedTx.id} matched and approved from Paystack query (attempt ${attempt})`);
                    break;
                  } else {
                    // Check if already approved (idempotent)
                    if (approvalResult.message && approvalResult.message.includes('already approved')) {
                      approvalSuccess = true;
                      console.log(`Transaction ${matchedTx.id} already approved (attempt ${attempt})`);
                      break;
                    } else {
                      approvalError = new Error(approvalResult.message);
                      if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        continue;
                      }
                    }
                  }
                } catch (retryError) {
                  approvalError = retryError;
                  if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                  }
                }
              }

              if (approvalSuccess) {
                updated++;
                matchedFromPaystack++;
                verified++;
                
                // Remove from transactionsWithoutRef to avoid duplicate matches
                const index = transactionsWithoutRef.findIndex(tx => tx.id === matchedTx.id);
                if (index > -1) {
                  transactionsWithoutRef.splice(index, 1);
                }
              } else {
                const errorMsg = `Matched transaction ${matchedTx.id}: approval failed - ${approvalError?.message || 'Unknown error'}`;
                errors.push(errorMsg);
                console.error('CRITICAL:', errorMsg, {
                  error: approvalError
                });
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

        // CRITICAL: If transaction is missing reference, try to retrieve it from Paystack
        if (!transaction.paystack_reference && transaction.deposit_method === 'paystack') {
          console.log(`[VERIFY] Transaction ${transaction.id} missing reference, attempting to retrieve from Paystack...`);
          
          try {
            // Query Paystack transactions API to find matching transaction
            const startDate = new Date(new Date(transaction.created_at).getTime() - 2 * 60 * 60 * 1000); // 2 hours before
            const endDate = new Date(new Date(transaction.created_at).getTime() + 2 * 60 * 60 * 1000); // 2 hours after
            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];
            
            const paystackAmount = Math.round(transaction.amount * 100); // Convert to pesewas
            
            // Query Paystack for transactions in this time window with matching amount
            const paystackQueryUrl = `https://api.paystack.co/transaction?perPage=50&page=1&from=${startDateStr}&to=${endDateStr}`;
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
                // Find matching transaction by amount and user email
                const { data: userProfile } = await supabase
                  .from('profiles')
                  .select('email')
                  .eq('id', transaction.user_id)
                  .single();

                const matchingTx = paystackData.data.find(tx => {
                  const txAmount = tx.amount; // Already in pesewas
                  const amountMatch = Math.abs(txAmount - paystackAmount) < 10; // Allow small difference
                  
                  // Try to match by email if available
                  if (userProfile?.email && tx.customer?.email) {
                    return amountMatch && tx.customer.email.toLowerCase() === userProfile.email.toLowerCase();
                  }
                  
                  return amountMatch;
                });

                if (matchingTx && matchingTx.reference) {
                  console.log(`[VERIFY] Found matching Paystack transaction, storing reference: ${matchingTx.reference}`);
                  
                  // Store the reference
                  await supabase
                    .from('transactions')
                    .update({ paystack_reference: matchingTx.reference })
                    .eq('id', transaction.id);
                  
                  transaction.paystack_reference = matchingTx.reference;
                } else {
                  console.log(`[VERIFY] No matching Paystack transaction found for transaction ${transaction.id}`);
                }
              }
            }
          } catch (refRetrievalError) {
            console.error(`[VERIFY] Error retrieving reference for transaction ${transaction.id}:`, refRetrievalError);
            // Continue with verification even if reference retrieval fails
          }
        }

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
                // Payment was successful, update transaction with retry logic
                const updateData = {
                  status: 'approved',
                  paystack_status: 'success',
                  paystack_reference: transaction.paystack_reference || undefined
                };
                
                // Ensure reference is included if we have it
                if (transaction.paystack_reference) {
                  updateData.paystack_reference = transaction.paystack_reference;
                }

                let statusUpdated = false;
                let statusUpdateError = null;
                const maxRetries = 3;

                // Try updating status with retry logic - make it flexible like reject
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                  try {
                    // Strategy: Try without status condition first (like reject does)
                    let updateQuery = supabase
                      .from('transactions')
                      .update(updateData)
                      .eq('id', transaction.id);

                    // Only add pending condition on first attempt if we know it's pending
                    if (attempt === 1 && transaction.status === 'pending') {
                      updateQuery = updateQuery.eq('status', 'pending');
                    }
                    // Subsequent attempts: always try without pending condition

                    const { data: updatedData, error: updateError } = await updateQuery.select();

                    if (updateError) {
                      if (updateError.code === 'PGRST116' || updateError.message?.includes('No rows')) {
                        // Check if already approved
                        const { data: currentTx } = await supabase
                          .from('transactions')
                          .select('status')
                          .eq('id', transaction.id)
                          .single();
                        
                        if (currentTx?.status === 'approved') {
                          console.log(`[VERIFY] Transaction ${transaction.id} already approved, proceeding with balance check`);
                          statusUpdated = true;
                          break;
                        }
                        
                        if (attempt < maxRetries) {
                          console.log(`[VERIFY] Attempt ${attempt} failed (status: ${currentTx?.status}), retrying without pending condition...`);
                          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                          continue;
                        }
                      } else {
                        statusUpdateError = updateError;
                        if (attempt < maxRetries) {
                          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                          continue;
                        }
                      }
                    } else if (updatedData && updatedData.length > 0) {
                      // Verify the status actually changed to approved
                      const updatedStatus = updatedData[0]?.status;
                      if (updatedStatus === 'approved') {
                        statusUpdated = true;
                        console.log(`[VERIFY] Transaction ${transaction.id} updated to approved (attempt ${attempt})`);
                        break;
                      } else {
                        console.warn(`[VERIFY] Update returned but status is ${updatedStatus}, retrying...`);
                        if (attempt < maxRetries) {
                          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                          continue;
                        }
                      }
                    } else {
                      // No data returned - verify current status
                      const { data: currentTx } = await supabase
                        .from('transactions')
                        .select('status')
                        .eq('id', transaction.id)
                        .single();

                      if (currentTx?.status === 'approved') {
                        statusUpdated = true;
                        console.log(`[VERIFY] Transaction ${transaction.id} verified as approved (attempt ${attempt})`);
                        break;
                      } else {
                        console.warn(`[VERIFY] Update returned no data, current status: ${currentTx?.status}, retrying...`);
                        if (attempt < maxRetries) {
                          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                          continue;
                        }
                      }
                    }
                  } catch (retryError) {
                    statusUpdateError = retryError;
                    if (attempt < maxRetries) {
                      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                  }
                }

                // Final verification if status update didn't succeed
                if (!statusUpdated) {
                  console.warn(`[VERIFY] Status not updated after retries for transaction ${transaction.id}, attempting final update...`);
                  const { data: finalUpdate, error: finalError } = await supabase
                    .from('transactions')
                    .update(updateData)
                    .eq('id', transaction.id)
                    .select('status');

                  if (!finalError && finalUpdate && finalUpdate.length > 0 && finalUpdate[0]?.status === 'approved') {
                    statusUpdated = true;
                    console.log(`[VERIFY] Final status update succeeded for transaction ${transaction.id}`);
                  } else {
                    // Final check
                    const { data: finalCheck } = await supabase
                      .from('transactions')
                      .select('status')
                      .eq('id', transaction.id)
                      .single();

                    if (finalCheck?.status === 'approved') {
                      statusUpdated = true;
                      console.log(`[VERIFY] Transaction ${transaction.id} verified as approved in final check`);
                    }
                  }
                }

                // Use atomic database function to approve transaction and update balance
                // This replaces the separate status and balance updates to prevent race conditions
                let approvalSuccess = false;
                let approvalError = null;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                  try {
                    const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction', {
                      p_transaction_id: transaction.id,
                      p_paystack_status: 'success',
                      p_paystack_reference: transaction.paystack_reference || undefined
                    });

                    if (rpcError) {
                      approvalError = rpcError;
                      if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        continue;
                      }
                      break;
                    }

                    const approvalResult = result && result.length > 0 ? result[0] : null;

                    if (!approvalResult) {
                      approvalError = new Error('Database function returned no result');
                      if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        continue;
                      }
                      break;
                    }

                    if (approvalResult.success) {
                      approvalSuccess = true;
                      statusUpdated = true; // Atomic function handles both status and balance
                      balanceUpdated = true;
                      console.log(`[VERIFY] Transaction ${transaction.id} successfully approved with balance (attempt ${attempt})`);
                      break;
                    } else {
                      // Check if already approved (idempotent)
                      if (approvalResult.message && approvalResult.message.includes('already approved')) {
                        approvalSuccess = true;
                        statusUpdated = true;
                        balanceUpdated = true;
                        console.log(`[VERIFY] Transaction ${transaction.id} already approved (attempt ${attempt})`);
                        break;
                      } else {
                        approvalError = new Error(approvalResult.message);
                        if (attempt < maxRetries) {
                          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                          continue;
                        }
                      }
                    }
                  } catch (retryError) {
                    approvalError = retryError;
                    if (attempt < maxRetries) {
                      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                  }
                }

                // Log results with metrics
                const txMetrics = {
                  transactionId: transaction.id,
                  approvalAttempts: maxRetries,
                  approvalSuccess: approvalSuccess,
                  error: approvalError?.message
                };
                sessionMetrics.transactionMetrics.push(txMetrics);

                if (approvalSuccess) {
                  updated++;
                  console.log(`[VERIFY] Transaction ${transaction.id} successfully updated to approved with balance`);
                } else {
                  const errorMsg = `Transaction ${transaction.id}: approval failed - ${approvalError?.message || 'Unknown error'}`;
                  errors.push(errorMsg);
                  console.error('[VERIFY] CRITICAL:', errorMsg, {
                    error: approvalError,
                    metrics: txMetrics
                  });
                }
              } else if (paymentStatus === 'failed' || paymentStatus === 'abandoned') {
                // Payment failed, mark as rejected
                // First attempt with pending check
                let { error: updateError } = await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    paystack_status: paymentStatus
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
                    await supabase
                      .from('transactions')
                      .update({ 
                        status: 'rejected',
                        paystack_status: paymentStatus
                      })
                      .eq('id', transaction.id);
                  }
                }
                
                updated++;
                console.log(`Transaction ${transaction.id} marked as rejected`);
              } else if (transactionAge > oneHour && paymentStatus !== 'success') {
                // Transaction is old and still not successful, mark as rejected
                // First attempt with pending check
                let { error: updateError } = await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    paystack_status: 'timeout'
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
                    await supabase
                      .from('transactions')
                      .update({ 
                        status: 'rejected',
                        paystack_status: 'timeout'
                      })
                      .eq('id', transaction.id);
                  }
                }
                
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
                // First attempt with pending check
                let { error: updateError } = await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    paystack_status: 'verification_failed'
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
                    await supabase
                      .from('transactions')
                      .update({ 
                        status: 'rejected',
                        paystack_status: 'verification_failed'
                      })
                      .eq('id', transaction.id);
                  }
                }
                
                updated++;
              }
              errors.push(`Verification failed for transaction ${transaction.id}`);
            }
          } catch (verifyError) {
            console.error(`Error verifying transaction ${transaction.id}:`, verifyError);
            if (transactionAge > oneHour) {
              // First attempt with pending check
              let { error: updateError } = await supabase
                .from('transactions')
                .update({ 
                  status: 'rejected',
                  paystack_status: 'verification_error'
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
                  await supabase
                    .from('transactions')
                    .update({ 
                      status: 'rejected',
                      paystack_status: 'verification_error'
                    })
                    .eq('id', transaction.id);
                }
              }
              
              updated++;
            }
            errors.push(`Error verifying transaction ${transaction.id}: ${verifyError.message}`);
          }
        } else if (transaction.deposit_method === 'paystack') {
          // Paystack transaction without reference - we already tried to match it above
          // Only mark as rejected if it's very old (24 hours) and still no reference
          const oneDay = 24 * 60 * 60 * 1000;
          if (transactionAge > oneDay) {
            // First attempt with pending check
            let { error: updateError } = await supabase
              .from('transactions')
              .update({ 
                status: 'rejected',
                paystack_status: 'no_reference'
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
                await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    paystack_status: 'no_reference'
                  })
                  .eq('id', transaction.id);
              }
            }
            
            updated++;
            console.log(`Transaction ${transaction.id} marked as rejected (no reference after 24 hours)`);
          } else {
            console.log(`Transaction ${transaction.id} still pending without reference (age: ${Math.round(transactionAge / 60000)} minutes)`);
          }
        } else if (transaction.deposit_method === 'moolre_web') {
          // Verify Moolre Web transactions
          if (transaction.moolre_reference) {
            try {
              // Get Moolre credentials
              const MOOLRE_API_USER = process.env.MOOLRE_API_USER;
              const MOOLRE_API_PUBKEY = process.env.MOOLRE_API_PUBKEY;
              const MOOLRE_ACCOUNT_NUMBER = process.env.MOOLRE_ACCOUNT_NUMBER;

              if (!MOOLRE_API_USER || !MOOLRE_API_PUBKEY || !MOOLRE_ACCOUNT_NUMBER) {
                console.warn(`[VERIFY] Moolre credentials not configured, skipping transaction ${transaction.id}`);
                errors.push(`Moolre credentials not configured for transaction ${transaction.id}`);
                continue;
              }

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
                
                if (moolreData.status === 0) {
                  // Moolre API error
                  console.error(`[VERIFY] Moolre API error for transaction ${transaction.id}:`, moolreData);
                  if (transactionAge > oneHour) {
                    // Mark as rejected if old
                    let { error: updateError } = await supabase
                      .from('transactions')
                      .update({ 
                        status: 'rejected',
                        moolre_status: 'verification_failed'
                      })
                      .eq('id', transaction.id)
                      .eq('status', 'pending');

                    if (updateError && (updateError.code === 'PGRST116' || updateError.message?.includes('No rows'))) {
                      const { data: currentTx } = await supabase
                        .from('transactions')
                        .select('status')
                        .eq('id', transaction.id)
                        .single();
                      
                      if (currentTx?.status === 'pending') {
                        await supabase
                          .from('transactions')
                          .update({ 
                            status: 'rejected',
                            moolre_status: 'verification_failed'
                          })
                          .eq('id', transaction.id);
                      }
                    }
                    updated++;
                  }
                  errors.push(`Moolre API error for transaction ${transaction.id}: ${moolreData.message || 'Unknown error'}`);
                  continue;
                }

                // Parse transaction status
                // txstatus: 1=Success, 0=Pending, 2=Failed
                const txstatus = moolreData.data?.txstatus;
                const paymentStatus = txstatus === 1 ? 'success' : txstatus === 2 ? 'failed' : 'pending';

                if (paymentStatus === 'success') {
                  // Payment was successful, approve transaction
                  let approvalSuccess = false;
                  let approvalError = null;
                  const maxRetries = 3;

                  for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                      const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction_universal', {
                        p_transaction_id: transaction.id,
                        p_payment_method: 'moolre_web',
                        p_payment_status: 'success',
                        p_payment_reference: transaction.moolre_reference
                      });

                      if (rpcError) {
                        approvalError = rpcError;
                        if (attempt < maxRetries) {
                          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                          continue;
                        }
                        break;
                      }

                      const approvalResult = result && result.length > 0 ? result[0] : null;

                      if (!approvalResult) {
                        approvalError = new Error('Database function returned no result');
                        if (attempt < maxRetries) {
                          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                          continue;
                        }
                        break;
                      }

                      if (approvalResult.success) {
                        approvalSuccess = true;
                        console.log(`[VERIFY] Moolre Web transaction ${transaction.id} successfully approved (attempt ${attempt})`);
                        break;
                      } else {
                        // Check if already approved (idempotent)
                        if (approvalResult.message && approvalResult.message.includes('already approved')) {
                          approvalSuccess = true;
                          console.log(`[VERIFY] Moolre Web transaction ${transaction.id} already approved (attempt ${attempt})`);
                          break;
                        } else {
                          approvalError = new Error(approvalResult.message);
                          if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                            continue;
                          }
                        }
                      }
                    } catch (retryError) {
                      approvalError = retryError;
                      if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                      }
                    }
                  }

                  if (approvalSuccess) {
                    updated++;
                    verified++;
                    moolreWebProcessed++;
                    console.log(`[VERIFY] Moolre Web transaction ${transaction.id} successfully updated to approved with balance`);
                  } else {
                    const errorMsg = `Moolre Web transaction ${transaction.id}: approval failed - ${approvalError?.message || 'Unknown error'}`;
                    errors.push(errorMsg);
                    console.error('[VERIFY] CRITICAL:', errorMsg, {
                      error: approvalError,
                      transactionId: transaction.id,
                      moolreReference: transaction.moolre_reference
                    });
                  }
                } else if (paymentStatus === 'failed') {
                  // Payment failed, mark as rejected
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
                      await supabase
                        .from('transactions')
                        .update({ 
                          status: 'rejected',
                          moolre_status: 'failed'
                        })
                        .eq('id', transaction.id);
                    }
                  }
                  
                  updated++;
                  moolreWebProcessed++;
                  console.log(`[VERIFY] Moolre Web transaction ${transaction.id} marked as rejected`);
                } else if (transactionAge > oneHour && paymentStatus === 'pending') {
                  // Transaction is old and still pending, mark as rejected
                  let { error: updateError } = await supabase
                    .from('transactions')
                    .update({ 
                      status: 'rejected',
                      moolre_status: 'timeout'
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
                      await supabase
                        .from('transactions')
                        .update({ 
                          status: 'rejected',
                          moolre_status: 'timeout'
                        })
                        .eq('id', transaction.id);
                    }
                  }
                  
                  updated++;
                  moolreWebProcessed++;
                  console.log(`[VERIFY] Moolre Web transaction ${transaction.id} timed out and marked as rejected`);
                } else {
                  // Still pending, just update Moolre status
                  await supabase
                    .from('transactions')
                    .update({ 
                      moolre_status: 'pending'
                    })
                    .eq('id', transaction.id);
                }

                verified++;
              } else {
                // Verification request failed
                console.error(`[VERIFY] Moolre API request failed for transaction ${transaction.id}:`, moolreResponse.status);
                if (transactionAge > oneHour) {
                  let { error: updateError } = await supabase
                    .from('transactions')
                    .update({ 
                      status: 'rejected',
                      moolre_status: 'verification_failed'
                    })
                    .eq('id', transaction.id)
                    .eq('status', 'pending');

                  if (updateError && (updateError.code === 'PGRST116' || updateError.message?.includes('No rows'))) {
                    const { data: currentTx } = await supabase
                      .from('transactions')
                      .select('status')
                      .eq('id', transaction.id)
                      .single();
                    
                    if (currentTx?.status === 'pending') {
                      await supabase
                        .from('transactions')
                        .update({ 
                          status: 'rejected',
                          moolre_status: 'verification_failed'
                        })
                        .eq('id', transaction.id);
                    }
                  }
                  
                  updated++;
                }
                errors.push(`Moolre verification failed for transaction ${transaction.id}`);
              }
            } catch (moolreError) {
              console.error(`[VERIFY] Error verifying Moolre Web transaction ${transaction.id}:`, moolreError);
              if (transactionAge > oneHour) {
                let { error: updateError } = await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    moolre_status: 'verification_error'
                  })
                  .eq('id', transaction.id)
                  .eq('status', 'pending');

                if (updateError && (updateError.code === 'PGRST116' || updateError.message?.includes('No rows'))) {
                  const { data: currentTx } = await supabase
                    .from('transactions')
                    .select('status')
                    .eq('id', transaction.id)
                    .single();
                  
                  if (currentTx?.status === 'pending') {
                    await supabase
                      .from('transactions')
                      .update({ 
                        status: 'rejected',
                        moolre_status: 'verification_error'
                      })
                      .eq('id', transaction.id);
                  }
                }
                
                updated++;
              }
              errors.push(`Error verifying Moolre Web transaction ${transaction.id}: ${moolreError.message}`);
            }
          } else {
            // Moolre Web transaction without reference
            // Only mark as rejected if it's very old (24 hours) and still no reference
            const oneDay = 24 * 60 * 60 * 1000;
            if (transactionAge > oneDay) {
              let { error: updateError } = await supabase
                .from('transactions')
                .update({ 
                  status: 'rejected',
                  moolre_status: 'no_reference'
                })
                .eq('id', transaction.id)
                .eq('status', 'pending');

              if (updateError && (updateError.code === 'PGRST116' || updateError.message?.includes('No rows'))) {
                const { data: currentTx } = await supabase
                  .from('transactions')
                  .select('status')
                  .eq('id', transaction.id)
                  .single();
                
                if (currentTx?.status === 'pending') {
                  await supabase
                    .from('transactions')
                    .update({ 
                      status: 'rejected',
                      moolre_status: 'no_reference'
                    })
                    .eq('id', transaction.id);
                }
              }
              
              updated++;
              console.log(`[VERIFY] Moolre Web transaction ${transaction.id} marked as rejected (no reference after 24 hours)`);
            } else {
              console.log(`[VERIFY] Moolre Web transaction ${transaction.id} still pending without reference (age: ${Math.round(transactionAge / 60000)} minutes)`);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing transaction ${transaction.id}:`, error);
        errors.push(`Error processing transaction ${transaction.id}: ${error.message}`);
      }
    }

    const totalTime = Date.now() - startTime;
    sessionMetrics.verified = verified;
    sessionMetrics.updated = updated;
    sessionMetrics.matchedFromPaystack = matchedFromPaystack;
    sessionMetrics.moolreWebProcessed = moolreWebProcessed;
    sessionMetrics.errors = errors;
    sessionMetrics.endTime = new Date().toISOString();
    sessionMetrics.totalTime = totalTime;

    console.log('[VERIFY] Verification completed:', {
      totalTransactions: pendingTransactions.length,
      verified,
      updated,
      matchedFromPaystack,
      moolreWebProcessed,
      errors: errors.length,
      totalTime: `${totalTime}ms`
    });

    return res.status(200).json({
      message: 'Verification completed',
      count: pendingTransactions.length,
      verified,
      updated,
      matchedFromPaystack,
      moolreWebProcessed,
      unmatchedPaystackTransactions: unmatchedPaystackTxs.length > 0 ? unmatchedPaystackTxs.slice(0, 10) : undefined, // Limit to first 10 for response size
      errors: errors.length > 0 ? errors : undefined,
      metrics: {
        totalTime: `${totalTime}ms`,
        transactionsProcessed: sessionMetrics.transactionMetrics.length,
        successRate: pendingTransactions.length > 0 ? ((updated / pendingTransactions.length) * 100).toFixed(2) + '%' : '0%',
        moolreWebProcessed
      }
    });
  } catch (error) {
    console.error('Error in verify-pending-payments:', error);
    return res.status(500).json({ 
      error: 'Failed to verify pending payments',
      message: error.message 
    });
  }
}

