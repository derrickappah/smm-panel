/**
 * Moolre List Transactions Serverless Function
 * 
 * This function fetches all transactions from Moolre API.
 * 
 * Environment Variables Required:
 * - MOOLRE_API_USER: Your Moolre username
 * - MOOLRE_API_PUBKEY: Your Moolre public API key
 * - MOOLRE_ACCOUNT_NUMBER: Your Moolre account number
 */

import { verifyAdmin } from './utils/auth.js';

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
    // Verify admin authentication
    try {
      await verifyAdmin(req);
    } catch (authError) {
      return res.status(401).json({
        error: 'Authentication required',
        message: authError.message
      });
    }

    const {
      startDate,
      endDate,
      status,
      limit = 100,
      offset = 0
    } = req.body;

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

    // Build request body for Moolre API
    const moolreRequest = {
      type: 1,
      accountnumber: moolreAccountNumber,
      ...(limit && { limit: limit }),
      ...(offset && { offset: offset }),
      ...(startDate && { startdate: startDate }),
      ...(endDate && { enddate: endDate }),
      ...(status && { status: status })
    };

    // Try multiple possible endpoints for listing transactions
    // Common patterns: /open/transact/list, /open/transact/query, /open/transact/history
    const possibleEndpoints = [
      'https://api.moolre.com/open/transact/list',
      'https://api.moolre.com/open/transact/query',
      'https://api.moolre.com/open/transact/history'
    ];

    let moolreResponse = null;
    let moolreData = null;
    let lastError = null;

    // Try each endpoint until one works
    for (const endpoint of possibleEndpoints) {
      try {
        console.log(`Trying Moolre endpoint: ${endpoint}`);
        moolreResponse = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-USER': moolreApiUser,
            'X-API-PUBKEY': moolreApiPubkey
          },
          body: JSON.stringify(moolreRequest)
        });

        moolreData = await moolreResponse.json();

        // If we get a successful response (status 200 and status field is 1 or data exists)
        if (moolreResponse.ok && (moolreData.status === 1 || moolreData.data || moolreData.transactions)) {
          console.log(`Successfully connected to Moolre endpoint: ${endpoint}`);
          break;
        } else {
          lastError = moolreData;
          console.log(`Endpoint ${endpoint} returned error:`, moolreData);
        }
      } catch (fetchError) {
        lastError = fetchError;
        console.error(`Error calling ${endpoint}:`, fetchError);
        continue;
      }
    }

    // If all endpoints failed, return error
    if (!moolreResponse || !moolreResponse.ok || (moolreData.status === 0 && !moolreData.data && !moolreData.transactions)) {
      console.error('All Moolre endpoints failed. Last error:', lastError);
      return res.status(moolreResponse?.status || 500).json({
        success: false,
        error: moolreData?.message || lastError?.message || 'Failed to fetch transactions from Moolre API',
        code: moolreData?.code,
        details: moolreData || lastError,
        note: 'Please verify the Moolre API endpoint for listing transactions. Common endpoints: /open/transact/list, /open/transact/query, /open/transact/history'
      });
    }

    // Parse response - handle different possible response formats
    let transactions = [];
    
    if (moolreData.data) {
      // If data is an array, use it directly
      if (Array.isArray(moolreData.data)) {
        transactions = moolreData.data;
      } 
      // If data is an object with transactions array
      else if (moolreData.data.transactions && Array.isArray(moolreData.data.transactions)) {
        transactions = moolreData.data.transactions;
      }
      // If data is an object with a list/items array
      else if (moolreData.data.list && Array.isArray(moolreData.data.list)) {
        transactions = moolreData.data.list;
      }
      // If data is a single transaction object, wrap it in array
      else if (moolreData.data.id || moolreData.data.externalref) {
        transactions = [moolreData.data];
      }
    } 
    // Check if transactions is at root level
    else if (moolreData.transactions && Array.isArray(moolreData.transactions)) {
      transactions = moolreData.transactions;
    }
    // Check if list is at root level
    else if (moolreData.list && Array.isArray(moolreData.list)) {
      transactions = moolreData.list;
    }

    // Map transactions to consistent format
    const formattedTransactions = transactions.map(tx => {
      // Parse transaction status
      // txstatus: 1=Success, 0=Pending, 2=Failed
      const txstatus = tx.txstatus !== undefined ? tx.txstatus : tx.status;
      let status = 'pending';
      if (txstatus === 1) {
        status = 'success';
      } else if (txstatus === 2) {
        status = 'failed';
      }

      return {
        id: tx.id || tx.transaction_id || tx.moolre_id,
        externalref: tx.externalref || tx.reference || tx.external_ref,
        amount: tx.amount || 0,
        currency: tx.currency || 'GHS',
        status: status,
        txstatus: txstatus,
        payer: tx.payer || tx.phone || tx.phone_number,
        channel: tx.channel || tx.channel_code,
        channelName: tx.channelName || getChannelName(tx.channel || tx.channel_code),
        created_at: tx.created_at || tx.createdAt || tx.date || tx.timestamp,
        updated_at: tx.updated_at || tx.updatedAt || tx.modified_at,
        message: tx.message,
        code: tx.code,
        raw: tx // Include raw data for debugging
      };
    });

    // Return formatted response
    return res.status(200).json({
      success: true,
      transactions: formattedTransactions,
      total: formattedTransactions.length,
      hasMore: formattedTransactions.length === limit,
      code: moolreData.code,
      message: moolreData.message,
      raw: moolreData // Include raw response for debugging
    });

  } catch (error) {
    console.error('Error fetching Moolre transactions:', error);
    return res.status(500).json({
      error: 'Failed to fetch transactions',
      message: error.message
    });
  }
}

/**
 * Get channel name from channel code
 * @param {number|string} channelCode - Channel code
 * @returns {string} - Channel name
 */
function getChannelName(channelCode) {
  const channelMap = {
    13: 'MTN',
    14: 'Vodafone',
    15: 'AirtelTigo',
    '13': 'MTN',
    '14': 'Vodafone',
    '15': 'AirtelTigo',
    'MTN': 'MTN',
    'VOD': 'Vodafone',
    'AT': 'AirtelTigo'
  };
  return channelMap[channelCode] || channelCode || 'Unknown';
}

