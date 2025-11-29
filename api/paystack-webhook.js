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
      // Additional security: Check if request is from Paystack IP addresses
      // Paystack IPs: 52.31.139.75, 52.49.173.169, 52.214.14.220
      const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                       req.headers['x-real-ip'] || 
                       req.connection?.remoteAddress;
      
      const paystackIPs = ['52.31.139.75', '52.49.173.169', '52.214.14.220'];
      const isFromPaystackIP = clientIP && paystackIPs.includes(clientIP);

      console.error('Invalid webhook signature', {
        computedHash: hash.substring(0, 20) + '...',
        receivedSignature: signature ? signature.substring(0, 20) + '...' : 'missing',
        bodyType: typeof req.body,
        rawBodyLength: rawBody ? rawBody.length : 0,
        clientIP: clientIP,
        isFromPaystackIP: isFromPaystackIP,
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
      if (isFromPaystackIP && eventForVerification.data && eventForVerification.data.reference) {
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
              console.warn('WARNING: Signature verification failed but payment verified through API');
              // Continue processing - payment is legitimate
            } else {
              console.error('Fallback verification failed - payment not found or invalid');
              return res.status(401).json({ error: 'Invalid signature and payment verification failed' });
            }
          } else {
            console.error('Fallback verification failed - Paystack API error:', verifyResponse.status);
            console.warn('WARNING: Signature verification failed and API verification failed, but allowing due to Paystack IP');
          }
        } catch (apiError) {
          console.error('Error during fallback API verification:', apiError);
          console.warn('WARNING: Signature verification failed and API verification error, but allowing due to Paystack IP');
        }
      } else if (!isFromPaystackIP) {
        // Not from Paystack IP and signature invalid - reject
        console.error('Rejecting webhook: Invalid signature and not from Paystack IP');
        return res.status(401).json({ error: 'Invalid signature' });
      } else {
        // From Paystack IP but no reference for API verification
        console.warn('WARNING: Signature verification failed but allowing due to Paystack IP whitelist');
        console.warn('This is a security risk - consider fixing raw body access or using Edge Functions');
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
    } else {
      console.log('Unhandled webhook event:', event.event);
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

    console.log('Processing successful payment:', {
      reference,
      transactionId,
      userId,
      amount
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

    // If still not found, try by user_id and amount (last resort)
    if (!transaction && userId && amount) {
      const { data: txByUser, error: userError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'deposit')
        .eq('status', 'pending')
        .eq('amount', amount)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!userError && txByUser) {
        transaction = txByUser;
        console.log('Found transaction by user and amount:', transaction.id);
      }
    }

    if (!transaction) {
      console.error('Transaction not found for payment:', {
        reference,
        transactionId,
        userId,
        amount
      });
      return;
    }

    // Check if already processed
    if (transaction.status === 'approved') {
      console.log('Transaction already approved, skipping:', transaction.id);
      return;
    }

    // Update transaction status
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'approved',
        paystack_status: 'success',
        paystack_reference: reference || transaction.paystack_reference
      })
      .eq('id', transaction.id);

    if (updateError) {
      console.error('Error updating transaction:', updateError);
      throw updateError;
    }

    console.log('Transaction updated to approved:', transaction.id);

    // Update user balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', transaction.user_id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      throw profileError;
    }

    const newBalance = (profile.balance || 0) + transaction.amount;

    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', transaction.user_id);

    if (balanceError) {
      console.error('Error updating balance:', balanceError);
      throw balanceError;
    }

    console.log('User balance updated:', {
      userId: transaction.user_id,
      oldBalance: profile.balance,
      newBalance,
      amount: transaction.amount
    });
  } catch (error) {
    console.error('Error handling successful payment:', error);
    throw error;
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
      console.error('Transaction not found for failed payment:', {
        reference,
        transactionId
      });
      return;
    }

    // Only update if still pending
    if (transaction.status === 'pending') {
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'rejected',
          paystack_status: 'failed',
          paystack_reference: reference || transaction.paystack_reference
        })
        .eq('id', transaction.id)
        .eq('status', 'pending');

      if (updateError) {
        console.error('Error updating failed transaction:', updateError);
        throw updateError;
      }

      console.log('Transaction marked as rejected:', transaction.id);
    } else {
      console.log('Transaction already processed, skipping:', transaction.id);
    }
  } catch (error) {
    console.error('Error handling failed payment:', error);
    throw error;
  }
}

