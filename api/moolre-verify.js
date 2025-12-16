/**
 * Moolre Payment Verification Serverless Function
 * 
 * This function verifies a Moolre payment by checking the transaction status.
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
    const { reference } = req.body;

    // Validate required fields
    if (!reference) {
      return res.status(400).json({
        error: 'Missing required field: reference'
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

    // Verify payment with Moolre API
    const moolreResponse = await fetch('https://api.moolre.com/open/transact/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-USER': moolreApiUser,
        'X-API-PUBKEY': moolreApiPubkey
      },
      body: JSON.stringify({
        type: 1,
        idtype: 1, // 1 = Unique externalref, 2 = Moolre Generated ID
        id: reference, // The externalref to check
        accountnumber: moolreAccountNumber
      })
    });

    const moolreData = await moolreResponse.json();

    if (!moolreResponse.ok || moolreData.status === 0) {
      console.error('Moolre verification error:', moolreData);
      return res.status(moolreResponse.status || 500).json({
        success: false,
        error: moolreData.message || 'Failed to verify Moolre payment',
        code: moolreData.code,
        details: moolreData
      });
    }

    // Parse transaction status
    // txstatus: 1=Success, 0=Pending, 2=Failed
    const txstatus = moolreData.data?.txstatus;
    let status = 'pending';
    if (txstatus === 1) {
      status = 'success';
    } else if (txstatus === 2) {
      status = 'failed';
    }

    // Return verification result
    return res.status(200).json({
      success: true,
      status: status,
      txstatus: txstatus,
      data: moolreData.data,
      code: moolreData.code,
      message: moolreData.message,
      reference: moolreData.data?.externalref || reference
    });

  } catch (error) {
    console.error('Error verifying Moolre payment:', error);
    return res.status(500).json({
      error: 'Failed to verify payment',
      message: error.message
    });
  }
}
