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

import { verifyAdmin, getServiceRoleClient } from './utils/auth.js';
import { createClient } from '@supabase/supabase-js';

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
    // Note: The account/status endpoint uses X-API-KEY (not X-API-PUBKEY)
    // But we support MOOLRE_API_PUBKEY for backward compatibility
    const moolreApiUser = process.env.MOOLRE_API_USER;
    const moolreApiKey = process.env.MOOLRE_API_KEY || process.env.MOOLRE_API_PUBKEY; // Support both for backward compatibility
    const moolreAccountNumber = process.env.MOOLRE_ACCOUNT_NUMBER;
    
    if (!moolreApiUser || !moolreApiKey || !moolreAccountNumber) {
      console.error('Moolre credentials are not configured');
      return res.status(500).json({
        error: 'Moolre is not configured on the server. Please contact support.',
        note: 'Required: MOOLRE_API_USER, MOOLRE_API_KEY (or MOOLRE_API_PUBKEY), MOOLRE_ACCOUNT_NUMBER'
      });
    }

    // Build request body for Moolre API - List Transactions endpoint
    // Documentation: https://docs.moolre.com/
    // Endpoint: POST https://api.moolre.com/open/account/status
    // type: 2 (required for list transactions)
    const moolreRequest = {
      type: 2, // Required: 2 for list transactions
      accountnumber: moolreAccountNumber,
      ...(limit && { limit: limit }),
      ...(startDate && { startdate: startDate }),
      ...(endDate && { enddate: endDate }),
      ...(status && { status: status }) // Filter by status if provided
    };

    // Use the correct Moolre endpoint for listing transactions
    const endpoint = 'https://api.moolre.com/open/account/status';

    try {
      console.log(`Fetching transactions from Moolre: ${endpoint}`);
      const moolreResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-USER': moolreApiUser,
          'X-API-KEY': moolreApiKey // Note: Uses X-API-KEY, not X-API-PUBKEY
        },
        body: JSON.stringify(moolreRequest)
      });

      // Check content-type before parsing JSON
      const contentType = moolreResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await moolreResponse.text();
        console.error(`Moolre API returned non-JSON response (${contentType || 'unknown'}):`, textResponse.substring(0, 200));
        return res.status(moolreResponse.status || 500).json({
          success: false,
          error: `Moolre API returned ${contentType || 'non-JSON'} response`,
          details: textResponse.substring(0, 500)
        });
      }

      const moolreData = await moolreResponse.json();

      // Check if request was successful
      if (!moolreResponse.ok || moolreData.status === 0) {
        console.error('Moolre API error:', moolreData);
        return res.status(moolreResponse.status || 500).json({
          success: false,
          error: moolreData.message || 'Failed to fetch transactions from Moolre API',
          code: moolreData.code,
          details: moolreData
        });
      }

      // Handle empty response (code: 200_EMPTY)
      if (moolreData.code === '200_EMPTY' || !moolreData.data || !moolreData.data.transactions) {
        return res.status(200).json({
          success: true,
          transactions: [],
          total: 0,
          hasMore: false,
          code: moolreData.code,
          message: moolreData.message || 'No transactions found'
        });
      }

      // Extract transactions from response
      // Response format: { status: 1, code: "ST08", data: { txcount: "1", transactions: [...] } }
      const transactions = moolreData.data.transactions || [];

      // Get Supabase client for database lookup
      const supabase = getServiceRoleClient();

      // Extract all externalrefs and transaction IDs for batch lookup
      const externalRefs = transactions
        .map(tx => tx.externalref || tx.reference || tx.external_ref)
        .filter(ref => ref && ref !== '0'); // Remove null/undefined and "0" values
      
      const transactionIds = transactions
        .map(tx => tx.transactionid || tx.id || tx.moolre_id)
        .filter(id => id); // Remove null/undefined

      // Batch lookup: Get user info for all transactions by matching moolre_reference and moolre_id
      let userInfoMap = {};
      
      // Try matching by moolre_reference first
      if (externalRefs.length > 0) {
        try {
          const { data: dbTransactions, error: dbError } = await supabase
            .from('transactions')
            .select(`
              moolre_reference,
              moolre_id,
              user_id,
              profiles!transactions_user_id_fkey (
                name,
                email
              )
            `)
            .in('moolre_reference', externalRefs);

          if (!dbError && dbTransactions) {
            console.log(`Found ${dbTransactions.length} transactions by moolre_reference`);
            // Create a map of externalref -> user info
            dbTransactions.forEach(dbTx => {
              if (dbTx.profiles) {
                if (dbTx.moolre_reference) {
                  userInfoMap[dbTx.moolre_reference] = {
                    username: dbTx.profiles.name || null,
                    email: dbTx.profiles.email || null
                  };
                }
                // Also map by moolre_id if available
                if (dbTx.moolre_id) {
                  userInfoMap[dbTx.moolre_id] = {
                    username: dbTx.profiles.name || null,
                    email: dbTx.profiles.email || null
                  };
                }
              }
            });
          } else if (dbError) {
            console.warn('Error fetching user info from database (by reference):', dbError);
          }
        } catch (lookupError) {
          console.warn('Error during user info lookup (by reference):', lookupError);
        }
      }

      // Also try matching by moolre_id (transactionid from Moolre API)
      if (transactionIds.length > 0) {
        try {
          const { data: dbTransactionsById, error: dbErrorById } = await supabase
            .from('transactions')
            .select(`
              moolre_reference,
              moolre_id,
              user_id,
              profiles!transactions_user_id_fkey (
                name,
                email
              )
            `)
            .in('moolre_id', transactionIds);

          if (!dbErrorById && dbTransactionsById) {
            console.log(`Found ${dbTransactionsById.length} transactions by moolre_id`);
            // Add to map using transactionid as key
            dbTransactionsById.forEach(dbTx => {
              if (dbTx.profiles && dbTx.moolre_id) {
                userInfoMap[dbTx.moolre_id] = {
                  username: dbTx.profiles.name || null,
                  email: dbTx.profiles.email || null
                };
              }
            });
          } else if (dbErrorById) {
            console.warn('Error fetching user info from database (by ID):', dbErrorById);
          }
        } catch (lookupError) {
          console.warn('Error during user info lookup (by ID):', lookupError);
        }
      }

      // Map transactions to consistent format
      // Moolre response format: { txstatus, txtype, accountnumber, payer, payee, amount, transactionid, externalref, thirdpartyref, ts }
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

        // Parse transaction type
        // txtype: 1=Payment, etc.
        const txtype = tx.txtype || tx.type;

        // Get externalref and transactionid for lookup
        const externalref = tx.externalref || tx.reference || tx.external_ref;
        const transactionid = tx.transactionid || tx.id || tx.moolre_id;
        
        // Get user info from map - try externalref first, then transactionid
        let userInfo = null;
        if (externalref && externalref !== '0') {
          userInfo = userInfoMap[externalref];
        }
        // If not found by externalref, try transactionid
        if (!userInfo && transactionid) {
          userInfo = userInfoMap[transactionid];
        }

        return {
          id: tx.transactionid || tx.id || tx.moolre_id,
          externalref: externalref,
          thirdpartyref: tx.thirdpartyref,
          amount: parseFloat(tx.amount || tx.value || 0),
          currency: 'GHS', // Moolre uses GHS by default
          status: status,
          txstatus: txstatus,
          txtype: txtype,
          payer: tx.payer || tx.phone || tx.phone_number,
          payee: tx.payee,
          accountnumber: tx.accountnumber,
          channel: tx.channel || tx.channel_code,
          channelName: tx.channelName || getChannelName(tx.channel || tx.channel_code),
          created_at: tx.ts || tx.created_at || tx.createdAt || tx.date || tx.timestamp,
          updated_at: tx.ts || tx.updated_at || tx.updatedAt || tx.modified_at,
          message: moolreData.message,
          code: moolreData.code,
          // Add username and email from database lookup
          username: userInfo?.username || null,
          email: userInfo?.email || null,
          raw: tx // Include raw data for debugging
        };
      });

      // Return formatted response
      return res.status(200).json({
        success: true,
        transactions: formattedTransactions,
        total: parseInt(moolreData.data.txcount || formattedTransactions.length, 10),
        hasMore: formattedTransactions.length === limit,
        code: moolreData.code,
        message: moolreData.message
      });

    } catch (fetchError) {
      console.error('Error calling Moolre API:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch transactions from Moolre API',
        message: fetchError.message
      });
    }

  } catch (error) {
    console.error('Error fetching Moolre transactions:', error);
    return res.status(500).json({
      error: 'Failed to fetch transactions',
      message: error.message
    });
  }
}

