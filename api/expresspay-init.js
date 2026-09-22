import { verifyAuth, getServiceRoleClient } from './utils/auth.js';
import { setCorsHeaders } from './utils/corsHeaders.js';
import { rateLimit } from './middleware/rateLimit.js';
import { getExpressPayConfig } from './utils/expresspayConfig.js';
import { logUserAction, logSecurityEvent } from './utils/activityLogger.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Velocity Control / Rate Limiting
    const limitCheck = await rateLimit(req, res);
    if (limitCheck?.blocked) {
      return res.status(429).json({ error: limitCheck.message || 'Too many deposit attempts. Please wait a moment.' });
    }

    // 2. Authenticate User
    let user;
    try {
      const authResult = await verifyAuth(req);
      user = authResult.user;
    } catch (authError) {
      return res.status(401).json({
        error: 'Authentication required',
        message: authError.message
      });
    }

    const { amount, phone_number } = req.body;

    // 3. Amount Validation
    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      return res.status(400).json({ error: 'Invalid deposit amount' });
    }

    const supabase = getServiceRoleClient();

    // 4. Check if user is banned
    const { data: bannedUser } = await supabase
      .from('banned_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (bannedUser) {
      await logSecurityEvent({
        action_type: 'BANNED_USER_DEPOSIT_ATTEMPT',
        description: `Banned user ${user.id} attempted to initiate expressPay deposit`,
        metadata: { user_id: user.id, amount: depositAmount },
        req
      });
      return res.status(403).json({ error: 'Account suspended. Deposits are disabled.' });
    }

    // 5. Load expressPay configuration
    const config = await getExpressPayConfig(supabase);

    if (!config.isEnabled) {
      return res.status(400).json({ error: 'expressPay payment method is currently disabled' });
    }

    if (depositAmount < config.minDeposit) {
      return res.status(400).json({
        error: `Minimum deposit amount for expressPay is ₵${config.minDeposit.toFixed(2)}`,
        min_amount: config.minDeposit
      });
    }

    if (depositAmount > 5000) {
      return res.status(400).json({
        error: 'Maximum deposit amount for expressPay is ₵5,000.00',
        max_amount: 5000
      });
    }

    // 6. Fetch user profile for metadata
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email, phone_number')
      .eq('id', user.id)
      .maybeSingle();

    const fullName = profile?.name || user.user_metadata?.full_name || 'Customer User';
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = (nameParts[0] || 'Customer').substring(0, 32);
    const lastName = (nameParts.slice(1).join(' ') || 'User').substring(0, 64);
    const email = profile?.email || user.email || 'customer@boostupgh.com';
    const userPhone = phone_number || profile?.phone_number || '0240000000';

    // Convenience fee: flat ₵0.50 added to charged amount
    const convenienceFee = 0.50;
    const totalCharged = (depositAmount + convenienceFee).toFixed(2);

    // Generate unique order ID (max length 64 chars)
    const orderId = `EXP_${Date.now()}_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // 7. Create pending transaction in database
    const { data: transaction, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: depositAmount, // Exact amount credited to balance
        type: 'deposit',
        status: 'pending',
        deposit_method: 'expresspay',
        payment_method: 'expresspay',
        expresspay_order_id: orderId
      })
      .select('id, amount, status, deposit_method, created_at')
      .single();

    if (insertError) {
      console.error('[expressPay Init] Failed to create transaction:', insertError);
      return res.status(500).json({ 
        error: 'Failed to record deposit transaction', 
        details: insertError.message || insertError 
      });
    }

    // Determine host origin for callbacks
    let origin = req.headers.origin || req.headers['x-forwarded-host'] || 'https://boostupgh.com';
    if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
      origin = `https://${origin}`;
    }

    const redirectUrl = `${origin}/payment/callback?method=expresspay`;
    const postUrl = `${origin}/api/expresspay-callback`;

    // 8. Prepare expressPay Submit API payload (application/x-www-form-urlencoded)
    const submitParams = new URLSearchParams();
    submitParams.append('merchant-id', config.merchantId);
    submitParams.append('api-key', config.apiKey);
    submitParams.append('firstname', firstName);
    submitParams.append('lastname', lastName);
    submitParams.append('email', email);
    submitParams.append('phonenumber', userPhone);
    submitParams.append('username', email);
    submitParams.append('accountnumber', '001'); // max-length: 3
    submitParams.append('currency', 'GHS');
    submitParams.append('amount', totalCharged);
    submitParams.append('order-id', orderId);
    submitParams.append('order-desc', `BoostUpGH Balance Deposit (₵${depositAmount.toFixed(2)})`);
    submitParams.append('redirect-url', redirectUrl);
    submitParams.append('post-url', postUrl);

    console.log('[expressPay Init] Calling Submit API:', {
      url: config.submitUrl,
      orderId,
      amount: totalCharged,
      redirectUrl,
      postUrl
    });

    const expressPayRes = await fetch(config.submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: submitParams.toString()
    });

    const responseText = await expressPayRes.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[expressPay Init] Invalid response format from expressPay:', responseText);
      await supabase
        .from('transactions')
        .update({ status: 'failed', expresspay_status: 'Gateway Response Error' })
        .eq('id', transaction.id);
      return res.status(502).json({ error: 'expressPay gateway returned an invalid response' });
    }

    console.log('[expressPay Init] expressPay Submit response:', data);

    // Status: 1 = Success, 2 = Invalid Credentials, 3 = Invalid Request, 4 = Invalid IP
    if (data.status === 1 && data.token) {
      // Store returned token on transaction
      await supabase
        .from('transactions')
        .update({
          expresspay_token: data.token,
          expresspay_status: 'Token Issued'
        })
        .eq('id', transaction.id);

      await logUserAction({
        userId: user.id,
        action: 'INITIATE_EXPRESSPAY_DEPOSIT',
        details: {
          transaction_id: transaction.id,
          order_id: orderId,
          amount: depositAmount,
          total_charged: totalCharged,
          token: data.token
        }
      });

      const checkoutUrl = `${config.checkoutUrl}${data.token}`;

      return res.status(200).json({
        success: true,
        token: data.token,
        checkout_url: checkoutUrl,
        order_id: orderId,
        transaction_id: transaction.id,
        amount: depositAmount,
        total_charged: parseFloat(totalCharged)
      });
    } else {
      let errorMessage = data.message || `expressPay initialization failed (status code: ${data.status})`;
      if (data.status === 4) {
        errorMessage = `expressPay IP error: ${data.message || 'IP address not whitelisted'}. Please contact expressPay (integration@expresspaygh.com) to whitelist your server IP.`;
      }
      console.error('[expressPay Init] expressPay Submit failed:', data);

      await supabase
        .from('transactions')
        .update({
          status: 'failed',
          expresspay_status: `Failed: ${data.status} - ${errorMessage}`
        })
        .eq('id', transaction.id);

      return res.status(400).json({
        error: errorMessage,
        status_code: data.status
      });
    }
  } catch (error) {
    console.error('[expressPay Init] Internal Server Error:', error);
    return res.status(500).json({
      error: 'Failed to initiate expressPay deposit. Please try again or contact support.'
    });
  }
}
