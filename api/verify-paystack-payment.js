// Vercel Serverless Function to verify Paystack payment status
// This uses the Paystack secret key to verify payment status

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

    if (!reference) {
      return res.status(400).json({ 
        error: 'Missing required field: reference' 
      });
    }

    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ 
        error: 'Paystack secret key not configured. Set PAYSTACK_SECRET_KEY in Vercel environment variables.' 
      });
    }

    // Verify payment with Paystack API
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return res.status(response.status).json({ 
        error: errorData.message || errorData.error || 'Failed to verify payment' 
      });
    }

    const data = await response.json();
    
    // Check if payment was successful
    const isSuccessful = data.status && data.data && data.data.status === 'success';
    const amount = data.data?.amount ? data.data.amount / 100 : null; // Convert from pesewas to cedis
    const metadata = data.data?.metadata || {};
    
    return res.status(200).json({
      success: isSuccessful,
      status: data.data?.status || 'unknown',
      amount: amount,
      reference: data.data?.reference || reference,
      paid_at: data.data?.paid_at || null,
      customer: data.data?.customer || null,
      metadata: metadata,
      transaction_id: metadata.transaction_id || null // Extract transaction ID from metadata
    });
  } catch (error) {
    console.error('Paystack verification error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to verify payment' 
    });
  }
}

