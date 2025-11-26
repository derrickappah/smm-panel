/**
 * Korapay Payment Callback Handler
 * 
 * This function handles the callback from Korapay after payment completion.
 * It verifies the payment and updates the transaction status.
 * 
 * Environment Variables Required:
 * - KORAPAY_SECRET_KEY: Your Korapay secret key (starts with sk_)
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get reference from query params (for redirect) or body (for webhook)
    const reference = req.query.reference || req.body.reference;

    if (!reference) {
      return res.status(400).json({
        error: 'Missing required field: reference'
      });
    }

    // Verify payment with Korapay
    const verifyResponse = await fetch('/api/korapay-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reference })
    });

    const verifyData = await verifyResponse.json();

    if (!verifyData.success) {
      return res.status(400).json({
        error: verifyData.error || 'Payment verification failed'
      });
    }

    // Return verification result
    // The frontend will handle updating the transaction and balance
    return res.status(200).json({
      success: true,
      status: verifyData.status,
      reference: verifyData.reference,
      data: verifyData.data
    });

  } catch (error) {
    console.error('Error handling Korapay callback:', error);
    return res.status(500).json({
      error: 'Failed to process callback',
      message: error.message
    });
  }
}

