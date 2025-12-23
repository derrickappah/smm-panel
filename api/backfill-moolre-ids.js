/**
 * Backfill moolre_id for existing Moolre transactions
 * 
 * This function queries Moolre API for each transaction that has moolre_reference
 * but is missing moolre_id, and updates the database with the transactionid.
 * 
 * This should be run periodically or as a one-time migration.
 * 
 * Environment Variables Required:
 * - MOOLRE_API_USER: Your Moolre username
 * - MOOLRE_API_PUBKEY: Your Moolre public API key
 * - MOOLRE_ACCOUNT_NUMBER: Your Moolre account number
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
 */

import { verifyAdmin, getServiceRoleClient } from './utils/auth.js';

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

    const { limit = 100, dryRun = false } = req.body;

    // Get Supabase client
    const supabase = getServiceRoleClient();

    // Get Moolre credentials
    const moolreApiUser = process.env.MOOLRE_API_USER;
    const moolreApiPubkey = process.env.MOOLRE_API_PUBKEY;
    const moolreAccountNumber = process.env.MOOLRE_ACCOUNT_NUMBER;

    if (!moolreApiUser || !moolreApiPubkey || !moolreAccountNumber) {
      return res.status(500).json({
        error: 'Moolre credentials are not configured'
      });
    }

    // Get transactions that need backfilling
    const { data: transactions, error: txError } = await supabase
      .rpc('get_transactions_needing_moolre_id_backfill');

    if (txError) {
      console.error('Error fetching transactions:', txError);
      return res.status(500).json({
        error: 'Failed to fetch transactions',
        details: txError.message
      });
    }

    if (!transactions || transactions.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No transactions need backfilling',
        updated: 0,
        failed: 0,
        skipped: 0
      });
    }

    console.log(`Found ${transactions.length} transactions to backfill`);

    const results = {
      updated: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    // Process each transaction
    for (const transaction of transactions) {
      if (!transaction.moolre_reference) {
        results.skipped++;
        continue;
      }

      try {
        // Verify transaction with Moolre API
        const moolreResponse = await fetch('https://api.moolre.com/open/transact/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-USER': moolreApiUser,
            'X-API-PUBKEY': moolreApiPubkey
          },
          body: JSON.stringify({
            type: 1,
            idtype: 1, // 1 = Unique externalref
            id: transaction.moolre_reference,
            accountnumber: moolreAccountNumber
          })
        });

        const moolreData = await moolreResponse.json();

        if (!moolreResponse.ok || moolreData.status === 0) {
          console.warn(`Failed to verify transaction ${transaction.id}:`, moolreData.message);
          results.failed++;
          results.errors.push({
            transaction_id: transaction.id,
            error: moolreData.message || 'Moolre API error'
          });
          continue;
        }

        // Extract moolre_id from response
        const moolreId = moolreData.data?.id || 
                        moolreData.data?.transactionid || 
                        moolreData.data?.transaction_id;

        if (!moolreId) {
          console.warn(`No moolre_id found in response for transaction ${transaction.id}`);
          results.skipped++;
          continue;
        }

        // Update transaction if not dry run
        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('transactions')
            .update({ moolre_id: String(moolreId) })
            .eq('id', transaction.id);

          if (updateError) {
            console.error(`Error updating transaction ${transaction.id}:`, updateError);
            results.failed++;
            results.errors.push({
              transaction_id: transaction.id,
              error: updateError.message
            });
            continue;
          }
        }

        results.updated++;
        console.log(`Updated transaction ${transaction.id} with moolre_id: ${moolreId}`);

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing transaction ${transaction.id}:`, error);
        results.failed++;
        results.errors.push({
          transaction_id: transaction.id,
          error: error.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: dryRun 
        ? `Dry run completed. Would update ${results.updated} transactions.`
        : `Backfill completed. Updated ${results.updated} transactions.`,
      results: {
        total: transactions.length,
        updated: results.updated,
        failed: results.failed,
        skipped: results.skipped,
        errors: results.errors.slice(0, 10) // Limit errors in response
      }
    });

  } catch (error) {
    console.error('Error in backfill:', error);
    return res.status(500).json({
      error: 'Failed to backfill moolre_id',
      message: error.message
    });
  }
}

