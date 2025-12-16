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

    console.log('Sending request to Moolre API:', {
      url: 'https://api.moolre.com/embed/link',
      request: {
        ...moolreRequest,
        accountnumber: moolreAccountNumber ? '***' : undefined
      },
      headers: {
        'X-API-USER': moolreApiUser ? '***' : undefined,
        'X-API-PUBKEY': moolreApiPubkey ? '***' : undefined
      }
    });

    // Make request to Moolre embed/link API
    let moolreResponse;
    try {
      moolreResponse = await fetch('https://api.moolre.com/embed/link', {
        method: 'POST',
        headers: {
          'X-API-USER': moolreApiUser,
          'X-API-PUBKEY': moolreApiPubkey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(moolreRequest)
      });
    } catch (fetchError) {
      console.error('Network error calling Moolre API:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to connect to Moolre API',
        message: fetchError.message
      });
    }

    let moolreData;
    try {
      const responseText = await moolreResponse.text();
      console.log('Raw Moolre API response text:', responseText);
      
      if (!responseText || responseText.trim() === '') {
        throw new Error('Empty response from Moolre API');
      }
      
      moolreData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Moolre API response:', parseError);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from Moolre API',
        message: parseError.message,
        status: moolreResponse.status,
        statusText: moolreResponse.statusText
      });
    }

    console.log('Moolre API response status:', moolreResponse.status);
    console.log('Moolre API response data:', JSON.stringify(moolreData, null, 2));

    // Check for Moolre error codes (similar to regular Moolre API)
    if (moolreData.code && moolreData.code !== '200' && !moolreData.code.startsWith('200')) {
      console.error('Moolre API error code:', moolreData.code, moolreData);
      return res.status(moolreResponse.status || 500).json({
        success: false,
        error: moolreData.message || moolreData.error || moolreData.msg || 'Failed to initialize Moolre Web payment',
        code: moolreData.code,
        details: moolreData
      });
    }

    if (!moolreResponse.ok) {
      console.error('Moolre API HTTP error:', moolreData);
      return res.status(moolreResponse.status || 500).json({
        success: false,
        error: moolreData.message || moolreData.error || moolreData.msg || 'Failed to initialize Moolre Web payment',
        details: moolreData
      });
    }

    // Check if response contains a payment link - try multiple possible response structures
    const paymentLink = moolreData.link || 
                       moolreData.data?.link || 
                       moolreData.url || 
                       moolreData.data?.url ||
                       moolreData.payment_link ||
                       moolreData.data?.payment_link ||
                       moolreData.paymentUrl ||
                       moolreData.data?.paymentUrl;

    if (!paymentLink) {
      console.error('Moolre API response missing payment link. Full response:', JSON.stringify(moolreData, null, 2));
      return res.status(500).json({
        success: false,
        error: 'Failed to get payment link from Moolre',
        details: moolreData,
        message: 'The Moolre API response did not contain a payment link. Please check the API response structure.'
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
