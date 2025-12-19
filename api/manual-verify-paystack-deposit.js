/**
 * Manual Paystack Deposit Verification Endpoint
 * 
 * SECURITY: Requires admin authentication for manual verification.
 * 
 * This endpoint allows admins to manually verify and update Paystack deposit statuses.
 * It verifies the payment with Paystack API and updates the transaction status accordingly.
 * 
 * Environment Variables Required:
 * - PAYSTACK_SECRET_KEY: Your Paystack secret key
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
 * - SUPABASE_ANON_KEY: Your Supabase anon key (for JWT verification)
 * 
 * Usage:
 * POST /api/manual-verify-paystack-deposit
 * Headers: Authorization: Bearer <supabase_jwt_token>
 * Body: { transactionId: "uuid" } or { reference: "paystack_reference" }
 */

import { verifyAdmin, getServiceRoleClient } from './utils/auth.js';
import { logAdminAction, logSecurityEvent } from './utils/activityLogger.js';

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
    // Authenticate admin user
    let adminUser;
    try {
      const authResult = await verifyAdmin(req);
      adminUser = authResult.user;
    } catch (authError) {
      // Log failed admin authentication attempt
      await logSecurityEvent({
        action_type: 'manual_verification_failed',
        description: `Failed manual verification attempt: ${authError.message}`,
        metadata: {
          transaction_id: req.body?.transactionId || null,
          reference: req.body?.reference || null,
          error: authError.message
        },
        req
      });
      
      if (authError.message === 'Missing or invalid authorization header' ||
          authError.message === 'Missing authentication token' ||
          authError.message === 'Invalid or expired token') {
        return res.status(401).json({
          error: 'Authentication required',
          message: authError.message
        });
      }
      
      if (authError.message === 'Admin access required') {
        return res.status(403).json({
          error: 'Admin access required for manual verification'
        });
      }
      
      throw authError;
    }

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

    const { transactionId, reference } = req.body;

    if (!transactionId && !reference) {
      return res.status(400).json({ 
        error: 'Either transactionId or reference is required' 
      });
    }

    // Initialize Supabase client with service role key
    const supabase = getServiceRoleClient();

    // Find transaction
    let transaction = null;
    
    if (transactionId) {
      const { data: txById, error: idError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .eq('type', 'deposit')
        .maybeSingle();

      if (idError) {
        return res.status(500).json({ 
          error: 'Failed to fetch transaction',
          details: idError.message 
        });
      }

      if (!txById) {
        return res.status(404).json({ 
          error: 'Transaction not found' 
        });
      }

      transaction = txById;
    } else if (reference) {
      const { data: txByRef, error: refError } = await supabase
        .from('transactions')
        .select('*')
        .eq('paystack_reference', reference)
        .eq('type', 'deposit')
        .maybeSingle();

      if (refError) {
        return res.status(500).json({ 
          error: 'Failed to fetch transaction',
          details: refError.message 
        });
      }

      if (!txByRef) {
        return res.status(404).json({ 
          error: 'Transaction not found with that reference' 
        });
      }

      transaction = txByRef;
    }

    // Check if it's a Paystack deposit
    if (transaction.deposit_method !== 'paystack') {
      return res.status(400).json({ 
        error: 'Transaction is not a Paystack deposit',
        deposit_method: transaction.deposit_method
      });
    }

    // Get Paystack reference - try to retrieve if missing
    let paystackReference = transaction.paystack_reference || reference;
    
    // If reference is provided manually, validate it first
    if (reference && !transaction.paystack_reference) {
      console.log(`[MANUAL-VERIFY] Manual reference provided, validating with Paystack: ${reference}`);
      try {
        const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          if (verifyData.status && verifyData.data) {
            // Validate amount matches (within tolerance)
            const paystackAmount = verifyData.data.amount || 0;
            const transactionAmount = Math.round(transaction.amount * 100);
            const amountDiff = Math.abs(paystackAmount - transactionAmount);
            
            if (amountDiff < 10) {
              paystackReference = reference;
              console.log(`[MANUAL-VERIFY] Manual reference validated successfully`);
              
              // Store the reference
              await supabase
                .from('transactions')
                .update({ paystack_reference: paystackReference })
                .eq('id', transaction.id);
            } else {
              console.warn(`[MANUAL-VERIFY] Amount mismatch: transaction=${transactionAmount}, paystack=${paystackAmount}`);
              return res.status(400).json({
                error: 'Reference amount does not match transaction amount',
                transactionAmount: transaction.amount,
                paystackAmount: paystackAmount / 100,
                reference: reference
              });
            }
          } else {
            return res.status(400).json({
              error: 'Invalid reference or transaction not found in Paystack',
              reference: reference
            });
          }
        } else {
          const errorData = await verifyResponse.json().catch(() => ({ message: 'Unknown error' }));
          return res.status(verifyResponse.status).json({
            error: 'Failed to validate reference with Paystack',
            details: errorData.message || verifyResponse.statusText,
            reference: reference
          });
        }
      } catch (validationError) {
        console.error(`[MANUAL-VERIFY] Error validating manual reference:`, validationError);
        return res.status(500).json({
          error: 'Failed to validate reference',
          details: validationError.message
        });
      }
    }
    
    // If reference is still missing, try to retrieve it from Paystack
    let scoredMatches = []; // Track matches for error reporting
    if (!paystackReference) {
      console.log(`[MANUAL-VERIFY] No reference found, attempting to retrieve from Paystack for transaction ${transaction.id}`);
      
      try {
        // Expand time window to 48 hours before/after (configurable via query param)
        const hoursWindow = parseInt(req.query.hours || '48', 10);
        const startDate = new Date(new Date(transaction.created_at).getTime() - hoursWindow * 60 * 60 * 1000);
        const endDate = new Date(new Date(transaction.created_at).getTime() + hoursWindow * 60 * 60 * 1000);
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const paystackAmount = Math.round(transaction.amount * 100); // Convert to pesewas
        const transactionTime = new Date(transaction.created_at);
        const timeWindow = 2 * 60 * 60 * 1000; // 2 hours tolerance for matching
        
        // Get user email for matching
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', transaction.user_id)
          .single();

        // Query Paystack with pagination to find matching transaction
        let allPaystackTxs = [];
        let page = 1;
        let hasMore = true;
        const maxPages = 10; // Limit to prevent excessive API calls
        const perPage = 100; // Maximum per page

        console.log(`[MANUAL-VERIFY] Querying Paystack transactions from ${startDateStr} to ${endDateStr} (${hoursWindow}h window)...`);

        while (hasMore && page <= maxPages) {
          try {
            const paystackQueryUrl = `https://api.paystack.co/transaction?perPage=${perPage}&page=${page}&from=${startDateStr}&to=${endDateStr}`;
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
            } else if (paystackResponse.status === 429 && page <= maxPages) {
              // Rate limited - wait and retry
              const waitTime = Math.pow(2, page) * 1000;
              console.log(`[MANUAL-VERIFY] Rate limited, waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              // Don't increment page, retry same page
            } else {
              console.error(`[MANUAL-VERIFY] Paystack API error (page ${page}):`, paystackResponse.status);
              hasMore = false;
            }
          } catch (pageError) {
            console.error(`[MANUAL-VERIFY] Error querying Paystack (page ${page}):`, pageError);
            if (page < maxPages) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              page++;
            } else {
              hasMore = false;
            }
          }
        }

        console.log(`[MANUAL-VERIFY] Retrieved ${allPaystackTxs.length} Paystack transactions from ${page - 1} page(s)`);

        // Score and find the best matching transaction
        // Scoring system:
        // - 100: Exact match via metadata.transaction_id
        // - 80: Email + Amount + Time match (all three)
        // - 60: Email + Amount match
        // - 40: Amount + Time match
        // - 20: Amount only match
        
        scoredMatches = allPaystackTxs.map(tx => {
              const txAmount = tx.amount; // Already in pesewas
              const amountMatch = Math.abs(txAmount - paystackAmount) < 10; // Allow small difference
              
          if (!amountMatch) return null;

          let score = 0;
          const reasons = [];

          // Check for exact match via metadata.transaction_id (highest priority)
          const txMetadata = tx.metadata || {};
          const txTransactionId = txMetadata.transaction_id;
          if (txTransactionId === transaction.id) {
            score = 100;
            reasons.push('exact metadata match');
            return { tx, score, reasons, timeDiff: 0 };
          }

          // Calculate time difference
          const txTime = new Date(tx.created_at || tx.paid_at);
          const timeDiff = Math.abs(txTime - transactionTime);
          const timeMatch = timeDiff <= timeWindow;

          // Check email match
          const emailMatch = userProfile?.email && tx.customer?.email && 
            tx.customer.email.toLowerCase() === userProfile.email.toLowerCase();

          // Score based on matching criteria
          if (emailMatch && timeMatch) {
            score = 80;
            reasons.push('email + amount + time match');
          } else if (emailMatch) {
            score = 60;
            reasons.push('email + amount match');
          } else if (timeMatch) {
            score = 40;
            reasons.push('amount + time match');
          } else {
            score = 20;
            reasons.push('amount only match');
          }

          return { tx, score, reasons, timeDiff };
        }).filter(match => match !== null);

        // Sort by score (highest first), then by time difference (closest first)
        scoredMatches.sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return a.timeDiff - b.timeDiff;
            });

        // Only proceed if we have a high-confidence match
        // SECURITY: Only score 100 (exact metadata match) is automatically processed
        // Scores 90-99 require admin approval (which we have since this is an admin endpoint)
        // Lower scores require manual reference input
        const bestMatch = scoredMatches[0];
        
        if (bestMatch && bestMatch.score === 100) {
          // Exact match via metadata.transaction_id - highest confidence, safe to auto-process
          const matchingTx = bestMatch.tx;

          if (matchingTx && matchingTx.reference) {
            paystackReference = matchingTx.reference;
            console.log(`[MANUAL-VERIFY] Found exact match (score 100) via metadata:`, {
              reference: paystackReference,
              score: bestMatch.score,
              reasons: bestMatch.reasons.join(', '),
              transactionId: transaction.id,
              paystackMetadataId: matchingTx.metadata?.transaction_id
            });
              
            // Store the reference
            await supabase
              .from('transactions')
              .update({ paystack_reference: paystackReference })
              .eq('id', transaction.id);
          }
        } else if (bestMatch && bestMatch.score >= 90) {
          // High confidence match (90-99) - admin can approve, but log warning
          const matchingTx = bestMatch.tx;
          const highScoreMatches = scoredMatches.filter(m => m.score >= 90);
          
          console.warn(`[MANUAL-VERIFY] Found high-confidence match (score: ${bestMatch.score}), but not exact metadata match. Admin approval required.`, {
            reference: bestMatch.tx.reference,
            score: bestMatch.score,
            reasons: bestMatch.reasons.join(', '),
            transactionId: transaction.id,
            totalCandidates: scoredMatches.length,
            highScoreMatches: highScoreMatches.length,
            warning: 'Multiple high-scoring matches may indicate collision risk'
          });

          // Warn if multiple high-scoring matches exist
          if (highScoreMatches.length > 1) {
            console.warn(`[MANUAL-VERIFY] SECURITY WARNING: Multiple high-confidence matches found (${highScoreMatches.length}). Manual verification recommended.`, {
              allMatches: highScoreMatches.map(m => ({
                reference: m.tx.reference,
                score: m.score,
                reasons: m.reasons,
                metadataId: m.tx.metadata?.transaction_id
              }))
            });
          }

          // Since this is an admin endpoint, allow processing but log the risk
          if (matchingTx && matchingTx.reference) {
            paystackReference = matchingTx.reference;
            console.log(`[MANUAL-VERIFY] Admin-approved high-confidence match (score ${bestMatch.score})`);
          }
        } else if (bestMatch && bestMatch.score >= 40) {
          // Medium confidence match - require manual reference input
          console.warn(`[MANUAL-VERIFY] Found medium-confidence match (score: ${bestMatch.score}), requires manual reference input:`, {
            reference: bestMatch.tx.reference,
            reasons: bestMatch.reasons.join(', '),
            transactionId: transaction.id,
            totalCandidates: scoredMatches.length,
            recommendation: 'Provide reference manually in request body for exact matching'
          });
        } else {
          // No good match found
          const candidateCount = scoredMatches.length;
          const lowScoreCount = scoredMatches.filter(m => m.score < 40).length;
          
          console.log(`[MANUAL-VERIFY] No high-confidence matching Paystack transaction found:`, {
            transactionId: transaction.id,
            totalPaystackTxs: allPaystackTxs.length,
            candidatesWithAmountMatch: candidateCount,
            lowConfidenceCandidates: lowScoreCount,
            bestMatchScore: bestMatch?.score || 0,
            bestMatchReasons: bestMatch?.reasons?.join(', ') || 'none'
          });
        }
      } catch (refRetrievalError) {
        console.error(`[MANUAL-VERIFY] Error retrieving reference:`, refRetrievalError);
      }
    }
    
    if (!paystackReference) {
      // Check if we found candidates but they were low confidence
      const foundLowConfidenceMatches = scoredMatches && scoredMatches.length > 0 && scoredMatches[0].score < 90;
      
      return res.status(400).json({ 
        error: 'No Paystack reference found for this transaction and could not retrieve it from Paystack',
        transactionId: transaction.id,
        transactionAmount: transaction.amount,
        transactionDate: transaction.created_at,
        depositMethod: transaction.deposit_method,
        reason: foundLowConfidenceMatches 
          ? 'Found potential matches but confidence was too low (< 90) to automatically verify. Only exact metadata matches (score 100) are auto-processed. Provide reference manually for exact matching.'
          : 'No matching Paystack transaction found in the search window.',
        suggestions: [
          'The payment may not have been initiated with Paystack',
          'The transaction may be too old to retrieve (try increasing the hours parameter)',
          'Multiple transactions with the same amount may exist - use manual reference input for exact matching',
          'You can manually provide a Paystack reference by including it in the request body: { transactionId: "...", reference: "paystack_ref_here" }',
          'Check if the transaction was created with a different payment method'
        ],
        help: 'To manually verify with a reference, send: POST /api/manual-verify-paystack-deposit with body: { transactionId: "' + transaction.id + '", reference: "your_paystack_reference" }'
      });
    }

    console.log(`[MANUAL-VERIFY] Verifying Paystack deposit:`, {
      transactionId: transaction.id,
      reference: paystackReference,
      currentStatus: transaction.status
    });

    // Verify payment with Paystack
    let verifyResponse = null;
    let verifyData = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${paystackReference}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (verifyResponse.ok) {
          verifyData = await verifyResponse.json();
          break;
        } else if (verifyResponse.status === 429 && attempt < maxRetries) {
          // Rate limited - wait and retry
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`[MANUAL-VERIFY] Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          const errorData = await verifyResponse.json().catch(() => ({ message: 'Unknown error' }));
          return res.status(verifyResponse.status).json({ 
            error: 'Paystack verification failed',
            details: errorData.message || verifyResponse.statusText,
            reference: paystackReference
          });
        }
      } catch (fetchError) {
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`[MANUAL-VERIFY] Error verifying, retrying in ${waitTime}ms (${attempt + 1}/${maxRetries}):`, fetchError.message);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          return res.status(500).json({ 
            error: 'Failed to verify payment with Paystack',
            details: fetchError.message
          });
        }
      }
    }

    if (!verifyData || !verifyData.status || !verifyData.data) {
      return res.status(500).json({ 
        error: 'Invalid response from Paystack',
        response: verifyData
      });
    }

    const paymentStatus = verifyData.data.status;
    const paystackAmount = verifyData.data.amount ? verifyData.data.amount / 100 : null; // Convert from pesewas to cedis

    console.log(`[MANUAL-VERIFY] Paystack verification result:`, {
      transactionId: transaction.id,
      reference: paystackReference,
      paymentStatus,
      paystackAmount,
      transactionAmount: transaction.amount
    });

    // Update transaction based on Paystack status
    let updateResult = null;
    let balanceUpdated = false;

    if (paymentStatus === 'success') {
      // Payment was successful - use atomic function to approve transaction and update balance
      // This prevents race conditions and ensures balance is only updated once
      
      // Check if transaction is already approved
      if (transaction.status === 'approved') {
        // Already approved, balance should already be updated
        console.log('[MANUAL-VERIFY] Transaction already approved, skipping update');
        balanceUpdated = true;
        updateResult = {
          success: true,
          message: 'Transaction already approved',
          oldStatus: transaction.status,
          newStatus: 'approved',
          balanceUpdated: true
        };
      } else {
        // Use atomic function to approve transaction and update balance atomically
        console.log('[MANUAL-VERIFY] Using atomic function to approve transaction and update balance');
        
        const { data: approvalResult, error: rpcError } = await supabase.rpc('approve_deposit_transaction', {
          p_transaction_id: transaction.id,
          p_paystack_status: 'success',
          p_paystack_reference: paystackReference
        });

        if (rpcError) {
          console.error('[MANUAL-VERIFY] Atomic function error:', rpcError);
          return res.status(500).json({ 
            error: 'Failed to approve transaction',
            details: rpcError.message || rpcError.code,
            transactionId: transaction.id
          });
        }

        // The function returns an array with one row
        const result = approvalResult && approvalResult.length > 0 ? approvalResult[0] : null;

        if (!result) {
          return res.status(500).json({ 
            error: 'Atomic function returned no result',
            transactionId: transaction.id
          });
        }

        if (!result.success) {
          // Check if transaction was already approved (idempotent)
          if (result.message && result.message.includes('already approved')) {
            console.log('[MANUAL-VERIFY] Transaction already approved via atomic function');
          balanceUpdated = true;
      updateResult = {
        success: true,
              message: 'Transaction already approved',
        oldStatus: transaction.status,
        newStatus: 'approved',
              balanceUpdated: true
      };
          } else {
            return res.status(400).json({ 
              error: result.message || 'Transaction approval failed',
              transactionId: transaction.id
            });
          }
        } else {
          // Success - balance was updated atomically
          balanceUpdated = true;
          updateResult = {
            success: true,
            message: result.message || 'Deposit approved and balance updated',
            oldStatus: result.old_status,
            newStatus: result.new_status,
            oldBalance: result.old_balance,
            newBalance: result.new_balance,
            balanceUpdated: true
          };
        }
      }
    } else if (paymentStatus === 'failed' || paymentStatus === 'abandoned') {
      // Payment failed - reject the transaction
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'rejected',
          paystack_status: paymentStatus,
          paystack_reference: paystackReference
        })
        .eq('id', transaction.id);

      if (updateError) {
        return res.status(500).json({ 
          error: 'Failed to update transaction status',
          details: updateError.message
        });
      }

      updateResult = {
        success: true,
        message: 'Deposit rejected (payment failed)',
        oldStatus: transaction.status,
        newStatus: 'rejected',
        paystackStatus: paymentStatus
      };
    } else {
      // Payment still pending or unknown status
      // Just update the paystack_status field
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          paystack_status: paymentStatus,
          paystack_reference: paystackReference
        })
        .eq('id', transaction.id);

      if (updateError) {
        return res.status(500).json({ 
          error: 'Failed to update Paystack status',
          details: updateError.message
        });
      }

      updateResult = {
        success: true,
        message: 'Paystack status updated (payment still pending)',
        oldStatus: transaction.status,
        newStatus: transaction.status, // Status unchanged
        paystackStatus: paymentStatus
      };
    }

    // Log successful manual verification
    await logAdminAction({
      user_id: adminUser.id,
      action_type: 'deposit_manually_verified',
      entity_type: 'transaction',
      entity_id: transaction.id,
      description: `Manual Paystack deposit verification: ${paymentStatus}`,
      metadata: {
        transaction_id: transaction.id,
        reference: paystackReference,
        paystack_status: paymentStatus,
        old_status: updateResult?.oldStatus || transaction.status,
        new_status: updateResult?.newStatus || transaction.status,
        amount: transaction.amount,
        deposit_method: 'paystack',
        balance_updated: updateResult?.balanceUpdated || false
      },
      req
    });

    return res.status(200).json({
      success: true,
      transactionId: transaction.id,
      reference: paystackReference,
      paystackStatus: paymentStatus,
      updateResult
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

    if (error.message === 'Admin access required') {
      return res.status(403).json({
        error: 'Admin access required for manual verification'
      });
    }

    console.error('[MANUAL-VERIFY] Error in manual verification:', error);
    return res.status(500).json({ 
      error: 'Failed to verify deposit',
      message: error.message 
    });
  }
}

