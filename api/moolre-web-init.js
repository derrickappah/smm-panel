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

    // POS09 code indicates successful payment link generation
    const isSuccessCode = moolreData.code === 'POS09' || 
                         moolreData.code === '200' || 
                         moolreData.code?.startsWith('200');

    // Check for Moolre error codes (similar to regular Moolre API)
    // But exclude POS09 which is actually a success code
    if (moolreData.code && !isSuccessCode) {
      console.error('Moolre API error code:', moolreData.code, moolreData);
      return res.status(moolreResponse.status || 500).json({
        success: false,
        error: moolreData.message || moolreData.error || moolreData.msg || 'Failed to initialize Moolre Web payment',
        code: moolreData.code,
        details: moolreData
      });
    }

    if (!moolreResponse.ok && !isSuccessCode) {
      console.error('Moolre API HTTP error:', moolreData);
      return res.status(moolreResponse.status || 500).json({
        success: false,
        error: moolreData.message || moolreData.error || moolreData.msg || 'Failed to initialize Moolre Web payment',
        details: moolreData
      });
    }

    // Check if response contains a payment link - try multiple possible response structures
    // Also check in details object for POS09 responses
    const paymentLink = moolreData.link || 
                       moolreData.data?.link || 
                       moolreData.details?.link ||
                       moolreData.url || 
                       moolreData.data?.url ||
                       moolreData.details?.url ||
                       moolreData.payment_link ||
                       moolreData.data?.payment_link ||
                       moolreData.details?.payment_link ||
                       moolreData.paymentUrl ||
                       moolreData.data?.paymentUrl ||
                       moolreData.details?.paymentUrl ||
                       moolreData.pos_link ||
                       moolreData.data?.pos_link ||
                       moolreData.details?.pos_link;

    if (!paymentLink) {
      // If POS09 code indicates success but no link found, log the full structure for debugging
      if (isSuccessCode) {
        console.warn('POS09 success code but payment link not found in expected fields. Full response:', JSON.stringify(moolreData, null, 2));
        // Try to extract from nested structures
        const nestedLink = moolreData.details?.data?.link || 
                         moolreData.details?.data?.url ||
                         moolreData.details?.data?.payment_link ||
                         moolreData.data?.details?.link ||
                         moolreData.data?.details?.url;
        
        if (nestedLink) {
          console.log('Found payment link in nested structure:', nestedLink);
          return res.status(200).json({
            success: true,
            payment_link: nestedLink,
            reference: externalref,
            code: moolreData.code,
            data: moolreData
          });
        }
      }
      
      console.error('Moolre API response missing payment link. Full response:', JSON.stringify(moolreData, null, 2));
      return res.status(500).json({
        success: false,
        error: isSuccessCode ? 'Payment link generated but not found in response' : 'Failed to get payment link from Moolre',
        code: moolreData.code,
        details: moolreData,
        message: 'The Moolre API response did not contain a payment link. Please check the API response structure.'
      });
    }

    // Return success response with payment link
    return res.status(200).json({
      success: true,
      payment_link: paymentLink,
      reference: externalref,
      code: moolreData.code,
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
