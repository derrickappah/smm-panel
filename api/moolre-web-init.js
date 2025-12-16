/**
 * Moolre Web Payment Initialization Serverless Function
 * 
 * This function initializes Moolre Web payments by creating a payment link
 * that redirects users to the Moolre web portal for payment completion.
 * 
 * Environment Variables Required:
 * - MOOLRE_API_USER: Your Moolre username
 * - MOOLRE_API_PUBKEY: Your Moolre public API key
 * - MOOLRE_ACCOUNT_NUMBER: Your Moolre account number
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      amount,
      currency = 'GHS',
      email,
      externalref,
      callback,
      redirect,
      reusable = '0',
      accountnumber,
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!amount || !email || !externalref) {
      return res.status(400).json({
        error: 'Missing required fields: amount, email, and externalref are required'
      });
    }

    // Get Moolre credentials from environment variables
    const moolreApiUser = process.env.MOOLRE_API_USER;
    const moolreApiPubkey = process.env.MOOLRE_API_PUBKEY;
    const moolreAccountNumber = accountnumber || process.env.MOOLRE_ACCOUNT_NUMBER;
    
    if (!moolreApiUser || !moolreApiPubkey || !moolreAccountNumber) {
      console.error('Moolre credentials are not configured');
      return res.status(500).json({
        error: 'Moolre is not configured on the server. Please contact support.'
      });
    }

    // Prepare the request to Moolre embed/link API
    const moolreRequest = {
      type: 1,
      amount: amount.toString(),
      email: email,
      externalref: externalref,
      callback: callback || '',
      redirect: redirect || '',
      reusable: reusable,
      currency: currency,
      accountnumber: moolreAccountNumber,
      metadata: metadata
    };

    // Make request to Moolre embed/link API
    const moolreResponse = await fetch('https://api.moolre.com/embed/link', {
      method: 'POST',
      headers: {
        'X-API-USER': moolreApiUser,
        'X-API-PUBKEY': moolreApiPubkey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(moolreRequest)
    });

    const moolreData = await moolreResponse.json();

    if (!moolreResponse.ok) {
      console.error('Moolre API error:', moolreData);
      return res.status(moolreResponse.status || 500).json({
        success: false,
        error: moolreData.message || moolreData.error || 'Failed to initialize Moolre Web payment',
        details: moolreData
      });
    }

    // Check if response contains a payment link
    const paymentLink = moolreData.link || moolreData.data?.link || moolreData.url || moolreData.data?.url;

    if (!paymentLink) {
      console.error('Moolre API response missing payment link:', moolreData);
      return res.status(500).json({
        success: false,
        error: 'Failed to get payment link from Moolre',
        details: moolreData
      });
    }

    // Return success response with payment link
    return res.status(200).json({
      success: true,
      payment_link: paymentLink,
      reference: externalref,
      data: moolreData
    });

  } catch (error) {
    console.error('Error initializing Moolre Web payment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to initialize payment',
      message: error.message
    });
  }
}
