import { verifyAuth, getServiceRoleClient } from '../../utils/auth.js';
import { logUserAction } from '../../utils/activityLogger.js';

/**
 * Hubtel Transaction Status Check API
 * 
 * This endpoint allows users (or the system) to manually check the status
 * of a Hubtel transaction if the callback was missed.
 * 
 * Documentation: https://developers.hubtel.com/docs/check-transaction-status
 */
export default async function handler(req, res) {
    // Enable CORS
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://boostupgh.com',
        'https://www.boostupgh.com',
        'http://localhost:3000'
    ];

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', 'https://boostupgh.com');
    }

    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Authenticate user
        const { user } = await verifyAuth(req);
        const { clientReference } = req.body;

        if (!clientReference) {
            return res.status(400).json({ error: 'Missing clientReference' });
        }

        const supabase = getServiceRoleClient();

        // 1. Fetch transaction from DB to verify ownership and current status
        const { data: transaction, error: fetchError } = await supabase
            .from('transactions')
            .select('*')
            .eq('client_reference', clientReference)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // If already paid, return early
        if (transaction.status === 'Paid' || transaction.status === 'approved') {
            return res.status(200).json({
                success: true,
                status: transaction.status,
                message: 'Transaction is already completed'
            });
        }

        // 2. Prepare Hubtel API credentials
        const clientId = (process.env.HUBTEL_API_ID || process.env.HUBTEL_CLIENT_ID || '').trim();
        const clientSecret = (process.env.HUBTEL_API_KEY || process.env.HUBTEL_CLIENT_SECRET || '').trim();
        const posId = process.env.HUBTEL_POS_ID || process.env.HUBTEL_MERCHANT_ACCOUNT; // Just in case

        if (!clientId || !clientSecret || !posId) {
            console.error('Missing Hubtel credentials in environment variables');
            return res.status(500).json({ error: 'Payment provider configuration error' });
        }

        const authString = `${clientId}:${clientSecret}`;
        const encodedAuth = Buffer.from(authString).toString('base64');
        const authHeader = `Basic ${encodedAuth}`;

        // 3. Call Hubtel Checkout Status API (Proxy Gateway)
        // We try both path parameter and query parameter variations to be safe.
        const checkoutId = transaction.checkout_id;

        if (!checkoutId) {
            return res.status(200).json({
                success: false,
                error: 'Missing Checkout ID',
                message: 'The transaction is missing a Hubtel checkout identifier.'
            });
        }

        let response;
        let hubtelUrl = `https://payproxyapi.hubtel.com/items/checkstatus/${checkoutId}`;

        console.log('Trying Hubtel Status (Path Param):', hubtelUrl);

        response = await fetch(hubtelUrl, {
            method: 'GET',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });

        // Fallback to Query Parameter if Path Parameter returns 404 or 405
        if (response.status === 404 || response.status === 405) {
            hubtelUrl = `https://payproxyapi.hubtel.com/items/checkstatus?checkoutId=${checkoutId}`;
            console.log('Trying Fallback Hubtel Status (Query Param):', hubtelUrl);
            response = await fetch(hubtelUrl, {
                method: 'GET',
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Hubtel checkout status API error:', response.status, errorText);

            return res.status(200).json({
                success: false,
                error: 'Hubtel API Error',
                message: `Hubtel returned ${response.status}: ${errorText.substring(0, 160) || 'No error message provided'}.`,
                details: {
                    status: response.status,
                    bodySnippet: errorText.substring(0, 200),
                    url: hubtelUrl
                }
            });
        }

        let hubtelData;
        try {
            hubtelData = await response.json();
        } catch (parseError) {
            return res.status(200).json({
                success: false,
                error: 'Invalid Hubtel Response',
                message: 'Hubtel returned a non-JSON response.'
            });
        }

        // 4. Update Database based on Hubtel status
        let newStatus = transaction.status;

        // The checkout status endpoint typically returns responseCode and data object with status/isSuccessful
        const responseCode = hubtelData.responseCode || hubtelData.ResponseCode;

        let responseData = {};
        if (hubtelData.data) {
            responseData = Array.isArray(hubtelData.data) && hubtelData.data.length > 0 ? hubtelData.data[0] : hubtelData.data;
        } else if (hubtelData.Data) {
            responseData = Array.isArray(hubtelData.Data) && hubtelData.Data.length > 0 ? hubtelData.Data[0] : hubtelData.Data;
        } else {
            responseData = hubtelData; // Sometimes it's flat
        }

        const transactionStatus = responseData.status || responseData.Status || hubtelData.status || hubtelData.Status;

        console.log(`Hubtel Status for ${clientReference}:`, { responseCode, transactionStatus });

        // "Paid" or "Success" depending on internal variations, "0000" means successful request
        // For payproxyapi, data.isSuccessful is a common indicator
        const isSuccessful = responseData.isSuccessful === true ||
            transactionStatus === 'Paid' ||
            transactionStatus === 'Success' ||
            (responseCode === '0000' && transactionStatus && transactionStatus !== 'Unpaid' && transactionStatus !== 'Failed');

        if (isSuccessful) {
            newStatus = 'approved';
        } else if (transactionStatus === 'Failed' || transactionStatus === 'Unpaid' || responseCode === '2001') {
            newStatus = 'rejected';
        }

        // Update transaction record
        const { error: updateError } = await supabase
            .from('transactions')
            .update({
                status: newStatus,
                hubtel_transaction_id: responseData.transactionId || responseData.TransactionId || hubtelData.transactionId || hubtelData.TransactionId || responseData.checkoutId,
                raw_status_check: hubtelData,
                updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id);


        if (updateError) {
            console.error('Error updating transaction status:', updateError);
        }

        // If payment was success and we changed status, increment user balance
        console.log(`Updating status to ${newStatus}. Current status: ${transaction.status}`);
        if (newStatus === 'approved' && transaction.status !== 'approved') {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('balance')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.error('Error fetching profile for balance update:', profileError);
            }

            if (profile) {
                const currentBalance = parseFloat(profile.balance || 0);
                const depositAmount = parseFloat(transaction.amount || 0);
                const newBalance = currentBalance + depositAmount;

                console.log(`Updating balance for user ${user.id}: ${currentBalance} + ${depositAmount} = ${newBalance}`);

                const { error: profileUpdateError } = await supabase
                    .from('profiles')
                    .update({ balance: newBalance })
                    .eq('id', user.id);

                if (profileUpdateError) {
                    console.error('Error updating profile balance:', profileUpdateError);
                } else {
                    console.log('Balance updated successfully');
                }

                await logUserAction({
                    user_id: user.id,
                    action_type: 'deposit_completed',
                    entity_type: 'transaction',
                    entity_id: transaction.id,
                    description: `Hubtel deposit completed via status check: ₵${transaction.amount}`,
                    metadata: { hubtelData },
                    req
                });
            }
        }

        return res.status(200).json({
            success: true,
            status: newStatus,
            hubtelResponse: hubtelData
        });

    } catch (error) {
        console.error('Error in Hubtel status check:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
