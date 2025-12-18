import { verifyAuth } from './utils/auth.js';

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
    try {
      await verifyAuth(req);
    } catch (authError) {
      return res.status(401).json({
        error: 'Authentication required',
        message: authError.message
      });
    }
    const {
      amount,
      currency = 'GHS',
      reference,
      customer,
      notification_url,
      callback_url
    } = req.body;

    // Validate required fields
    if (!amount || !reference || !customer) {
      return res.status(400).json({
        error: 'Missing required fields: amount, reference, and customer are required'
      });
    }

    // Get Korapay secret key from environment variables
    const korapaySecretKey = process.env.KORAPAY_SECRET_KEY;

    if (!korapaySecretKey) {
      console.error('KORAPAY_SECRET_KEY is not configured');
      return res.status(500).json({
        error: 'Korapay is not configured on the server. Please contact support.'
      });
    }

    // Prepare the request to Korapay API
    // Note: Adjust the API endpoint and request structure based on Korapay's actual API documentation
    const korapayRequest = {
      amount: Math.round(amount * 100), // Convert to smallest currency unit (pesewas for GHS)
      currency: currency,
      reference: reference,
      customer: {
        name: customer.name || 'Customer',
        email: customer.email || ''
      },
      notification_url: notification_url || `${req.headers.origin || 'https://boostupgh.com'}/api/payment-callback/korapay`,
      callback_url: callback_url || `${req.headers.origin || 'https://boostupgh.com'}/payment/callback`
    };

    // Make request to Korapay API
    // Update the endpoint URL based on Korapay's actual API documentation
    const korapayResponse = await fetch('https://api.korapay.com/merchant/api/v1/charges/initialize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${korapaySecretKey}`,
        // Some APIs use different auth headers - adjust if needed
        // 'Authorization': `Bearer ${korapaySecretKey}`,
        // or
        // 'X-Korapay-Authorization': korapaySecretKey,
      },
      body: JSON.stringify(korapayRequest)
    });

    const korapayData = await korapayResponse.json();

    if (!korapayResponse.ok) {
      console.error('Korapay API error:', korapayData);
      return res.status(korapayResponse.status || 500).json({
        error: korapayData.message || 'Failed to initialize Korapay payment',
        details: korapayData
      });
    }

    // Return success response
    return res.status(200).json({
      success: true,
      data: korapayData,
      authorization_url: korapayData.data?.authorization_url || korapayData.authorization_url,
      reference: korapayData.data?.reference || korapayData.reference || reference
    });

  } catch (error) {
    console.error('Error initializing Korapay payment:', error);
    return res.status(500).json({
      error: 'Failed to initialize payment',
      message: error.message
    });
  }
}

