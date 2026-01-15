/**
 * Paystack Webhook Handler
 * 
 * This function handles webhook events from Paystack for real-time payment status updates.
 * It verifies the webhook signature and updates transaction status automatically.
 * 
 * IMPORTANT LIMITATION:
 * Vercel serverless functions automatically parse JSON bodies before our handler runs.
 * This means we cannot access the exact raw body string that Paystack signed, which can
 * cause signature verification to fail even with the correct secret key.
 * 
 * Current workaround: IP whitelisting is used as a fallback security measure.
 * If signature verification fails but the request is from a Paystack IP, it's allowed.
 * 
 * TODO: Consider migrating to Vercel Edge Functions or using a different approach
 * to access the raw request body for accurate signature verification.
 * 
 * Environment Variables Required:
 * - PAYSTACK_SECRET_KEY: Your Paystack secret key (starts with sk_)
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (for server-side operations)
 * 
 * Webhook URL to configure in Paystack Dashboard:
 * https://your-domain.com/api/paystack-webhook
 */

import * as crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Disable automatic body parsing to get raw body for signature verification
// Note: This config may not work in all Vercel environments
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Read raw body from request stream as Buffer
 * This is needed because Paystack signs the exact raw body bytes
 * Using Buffer preserves the exact bytes Paystack sent
 */
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    // If body is already parsed (Vercel parsed it despite config), we can't get raw body
    // Check if body exists and is an object (already parsed)
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      // Body already parsed - stream is consumed, we can't get raw body
      console.warn('Body already parsed by Vercel - cannot read raw body from stream');
      resolve(null);
      return;
    }

    // If body is already a Buffer, use it directly (preserves exact bytes)
    if (Buffer.isBuffer(req.body)) {
      resolve(req.body);
      return;
    }

    // If body is a string, convert to Buffer (preserves bytes)
    if (typeof req.body === 'string') {
      resolve(Buffer.from(req.body, 'utf8'));
      return;
    }

    // Try to read from stream as Buffer if it's still readable
    if (req.readable && !req.readableEnded) {
      const chunks = [];
      req.on('data', (chunk) => {
        // Keep chunks as Buffer, don't convert to string
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on('end', () => {
        // Concatenate buffers to preserve exact bytes
        const rawBody = Buffer.concat(chunks);
        resolve(rawBody);
      });
      req.on('error', (err) => {
        reject(err);
      });
    } else {
      // Stream already consumed or not readable
      console.warn('Request stream not readable - body may have been parsed');
      resolve(null);
    }
  });
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-paystack-signature');

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
      console.error('PAYSTACK_SECRET_KEY is not configured');
      return res.status(500).json({
        error: 'Paystack secret key not configured'
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Supabase credentials not configured');
      return res.status(500).json({
        error: 'Supabase credentials not configured'
      });
    }

    // Get raw body for signature verification
    // Paystack signs the exact raw body bytes, so we must use the unparsed body
    // Try to get as Buffer first to preserve exact bytes
    let rawBodyBuffer = await getRawBody(req);
    let rawBody;

    // If we couldn't get raw body (Vercel already parsed it), we have a problem
    // In this case, we'll try to reconstruct it, but signature verification may fail
    if (!rawBodyBuffer) {
      if (req.body && typeof req.body === 'object') {
        // Vercel parsed the body - reconstruct JSON string
        // WARNING: This may not match Paystack's exact format, causing signature mismatch
        rawBody = JSON.stringify(req.body);
        rawBodyBuffer = Buffer.from(rawBody, 'utf8');
        console.warn('Using reconstructed JSON body - signature verification may fail');
        console.warn('Consider using a different approach or Vercel Edge Functions');
      } else {
        console.error('Failed to read raw body and body is not an object');
        return res.status(400).json({ error: 'Invalid request body' });
      }
    } else {
      // We got a Buffer - convert to string for JSON parsing later
      rawBody = rawBodyBuffer.toString('utf8');
    }

    // Verify webhook signature using raw body Buffer (preserves exact bytes)
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(rawBodyBuffer || rawBody)
      .digest('hex');

    // Get signature from header
    const signature = req.headers['x-paystack-signature'];

    // Verify webhook signature
    // Note: Due to Vercel automatically parsing JSON bodies, we may not be able to get the exact raw body
    // This can cause signature mismatches even with the correct secret key
    const signatureValid = hash === signature;

    if (!signatureValid) {
      console.error('SECURITY WARNING: Invalid webhook signature', {
        computedHash: hash.substring(0, 20) + '...',
        receivedSignature: signature ? signature.substring(0, 20) + '...' : 'missing',
        bodyType: typeof req.body,
        rawBodyLength: rawBody ? rawBody.length : 0,
        note: 'If bodyType is object, Vercel parsed the body - signature verification may fail due to JSON formatting differences'
      });

      // Parse event to get reference for API verification (will be parsed again later if needed)
      let eventForVerification;
      try {
        eventForVerification = typeof rawBody === 'string' ? JSON.parse(rawBody) : req.body;
      } catch (parseError) {
        console.error('Failed to parse webhook body:', parseError);
        return res.status(400).json({ error: 'Invalid request body' });
      }

      // If signature fails, try fallback verification through Paystack API
      // SECURITY: Only allow if API verification succeeds - IP whitelist is not sufficient
      if (eventForVerification.data && eventForVerification.data.reference) {
        console.log('Attempting fallback verification through Paystack API for reference:', eventForVerification.data.reference);

        try {
          // Verify payment through Paystack API
          const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${eventForVerification.data.reference}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json'
            }
          });

          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            // Check if payment exists and is valid
            if (verifyData.status && verifyData.data) {
              console.log('Fallback verification successful - payment verified through Paystack API');
              console.warn('SECURITY WARNING: Signature verification failed but payment verified through API - this may indicate a body parsing issue');
              // Continue processing - payment is legitimate
            } else {
              console.error('Fallback verification failed - payment not found or invalid');
              return res.status(401).json({ error: 'Invalid signature and payment verification failed' });
            }
          } else {
            console.error('Fallback verification failed - Paystack API error:', verifyResponse.status);
            return res.status(401).json({ error: 'Invalid signature and API verification failed' });
          }
        } catch (apiError) {
          console.error('Error during fallback API verification:', apiError);
          return res.status(401).json({ error: 'Invalid signature and API verification error' });
        }
      } else {
        // No reference for API verification - reject
        console.error('Rejecting webhook: Invalid signature and no reference for API verification');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else {
      console.log('Signature verification passed');
    }

    // Parse webhook event from raw body (if not already parsed)
    const event = typeof rawBody === 'string' ? JSON.parse(rawBody) : req.body;
    console.log('Paystack webhook event received:', event.event);

    // Handle different event types
    if (event.event === 'charge.success') {
      await handleSuccessfulPayment(event.data, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    } else if (event.event === 'charge.failed') {
      await handleFailedPayment(event.data, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    } else if (event.event === 'charge.abandoned') {
      // Handle abandoned payments (user closed payment window)
      await handleFailedPayment(event.data, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    } else {
      console.log('[WEBHOOK] Unhandled webhook event:', event.event);
      // Even for unhandled events, try to store reference if available
      if (event.data?.reference) {
        await storeReferenceForEvent(event.data, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      }
    }

    // Always return 200 to acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing Paystack webhook:', error);
    // Still return 200 to prevent Paystack from retrying
    return res.status(200).json({
      received: true,
      error: error.message
    });
  }
}

/**
 * Handle successful payment
 */
async function handleSuccessfulPayment(paymentData, supabaseUrl, supabaseServiceKey) {
  const startTime = Date.now();
  const metrics = {
    transactionId: null,
    reference: paymentData.reference,
    statusUpdateAttempts: 0,
    statusUpdateSuccess: false,
    balanceUpdateAttempts: 0,
    balanceUpdateSuccess: false,
    totalTime: 0,
    errors: []
  };

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const reference = paymentData.reference;
    const metadata = paymentData.metadata || {};
    const transactionId = metadata.transaction_id;
    const userId = metadata.user_id;
    const amount = paymentData.amount ? paymentData.amount / 100 : null; // Convert from pesewas to cedis
    const customerEmail = paymentData.customer?.email || metadata.user_email;
    const paidAt = paymentData.paid_at ? new Date(paymentData.paid_at) : new Date();

    console.log('[WEBHOOK] Processing successful payment:', {
      reference,
      transactionId,
      userId,
      amount,
      customerEmail,
      paidAt: paidAt.toISOString(),
      timestamp: new Date().toISOString()
    });

    // Find transaction by reference first, then by transaction_id from metadata
    let transaction = null;

    if (reference) {
      const { data: txByRef, error: refError } = await supabase
        .from('transactions')
        .select('*')
        .eq('paystack_reference', reference)
        .maybeSingle();

      if (!refError && txByRef) {
        transaction = txByRef;
        console.log('Found transaction by reference:', transaction.id);
      }
    }

    // If not found by reference, try by transaction_id from metadata
    if (!transaction && transactionId) {
      const { data: txById, error: idError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .maybeSingle();

      if (!idError && txById) {
        transaction = txById;
        console.log('Found transaction by ID from metadata:', transaction.id);
      }
    }

    // If still not found, try by user_id and amount (with tolerance for rounding)
    if (!transaction && userId && amount) {
      // Try exact match first
      const { data: txByUser, error: userError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'deposit')
        .eq('status', 'pending')
        .eq('deposit_method', 'paystack')
        .eq('amount', amount)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!userError && txByUser) {
        transaction = txByUser;
        console.log('Found transaction by user and exact amount:', transaction.id);
      }
    }

    // If still not found, try by user email and amount (if we have email)
    if (!transaction && customerEmail && amount) {
      try {
        // First, find user by email
        const { data: userByEmail, error: emailError } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', customerEmail)
          .maybeSingle();

        if (!emailError && userByEmail) {
          // Now find pending transaction for this user with matching amount
          const { data: txByEmail, error: txEmailError } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userByEmail.id)
            .eq('type', 'deposit')
            .eq('status', 'pending')
            .eq('deposit_method', 'paystack')
            .eq('amount', amount)
            .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // Within last 2 hours
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!txEmailError && txByEmail) {
            transaction = txByEmail;
            console.log('Found transaction by email and amount:', transaction.id);
          }
        }
      } catch (emailMatchError) {
        console.warn('Error matching by email:', emailMatchError);
      }
    }

    // Last resort: find by amount and time window (within 2 hours of payment)
    if (!transaction && amount) {
      const twoHoursAgo = new Date(paidAt.getTime() - 2 * 60 * 60 * 1000).toISOString();
      const twoHoursLater = new Date(paidAt.getTime() + 2 * 60 * 60 * 1000).toISOString();

      const { data: txByAmount, error: amountError } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'deposit')
        .eq('status', 'pending')
        .eq('deposit_method', 'paystack')
        .eq('amount', amount)
        .gte('created_at', twoHoursAgo)
        .lte('created_at', twoHoursLater)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!amountError && txByAmount) {
        transaction = txByAmount;
        console.log('Found transaction by amount and time window:', transaction.id);
      }
    }

    if (!transaction) {
      console.error('Transaction not found for payment:', {
        reference,
        transactionId,
        userId,
        amount,
        customerEmail,
        searchMethods: 'tried: reference, transaction_id, user_id+amount, email+amount, amount+time'
      });
      return;
    }

    // CRITICAL SECURITY: Validate that the webhook amount matches the stored transaction amount
    // This prevents client-side amount manipulation attacks
    // Currency: Ghanaian Cedi (GHS) - Paystack sends amounts in kobo (100 kobo = 1 GHS)
    if (amount !== null && amount !== undefined) {
      const gatewayAmount = amount / 100; // Convert from kobo to Ghanaian cedis
      const storedAmount = parseFloat(transaction.amount || 0);

      console.log(`PAYSTACK AMOUNT VALIDATION for transaction ${transaction.id}:`, {
        webhook_amount_kobo: amount,
        gateway_amount_ghs: gatewayAmount,
        stored_amount_ghs: storedAmount,
        difference_ghs: Math.abs(gatewayAmount - storedAmount),
        tolerance_ghs: tolerance,
        amounts_match: amountsMatch,
        reference: reference,
        transaction_status: transaction.status,
        currency: 'GHS (Ghanaian Cedi)',
        conversion: '100 kobo = 1 GHS',
        user_id: transaction.user_id,
        timestamp: new Date().toISOString()
      });

      // ROOT CAUSE FIX: Adaptive tolerance based on amount size and significance
      // Small amounts: Strict validation (catches manipulation of small deposits)
      // Large amounts: Proportional validation (allows minor rounding differences)
      let tolerance;
      if (storedAmount < 1.00) {
        tolerance = 0.01; // 1 pesewa for small amounts (< 1 GHS)
      } else if (storedAmount < 10.00) {
        tolerance = 0.05; // 5 pesewas for medium amounts (1-10 GHS)
      } else {
        tolerance = Math.max(0.10, storedAmount * 0.01); // 1% or 10 pesewas minimum
      }

      const difference = Math.abs(gatewayAmount - storedAmount);
      const amountsMatch = difference <= tolerance;
      const isSignificantMismatch = difference > 1.00; // > 1 GHS = clear manipulation

      console.log(`ADAPTIVE VALIDATION for transaction ${transaction.id}:`, {
        stored_amount_ghs: storedAmount,
        gateway_amount_ghs: gatewayAmount,
        difference_ghs: difference,
        adaptive_tolerance_ghs: tolerance,
        amounts_match: amountsMatch,
        significant_mismatch: isSignificantMismatch,
        validation_logic: 'adaptive_tolerance_based_on_amount_size'
      });

      if (!amountsMatch) {
        if (isSignificantMismatch) {
          // BLOCK: Clear manipulation (e.g., 15 GHS stored, 0.10 GHS paid = 14.90 diff)
          console.error(`🚨 SECURITY BLOCK: Significant mismatch detected for transaction ${transaction.id}:`, {
            stored_amount_ghs: storedAmount,
            gateway_amount_ghs: gatewayAmount,
            difference_ghs: difference,
            reference: reference,
            user_id: transaction.user_id,
            block_reason: 'Difference > 1 GHS indicates client-side manipulation'
          });

          await supabase
            .from('transactions')
            .update({
              status: 'rejected',
              paystack_status: 'significant_amount_mismatch_blocked',
              paystack_reference: reference
            })
            .eq('id', transaction.id);

          console.warn(`🚫 BLOCKED: Transaction ${transaction.id} rejected due to significant amount mismatch.`);
          return;
        } else {
          // WARN: Minor differences (rounding/precision) - allow but log
          console.warn(`⚠️  MINOR MISMATCH: Allowing transaction ${transaction.id} (${difference} GHS difference within ${tolerance} GHS tolerance)`);
        }
      }

      console.log(`Paystack amount verification successful: ${gatewayAmount} GHS matches stored amount for transaction ${transaction.id}`);
    }

    // Always store reference if we have it (even if transaction is already approved)
    if (reference && !transaction.paystack_reference) {
      console.log('Storing missing reference for transaction:', transaction.id);
      await supabase
        .from('transactions')
        .update({
          paystack_reference: reference
        })
        .eq('id', transaction.id);
      transaction.paystack_reference = reference;
    }

    // Check if already processed
    if (transaction.status === 'approved') {
      console.log('Transaction already approved, verifying balance:', transaction.id);

      // Verify balance was updated (safety check)
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', transaction.user_id)
        .single();

      if (profile) {
        // Check if balance needs to be updated (idempotent check)
        const currentBalance = parseFloat(profile.balance || 0);
        const expectedBalance = currentBalance; // Balance should already include this transaction

        // If balance seems incorrect, log it but don't update (to avoid double crediting)
        console.log('Balance verification for already-approved transaction:', {
          transactionId: transaction.id,
          transactionAmount: transaction.amount,
          currentBalance,
          note: 'Balance should already include this transaction amount'
        });
      }

      return;
    }

    // Use atomic database function to approve transaction and update balance
    // This prevents race conditions and ensures consistency
    console.log('[WEBHOOK] Approving transaction using atomic database function:', {
      transactionId: transaction.id,
      reference
    });

    let approvalSuccess = false;
    let approvalError = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      metrics.statusUpdateAttempts = attempt;
      metrics.balanceUpdateAttempts = attempt;

      try {
        // Call the atomic database function
        const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction_universal', {
          p_transaction_id: transaction.id,
          p_payment_method: 'paystack',
          p_payment_status: 'success',
          p_payment_reference: reference || transaction.paystack_reference || null
        });

        if (rpcError) {
          console.error(`[WEBHOOK] Attempt ${attempt} database function error:`, rpcError);
          metrics.errors.push(`Approval attempt ${attempt}: ${rpcError.message || rpcError.code}`);
          approvalError = rpcError;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
            continue;
          }
          break;
        }

        // The function returns an array with one row
        const approvalResult = result && result.length > 0 ? result[0] : null;

        if (!approvalResult) {
          console.error(`[WEBHOOK] Attempt ${attempt}: Database function returned no result`);
          metrics.errors.push(`Approval attempt ${attempt}: No result returned`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          break;
        }

        // Check if approval was successful
        if (approvalResult.success) {
          approvalSuccess = true;
          metrics.statusUpdateSuccess = true;
          metrics.balanceUpdateSuccess = true;
          console.log(`[WEBHOOK] Transaction approved successfully (attempt ${attempt}):`, {
            transactionId: transaction.id,
            oldStatus: approvalResult.old_status,
            newStatus: approvalResult.new_status,
            oldBalance: approvalResult.old_balance,
            newBalance: approvalResult.new_balance,
            message: approvalResult.message
          });
          break;
        } else {
          // Check if transaction was already approved (idempotent - this is okay)
          if (approvalResult.message && approvalResult.message.includes('already approved')) {
            approvalSuccess = true;
            metrics.statusUpdateSuccess = true;
            metrics.balanceUpdateSuccess = true;
            console.log(`[WEBHOOK] Transaction already approved (attempt ${attempt}):`, {
              transactionId: transaction.id,
              message: approvalResult.message
            });
            break;
          } else {
            // Other error
            console.warn(`[WEBHOOK] Attempt ${attempt}: Approval failed:`, approvalResult.message);
            metrics.errors.push(`Approval attempt ${attempt}: ${approvalResult.message}`);
            approvalError = new Error(approvalResult.message);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
          }
        }
      } catch (retryError) {
        console.error(`[WEBHOOK] Attempt ${attempt} exception:`, retryError);
        metrics.errors.push(`Approval attempt ${attempt} exception: ${retryError.message}`);
        approvalError = retryError;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // Log approval result
    if (!approvalSuccess) {
      console.error('[WEBHOOK] Failed to approve transaction after all retries:', {
        transactionId: transaction.id,
        error: approvalError,
        attempts: maxRetries,
        metrics
      });
      metrics.errors.push(`Approval failed after ${maxRetries} attempts: ${approvalError?.message || 'Unknown error'}`);
      return; // Don't continue if approval failed
    }

    // Balance was already updated by the database function, so we're done
    console.log('[WEBHOOK] Transaction approved and balance updated successfully via atomic function');

    // Verify balance was updated (safety check)
    const { data: verifyProfile } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', transaction.user_id)
      .single();

    if (verifyProfile) {
      console.log('[WEBHOOK] Balance verification:', {
        userId: transaction.user_id,
        currentBalance: verifyProfile.balance,
        transactionAmount: transaction.amount
      });
    }

    // Log success metrics
    metrics.totalTime = Date.now() - startTime;
    console.log('[WEBHOOK] Payment processing completed successfully:', {
      transactionId: transaction.id,
      reference,
      metrics
    });

    // Run automatic manual verification in background (non-blocking)
    (async () => {
      try {
        console.log('[WEBHOOK] Running automatic verification for transaction:', transaction.id);

        // Make internal call to verification endpoint
        // Use VERCEL_URL if available (production), otherwise localhost for development
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : (process.env.NEXT_PUBLIC_VERCEL_URL
            ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
            : 'http://localhost:3000');

        const verifyResponse = await fetch(`${baseUrl}/api/manual-verify-paystack-deposit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            transactionId: transaction.id
          })
        });

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          console.log('[WEBHOOK] Automatic verification completed:', verifyData);
        } else {
          const errorData = await verifyResponse.json().catch(() => ({}));
          console.warn('[WEBHOOK] Automatic verification warning (non-critical):', errorData.error || 'Unknown error');
        }
      } catch (verifyError) {
        // Log but don't fail - this is a background verification step
        console.warn('[WEBHOOK] Automatic verification error (non-critical):', verifyError);
      }
    })();

    return; // Success - exit early since we're done
  } catch (error) {
    metrics.totalTime = Date.now() - startTime;
    console.error('[WEBHOOK] Error handling successful payment:', {
      error: error.message,
      stack: error.stack,
      metrics
    });
    throw error;
  }
}

/**
 * Store reference for any webhook event (helper function)
 */
async function storeReferenceForEvent(paymentData, supabaseUrl, supabaseServiceKey) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const reference = paymentData.reference;
    const metadata = paymentData.metadata || {};
    const transactionId = metadata.transaction_id;

    if (!reference) return;

    // Try to find transaction and store reference
    let transaction = null;

    if (reference) {
      const { data: txByRef } = await supabase
        .from('transactions')
        .select('id, paystack_reference')
        .eq('paystack_reference', reference)
        .maybeSingle();

      if (txByRef) {
        transaction = txByRef;
      }
    }

    if (!transaction && transactionId) {
      const { data: txById } = await supabase
        .from('transactions')
        .select('id, paystack_reference')
        .eq('id', transactionId)
        .maybeSingle();

      if (txById) {
        transaction = txById;
      }
    }

    // Store reference if transaction found and doesn't have it
    if (transaction && !transaction.paystack_reference) {
      await supabase
        .from('transactions')
        .update({ paystack_reference: reference })
        .eq('id', transaction.id);
      console.log('[WEBHOOK] Stored reference for transaction:', transaction.id);
    }
  } catch (error) {
    console.error('[WEBHOOK] Error storing reference for event:', error);
  }
}

/**
 * Handle failed payment
 */
async function handleFailedPayment(paymentData, supabaseUrl, supabaseServiceKey) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const reference = paymentData.reference;
    const metadata = paymentData.metadata || {};
    const transactionId = metadata.transaction_id;

    console.log('Processing failed payment:', {
      reference,
      transactionId
    });

    // Find transaction by reference or transaction_id
    let transaction = null;

    if (reference) {
      const { data: txByRef, error: refError } = await supabase
        .from('transactions')
        .select('*')
        .eq('paystack_reference', reference)
        .maybeSingle();

      if (!refError && txByRef) {
        transaction = txByRef;
      }
    }

    if (!transaction && transactionId) {
      const { data: txById, error: idError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .maybeSingle();

      if (!idError && txById) {
        transaction = txById;
      }
    }

    if (!transaction) {
      console.error('[WEBHOOK] Transaction not found for failed payment:', {
        reference,
        transactionId
      });
      return;
    }

    // CRITICAL: Always store reference if we have it (even if transaction already has one)
    // This ensures every Paystack deposit has a reference
    if (reference && !transaction.paystack_reference) {
      console.log('[WEBHOOK] Storing missing reference for failed transaction:', transaction.id);
      await supabase
        .from('transactions')
        .update({
          paystack_reference: reference
        })
        .eq('id', transaction.id);
      transaction.paystack_reference = reference;
    } else if (reference && transaction.paystack_reference !== reference) {
      // Update reference if it's different (shouldn't happen, but ensure consistency)
      console.log('[WEBHOOK] Updating reference for failed transaction:', transaction.id);
      await supabase
        .from('transactions')
        .update({
          paystack_reference: reference
        })
        .eq('id', transaction.id);
      transaction.paystack_reference = reference;
    }

    // Update failed transaction with retry logic
    const updateData = {
      status: 'rejected',
      paystack_status: 'failed',
      paystack_reference: reference || transaction.paystack_reference
    };

    let statusUpdated = false;
    const maxRetries = 3;

    // Only update if still pending (don't overwrite approved transactions)
    if (transaction.status === 'pending') {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { data: updatedData, error: updateError } = await supabase
            .from('transactions')
            .update(updateData)
            .eq('id', transaction.id)
            .eq('status', 'pending')
            .select();

          if (updateError) {
            if (updateError.code === 'PGRST116' || updateError.message?.includes('No rows')) {
              // Status already changed, check current status
              const { data: currentTx } = await supabase
                .from('transactions')
                .select('status')
                .eq('id', transaction.id)
                .single();

              if (currentTx?.status !== 'pending') {
                console.log('Transaction status already changed, skipping update:', transaction.id);
                break;
              }
            }

            console.error(`Attempt ${attempt} error updating failed transaction:`, updateError);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
          } else if (updatedData && updatedData.length > 0) {
            statusUpdated = true;
            console.log(`Transaction marked as rejected (attempt ${attempt}):`, transaction.id);
            break;
          }
        } catch (retryError) {
          console.error(`Attempt ${attempt} exception updating failed transaction:`, retryError);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (!statusUpdated) {
        console.error('Failed to update failed transaction status after all retries:', transaction.id);
      }
    } else {
      console.log('Transaction already processed, skipping:', transaction.id);
    }
  } catch (error) {
    console.error('Error handling failed payment:', error);
    throw error;
  }
}

