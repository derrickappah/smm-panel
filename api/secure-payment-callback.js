/**
 * Secure Payment Callback Handler
 *
 * This endpoint handles payment callbacks from payment providers (Paystack, Korapay, etc.)
 * with proper signature verification. It automatically approves transactions server-side
 * without requiring frontend involvement.
 *
 * SECURITY FEATURES:
 * - HMAC signature verification for each payment provider
 * - IP whitelisting for additional security
 * - Automatic transaction approval with atomic operations
 * - No authentication required (webhook-based)
 * - Comprehensive logging and monitoring
 *
 * Environment Variables Required:
 * - PAYSTACK_SECRET_KEY: Paystack secret key
 * - KORAPAY_SECRET_KEY: Korapay secret key
 * - MOOLRE_SECRET_KEY: Moolre secret key
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key
 */

import * as crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Payment provider configurations
const PAYMENT_CONFIGS = {
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    signatureHeader: 'x-paystack-signature',
    allowedIPs: [
      '52.31.139.75', '52.49.173.169', '52.214.14.220',
      '35.176.52.254', '18.132.168.200', '35.177.139.201'
    ]
  },
  korapay: {
    secretKey: process.env.KORAPAY_SECRET_KEY,
    signatureHeader: 'x-korapay-signature',
    allowedIPs: [] // Add Korapay IP ranges if available
  },
  moolre: {
    secretKey: process.env.MOOLRE_SECRET_KEY,
    signatureHeader: 'x-moolre-signature',
    allowedIPs: [] // Add Moolre IP ranges if available
  }
};

// Disable automatic body parsing to get raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Verify webhook signature for a payment provider
 */
