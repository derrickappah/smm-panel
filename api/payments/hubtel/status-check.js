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
        const clientId = process.env.HUBTEL_CLIENT_ID;
        const clientSecret = process.env.HUBTEL_CLIENT_SECRET;
        const posId = process.env.HUBTEL_POS_ID;

        if (!clientId || !clientSecret || !posId) {
            console.error('Missing Hubtel credentials in environment variables');
            return res.status(500).json({ error: 'Payment provider configuration error' });
        }

        const authHeader = `Basic ${Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString('base64')}`;

        // 3. Call Hubtel Status Check API (Online Checkout Redirect Specific)
        // Documentation: https://developers.hubtel.com/docs/business/api_documentation/payment_apis/online_checkout#transaction-status-check
        // Endpoint: GET https://payproxyapi.hubtel.com/items/checkstatus?checkoutId={checkoutId}&clientReference={clientReference}
        const checkoutId = transaction.checkout_id;
        const hubtelUrl = `https://payproxyapi.hubtel.com/items/checkstatus?checkoutId=${checkoutId}&clientReference=${clientReference}`;

        console.log('Checking Hubtel Transaction Status:', { clientReference, checkoutId });

        const response = await fetch(hubtelUrl, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });

        const hubtelData = await response.json();


        // 4. Update Database based on Hubtel status
        // Status codes: 0000 (Success), 0001 (Pending), 2001 (Failed), etc.
        let newStatus = transaction.status;

        // Handle both PascalCase and camelCase response fields
        const responseCode = hubtelData.responseCode || hubtelData.ResponseCode;
        const hubtelStatus = hubtelData.status || hubtelData.Status;
        const isSuccessful = hubtelData.data?.isSuccessful ?? (hubtelData.Data?.[0]?.Status === 'Success' || responseCode === '0000');

        if (isSuccessful || responseCode === '0000') {
            newStatus = 'approved';
        } else if (hubtelStatus === 'Failed' || responseCode === '2001') {
            newStatus = 'rejected';
        }


        // Update transaction record
        const { error: updateError } = await supabase
            .from('transactions')
            .update({
                status: newStatus,
                hubtel_transaction_id: hubtelData.data?.transactionId || hubtelData.Data?.[0]?.TransactionId || hubtelData.TransactionId,
                raw_status_check: hubtelData,
                updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id);


        if (updateError) {
            console.error('Error updating transaction status:', updateError);
        }

        // If payment was success and we changed status, increment user balance
        if (newStatus === 'approved' && transaction.status !== 'approved') {
            const { data: profile } = await supabase
                .from('profiles')
                .select('balance')
                .eq('id', user.id)
                .single();

            if (profile) {
                const newBalance = (profile.balance || 0) + parseFloat(transaction.amount);
                await supabase
                    .from('profiles')
                    .update({ balance: newBalance })
                    .eq('id', user.id);

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
