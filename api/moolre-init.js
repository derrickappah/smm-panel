import { verifyAuth } from './utils/auth.js';
import { logUserAction } from './utils/activityLogger.js';

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
    // Authenticate user
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
    const {
      amount,
      currency = 'GHS',
      payer,
      reference,
      channel,
      otpcode
    } = req.body;

    // Validate required fields
    if (!amount || !payer || !reference || !channel) {
      return res.status(400).json({
        error: 'Missing required fields: amount, payer, reference, and channel are required'
      });
    }

    // Get Moolre credentials from environment variables
    const moolreApiUser = process.env.MOOLRE_API_USER;
    const moolreApiPubkey = process.env.MOOLRE_API_PUBKEY;
    const moolreAccountNumber = process.env.MOOLRE_ACCOUNT_NUMBER;

    if (!moolreApiUser || !moolreApiPubkey || !moolreAccountNumber) {
      console.error('Moolre credentials are not configured');
      return res.status(500).json({
        error: 'Moolre is not configured on the server. Please contact support.'
      });
    }

    // Prepare the request to Moolre API
    const moolreRequest = {
      type: 1,
      channel: channel, // MTN, AT (AirtelTigo), or Vodafone
      currency: currency,
      payer: payer, // Mobile Money number (e.g., 0209151872)
      amount: amount.toString(), // Amount as string
      externalref: reference, // Unique reference for this transaction
      accountnumber: moolreAccountNumber,
      reference: reference, // Optional reference message
      ...(otpcode && { otpcode: otpcode }) // Include OTP if provided
    };

    // Make request to Moolre API
    const moolreResponse = await fetch('https://api.moolre.com/open/transact/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-USER': moolreApiUser,
        'X-API-PUBKEY': moolreApiPubkey
      },
      body: JSON.stringify(moolreRequest)
    });

    const moolreData = await moolreResponse.json();

    // Handle Moolre response codes
    if (moolreData.code === 'TP14') {
      // OTP required
      return res.status(200).json({
        success: false,
        requiresOtp: true,
        code: 'TP14',
        message: moolreData.message || 'Please complete the verification process sent to you via SMS and try again.',
        data: moolreData.data
      });
    }

    if (moolreData.code === '200_OTP_SUCCESS') {
      // OTP verified successfully, can proceed with payment
      return res.status(200).json({
        success: true,
        requiresOtp: false,
        otpVerified: true,
        code: '200_OTP_SUCCESS',
        message: moolreData.message || 'Phone number verification was successful. You can now re-initiate the request to trigger the payment prompt.',
        data: moolreData.data
      });
    }

    if (moolreData.code === '200_PAYMENT_REQ') {
      // Payment prompt sent successfully
      // Log payment initiation
      await logUserAction({
        user_id: user.id,
        action_type: 'payment_initiated',
        entity_type: 'transaction',
        description: `Moolre payment initiated: ${amount} ${currency}`,
        metadata: {
          amount,
          currency,
          reference,
          channel,
          payment_method: 'moolre',
          code: '200_PAYMENT_REQ'
        },
        req
      });
      
      return res.status(200).json({
        success: true,
        requiresOtp: false,
        code: '200_PAYMENT_REQ',
        message: moolreData.message || 'The payment prompt has been sent to the customer for approval.',
        data: moolreData.data,
        reference: reference
      });
    }

    if (moolreData.status === 0 || moolreResponse.status !== 200) {
      // Error response
      console.error('Moolre API error:', moolreData);
      return res.status(moolreResponse.status || 500).json({
        success: false,
        error: moolreData.message || 'Failed to initialize Moolre payment',
        code: moolreData.code,
        details: moolreData
      });
    }

    // Return success response
    return res.status(200).json({
      success: true,
      data: moolreData,
      code: moolreData.code,
      message: moolreData.message,
      reference: reference
    });

  } catch (error) {
    console.error('Error initializing Moolre payment:', error);
    return res.status(500).json({
      error: 'Failed to initialize payment',
      message: error.message
    });
  }
}
