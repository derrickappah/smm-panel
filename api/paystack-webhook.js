/**
 * Paystack Webhook Handler
 * 
 * This function handles webhook events from Paystack for real-time payment status updates.
 * It verifies the webhook signature and updates transaction status automatically.
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
    // Paystack signs the exact raw body string, so we must use the unparsed body
    // In Vercel serverless functions, we need to read raw body before it's parsed
    let rawBody;
    
    // Try to get raw body from request stream
    // Vercel may have already parsed it, so we check both scenarios
    if (req.body && typeof req.body === 'string') {
      // Body is still a string (raw, not parsed)
      rawBody = req.body;
    } else if (req.body && typeof req.body === 'object') {
      // Body is already parsed by Vercel
      // Reconstruct JSON string - this may not match Paystack's exact format
      // but should work if Paystack uses standard JSON formatting
      rawBody = JSON.stringify(req.body);
    } else {
      // No body or unexpected type
      console.error('Unexpected body type:', typeof req.body);
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // Verify webhook signature using raw body
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest('hex');

    const signature = req.headers['x-paystack-signature'];

    if (hash !== signature) {
      console.error('Invalid webhook signature', {
        computedHash: hash.substring(0, 20) + '...',
        receivedSignature: signature ? signature.substring(0, 20) + '...' : 'missing',
        bodyType: typeof req.body,
        rawBodyLength: rawBody ? rawBody.length : 0
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse webhook event
    const event = typeof rawBody === 'string' && rawBody ? JSON.parse(rawBody) : req.body;
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

