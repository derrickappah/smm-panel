/**
 * Manual Paystack Deposit Verification Endpoint
 * 
 * This endpoint allows admins to manually verify and update Paystack deposit statuses.
 * It verifies the payment with Paystack API and updates the transaction status accordingly.
 * 
 * Environment Variables Required:
 * - PAYSTACK_SECRET_KEY: Your Paystack secret key
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
 * 
 * Usage:
 * POST /api/manual-verify-paystack-deposit
 * Body: { transactionId: "uuid" } or { reference: "paystack_reference" }
 */

import { createClient } from '@supabase/supabase-js';

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

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
    
    // If reference is missing, try to retrieve it from Paystack
    if (!paystackReference) {
      console.log(`[MANUAL-VERIFY] No reference found, attempting to retrieve from Paystack for transaction ${transaction.id}`);
      
      try {
        // Query Paystack transactions API to find matching transaction
        const startDate = new Date(new Date(transaction.created_at).getTime() - 2 * 60 * 60 * 1000); // 2 hours before
        const endDate = new Date(new Date(transaction.created_at).getTime() + 2 * 60 * 60 * 1000); // 2 hours after
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const paystackAmount = Math.round(transaction.amount * 100); // Convert to pesewas
        
        // Get user email for matching
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', transaction.user_id)
          .single();

        // Query Paystack for transactions in this time window
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
              paystackReference = matchingTx.reference;
              console.log(`[MANUAL-VERIFY] Found matching Paystack transaction, retrieved reference: ${paystackReference}`);
              
              // Store the reference
              await supabase
                .from('transactions')
                .update({ paystack_reference: paystackReference })
                .eq('id', transaction.id);
            }
          }
        }
      } catch (refRetrievalError) {
        console.error(`[MANUAL-VERIFY] Error retrieving reference:`, refRetrievalError);
      }
    }
    
    if (!paystackReference) {
      return res.status(400).json({ 
        error: 'No Paystack reference found for this transaction and could not retrieve it from Paystack',
        transactionId: transaction.id,
        suggestion: 'The payment may not have been initiated with Paystack, or it may be too old to retrieve'
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
      // Payment was successful - approve the transaction
      const updateData = {
        status: 'approved',
        paystack_status: 'success',
        paystack_reference: paystackReference
      };

      // Update status (without strict pending condition - like reject does)
      const { data: updatedData, error: updateError } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transaction.id)
        .select('status');

      if (updateError) {
        console.error('[MANUAL-VERIFY] Error updating transaction status:', updateError);
        return res.status(500).json({ 
          error: 'Failed to update transaction status',
          details: updateError.message
        });
      }

      // Verify status was updated
      const { data: statusCheck } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', transaction.id)
        .single();

      if (statusCheck?.status !== 'approved') {
        // Try one more time without status condition
        await supabase
          .from('transactions')
          .update(updateData)
          .eq('id', transaction.id);
      }

      // Update user balance if transaction wasn't already approved
      if (transaction.status !== 'approved') {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', transaction.user_id)
          .single();

        if (profileError) {
          console.error('[MANUAL-VERIFY] Error fetching profile:', profileError);
          return res.status(500).json({ 
            error: 'Failed to fetch user profile',
            details: profileError.message
          });
        }

        const currentBalance = parseFloat(profile.balance || 0);
        const newBalance = currentBalance + parseFloat(transaction.amount);

        const { error: balanceError } = await supabase
          .from('profiles')
          .update({ balance: newBalance })
          .eq('id', transaction.user_id);

        if (balanceError) {
          console.error('[MANUAL-VERIFY] Error updating balance:', balanceError);
          return res.status(500).json({ 
            error: 'Failed to update user balance',
            details: balanceError.message,
            note: 'Transaction status was updated but balance update failed'
          });
        }

        // Verify balance was updated
        const { data: verifyProfile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', transaction.user_id)
          .single();

        if (verifyProfile && parseFloat(verifyProfile.balance) === newBalance) {
          balanceUpdated = true;
        }
      } else {
        balanceUpdated = true; // Already approved, balance should already be updated
      }

      updateResult = {
        success: true,
        message: 'Deposit approved and balance updated',
        oldStatus: transaction.status,
        newStatus: 'approved',
        balanceUpdated
      };
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

    return res.status(200).json({
      success: true,
      transactionId: transaction.id,
      reference: paystackReference,
      paystackStatus: paymentStatus,
      updateResult
    });
  } catch (error) {
    console.error('[MANUAL-VERIFY] Error in manual verification:', error);
    return res.status(500).json({ 
      error: 'Failed to verify deposit',
      message: error.message 
    });
  }
}

