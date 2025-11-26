/**
 * Korapay Payment Verification Serverless Function
 * 
 * This function verifies a Korapay payment by checking the transaction status.
 * 
 * Environment Variables Required:
 * - KORAPAY_SECRET_KEY: Your Korapay secret key (starts with sk_)
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
    const { reference } = req.body;

    // Validate required fields
    if (!reference) {
      return res.status(400).json({
        error: 'Missing required field: reference'
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

    // Verify payment with Korapay API
    const korapayResponse = await fetch(`https://api.korapay.com/merchant/api/v1/charges/${reference}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${korapaySecretKey}`
      }
    });

    const korapayData = await korapayResponse.json();

    if (!korapayResponse.ok) {
      console.error('Korapay verification error:', korapayData);
      return res.status(korapayResponse.status || 500).json({
        error: korapayData.message || 'Failed to verify Korapay payment',
        details: korapayData
      });
    }

    // Return verification result
    return res.status(200).json({
      success: true,
      data: korapayData,
      status: korapayData.data?.status || korapayData.status,
      reference: korapayData.data?.reference || korapayData.reference || reference
    });

  } catch (error) {
    console.error('Error verifying Korapay payment:', error);
    return res.status(500).json({
      error: 'Failed to verify payment',
      message: error.message
    });
  }
}