function verifyWebhookSignature(provider, rawBody, signature) {
  const config = PAYMENT_CONFIGS[provider];
  if (!config || !config.secretKey) {
    throw new Error(`Payment provider ${provider} not configured`);
  }

  const expectedSignature = crypto
    .createHmac('sha512', config.secretKey)
    .update(rawBody, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

/**
 * Verify request IP is from allowed payment provider IPs
 */
function verifyRequestIP(provider, clientIP) {
  const config = PAYMENT_CONFIGS[provider];
  if (!config) {
    return false;
  }

  // If no IP restrictions configured, skip check
  if (!config.allowedIPs || config.allowedIPs.length === 0) {
    return true;
  }

  return config.allowedIPs.includes(clientIP);
}

/**
 * Get raw body from request
 */
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      // Body already parsed by Vercel
      console.warn('Body already parsed by Vercel - reconstructing raw body');
      resolve(JSON.stringify(req.body));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

/**
 * Extract transaction details from webhook payload
 */
function extractTransactionDetails(provider, payload) {
  switch (provider) {
    case 'paystack':
      return {
        reference: payload.data?.reference,
        amount: payload.data?.amount ? payload.data.amount / 100 : null, // Convert from kobo
        status: payload.event === 'charge.success' ? 'success' : 'failed',
        customer: payload.data?.customer
      };

    case 'korapay':
      return {
        reference: payload.reference,
        amount: payload.amount,
        status: payload.status === 'success' ? 'success' : 'failed',
        customer: payload.customer
      };

    case 'moolre':
      return {
        reference: payload.reference,
        amount: payload.amount,
        status: payload.status === 'success' ? 'success' : 'failed',
        customer: payload.customer
      };

    default:
      throw new Error(`Unsupported payment provider: ${provider}`);
  }
}

/**
 * Find and validate transaction by reference
 */
async function findTransactionByReference(supabase, provider, reference, amount = null) {
  if (!reference) {
    throw new Error('No reference provided in webhook');
  }

  // First try exact reference match
  let query = supabase
    .from('transactions')
    .select('id, user_id, amount, status, type, deposit_method')
    .eq('type', 'deposit')
    .eq('status', 'pending');

  // Use provider-specific reference field
  switch (provider) {
    case 'paystack':
      query = query.eq('paystack_reference', reference);
      break;
    case 'korapay':
      query = query.eq('korapay_reference', reference);
      break;
    case 'moolre':
    case 'moolre_web':
      query = query.eq('moolre_reference', reference);
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  const { data: transactions, error } = await query.limit(1);

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  if (transactions && transactions.length > 0) {
    return transactions[0];
  }

  // If no exact reference match and amount provided, try amount + time window fallback
  // But ONLY if amount is provided and within reasonable time window
  if (amount && provider === 'paystack') {
    console.warn(`No exact reference match for ${reference}, trying amount fallback`);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const { data: amountMatches, error: amountError } = await supabase
      .from('transactions')
      .select('id, user_id, amount, status, type, deposit_method, created_at')
      .eq('type', 'deposit')
      .eq('status', 'pending')
      .eq('deposit_method', provider)
      .eq('amount', amount)
      .gte('created_at', twoHoursAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (amountError) {
      console.error('Amount fallback query error:', amountError);
    } else if (amountMatches && amountMatches.length > 0) {
      console.warn(`Found transaction by amount fallback: ${amountMatches[0].id}`);
      return amountMatches[0];
    }
  }

  return null;
}

export default async function handler(req, res) {
  // Enable CORS but restrict methods
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Signature');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);
    const payload = JSON.parse(rawBody);

    // Extract payment provider from headers or payload
    const provider = req.headers['x-payment-provider'] || payload.provider || 'paystack';

    if (!PAYMENT_CONFIGS[provider]) {
      return res.status(400).json({ error: `Unsupported payment provider: ${provider}` });
    }

    // Verify webhook signature
    const signature = req.headers[PAYMENT_CONFIGS[provider].signatureHeader];
    if (!signature) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    let signatureValid = false;
    try {
      signatureValid = verifyWebhookSignature(provider, rawBody, signature);
    } catch (sigError) {
      console.error('Signature verification error:', sigError);
    }

    // Verify IP address if signature verification is available
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers['x-real-ip'] ||
                     req.connection?.remoteAddress ||
                     req.socket?.remoteAddress;

    const ipValid = verifyRequestIP(provider, clientIP);

    // Require BOTH signature verification AND IP validation for maximum security
    if (!signatureValid || !ipValid) {
      console.error(`Webhook verification failed for ${provider}:`, {
        signatureValid,
        ipValid,
        clientIP,
        provider
      });
      return res.status(401).json({
        error: 'Webhook verification failed',
        signature_valid: signatureValid,
        ip_valid: ipValid
      });
    }

    // Extract transaction details from webhook
    const transactionDetails = extractTransactionDetails(provider, payload);

    if (!transactionDetails.reference) {
      return res.status(400).json({ error: 'No transaction reference in webhook' });
    }

    // Create Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Find the transaction
    const transaction = await findTransactionByReference(
      supabase,
      provider,
      transactionDetails.reference,
      transactionDetails.amount
    );

    if (!transaction) {
      console.error(`Transaction not found for reference: ${transactionDetails.reference}`);
      return res.status(404).json({
        error: 'Transaction not found',
        reference: transactionDetails.reference
      });
    }

    // Only process successful payments
    if (transactionDetails.status !== 'success') {
      console.log(`Payment failed for transaction ${transaction.id}, status: ${transactionDetails.status}`);
      return res.status(200).json({
        success: false,
        message: 'Payment not successful',
        transaction_id: transaction.id,
        status: transactionDetails.status
      });
    }

    // CRITICAL SECURITY: Validate that the gateway amount matches the transaction amount
    // This prevents client-side amount manipulation attacks
    const gatewayAmount = transactionDetails.amount;
    const storedAmount = parseFloat(transaction.amount || 0);

    if (!gatewayAmount) {
      console.error(`No amount provided in ${provider} webhook for transaction ${transaction.id}`);
      return res.status(400).json({
        error: 'Invalid webhook: missing payment amount',
        transaction_id: transaction.id
      });
    }

    // Allow small floating-point tolerance (0.01) for currency conversion precision
    const tolerance = 0.01;
    const amountsMatch = Math.abs(gatewayAmount - storedAmount) < tolerance;

    if (!amountsMatch) {
      console.error(`SECURITY ALERT: Amount mismatch detected for transaction ${transaction.id}:`, {
        stored_amount: storedAmount,
        gateway_amount: gatewayAmount,
        difference: Math.abs(gatewayAmount - storedAmount),
        provider: provider,
        reference: transactionDetails.reference,
        user_id: transaction.user_id,
        timestamp: new Date().toISOString()
      });

      // SECURITY DECISION: Reject the transaction if amounts don't match
      // This prevents hackers from manipulating client-side amounts to get more than they paid
      // Example: User requests 15 Cedis but payment gateway only processes 10 Pesewas (0.1 Cedis)
      // System will reject and user gets neither amount - must contact support for manual review

      const { error: rejectError } = await supabase
        .from('transactions')
        .update({
          status: 'rejected',
          [`${provider}_status`]: 'amount_mismatch_detected',
          [`${provider}_reference`]: transactionDetails.reference
        })
        .eq('id', transaction.id);

      if (rejectError) {
        console.error('Failed to reject transaction with amount mismatch:', rejectError);
      }

      // Log security event for monitoring
      console.warn(`SECURITY: Transaction ${transaction.id} rejected due to amount mismatch. User ${transaction.user_id} may have attempted client-side manipulation.`);

      return res.status(400).json({
        error: 'Payment amount verification failed',
        message: 'The payment amount does not match the requested transaction amount. Transaction has been rejected for security reasons. Please contact support if you believe this is an error.',
        transaction_id: transaction.id,
        action_required: 'contact_support',
        support_message: 'Please provide your transaction ID to support for manual review.'
      });
    }

    // Amounts match - log successful verification
    console.log(`Amount verification successful for transaction ${transaction.id}: ${gatewayAmount} ${provider}`);

    // Amounts match - proceed with approval
    console.log(`Amount verification successful for transaction ${transaction.id}: ${gatewayAmount} ${provider}`);

    // Approve the transaction using the atomic database function
    const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction_universal', {
      p_transaction_id: transaction.id,
      p_payment_method: provider,
      p_payment_status: 'success',
      p_payment_reference: transactionDetails.reference
    });

    if (rpcError) {
      console.error('Database function error:', rpcError);
      return res.status(500).json({
        error: 'Failed to approve transaction',
        details: rpcError.message || rpcError.code,
        transaction_id: transaction.id
      });
    }

    const approvalResult = result && result.length > 0 ? result[0] : null;

    if (!approvalResult || !approvalResult.success) {
      return res.status(400).json({
        error: 'Transaction approval failed',
        message: approvalResult?.message || 'Unknown error',
        transaction_id: transaction.id
      });
    }

    console.log(`Successfully approved transaction ${transaction.id} via ${provider} webhook`);

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      transaction_id: transaction.id,
      amount: transaction.amount,
      provider: provider,
      reference: transactionDetails.reference,
      new_balance: approvalResult.new_balance
    });

  } catch (error) {
    console.error('Error in secure payment callback:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}