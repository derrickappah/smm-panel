import { verifyAuth, getServiceRoleClient } from '../../utils/auth.js';
import { logUserAction } from '../../utils/activityLogger.js';
import { redis } from '../../utils/redisClient.js';


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
        let user;
        try {
            const authResult = await verifyAuth(req);
            user = authResult.user;
        } catch (authError) {
            return res.status(401).json({
                error: 'Authentication required',
                message: authError.message
            });
        }
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

        // Atomic Redis Lock for 30s
        if (redis) {
            const lockKey = `smm:lock:deposit:${transaction.id}`;
            const acquired = await redis.set(lockKey, 'locked', { nx: true, ex: 30 });
            if (!acquired) {
                return res.status(409).json({
                    error: 'Deposit check for this transaction is currently being processed. Please wait.',
                    transaction_id: transaction.id
                });
            }
        }

        // 3. Call Mandatory Hubtel Status API (Public RMSC Endpoint)
        // Hubtel credentials
        const clientId = (process.env.HUBTEL_API_ID || process.env.HUBTEL_CLIENT_ID || '').trim();
        const clientSecret = (process.env.HUBTEL_API_KEY || process.env.HUBTEL_CLIENT_SECRET || '').trim();
        const posId = (process.env.HUBTEL_POS_ID || process.env.HUBTEL_MERCHANT_ACCOUNT || '').trim();

        if (!clientId || !clientSecret || !posId) {
            console.error('Missing Hubtel credentials in environment variables');
            return res.status(500).json({ error: 'Payment provider configuration error' });
        }

        const authString = `${clientId}:${clientSecret}`;
        const encodedAuth = Buffer.from(authString).toString('base64');
        const authHeader = `Basic ${encodedAuth}`;

        let hubtelData = null;
        let isSuccessful = false;

        const hubtelUrl = `https://rmsc.hubtel.com/v1/merchantaccount/merchants/${posId}/transactions/status?clientReference=${clientReference}`;
        
        try {
            const statusResponse = await fetch(hubtelUrl, {
                method: 'GET',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });

            if (statusResponse.ok) {
                hubtelData = await statusResponse.json();
                console.log('Hubtel status check response:', JSON.stringify(hubtelData));
            } else {
                const errText = await statusResponse.text();
                console.warn(`Hubtel Status API returned status ${statusResponse.status}: ${errText}`);
            }
        } catch (apiErr) {
            console.error('Error calling Hubtel Status API for status check:', apiErr);
            return res.status(502).json({ error: 'Failed to verify with payment provider' });
        }

        // Parse authoritative status from Hubtel
        let transactionStatus = null;
        let responseData = {};
        let verifiedAmount = 0;

        if (hubtelData) {
            let apiData = hubtelData.data || hubtelData.Data || hubtelData;
            if (Array.isArray(apiData) && apiData.length > 0) {
                apiData = apiData[0];
            }
            responseData = apiData;

            transactionStatus = apiData.TransactionStatus || apiData.InvoiceStatus || apiData.status || apiData.Status || hubtelData.status || hubtelData.Status;
            const responseCode = hubtelData.responseCode || hubtelData.ResponseCode;
            verifiedAmount = parseFloat(apiData.AmountAfterFees || apiData.TransactionAmount || apiData.amount || apiData.Amount || apiData.amountPaid || apiData.AmountPaid || 0);

            const expectedAmount = parseFloat(transaction.amount);
            const amountMatches = verifiedAmount >= expectedAmount * 0.99; // 1% tolerance for processing fee rounding

            isSuccessful = (
                apiData.isSuccessful === true ||
                transactionStatus === 'Paid' ||
                transactionStatus === 'Success' ||
                (responseCode === '0000' && transactionStatus && transactionStatus !== 'Unpaid' && transactionStatus !== 'Failed')
            ) && amountMatches;
        }

        // 4. Update transaction & atomic balance crediting if successful
        const eventId = responseData.transactionId || responseData.TransactionId || responseData.checkoutId || responseData.CheckoutId || responseData.InvoiceToken || hubtelData?.transactionId || null;

        if (isSuccessful) {
            const creditAmount = verifiedAmount > 0 ? verifiedAmount : parseFloat(transaction.amount);
            const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction_universal_v2', {
                p_transaction_id: transaction.id,
                p_payment_method: 'hubtel',
                p_payment_status: 'Paid',
                p_payment_reference: clientReference,
                p_actual_amount: creditAmount,
                p_provider_event_id: eventId ? String(eventId) : null
            });

            if (rpcError) {
                console.error('[HUBTEL STATUS CHECK] Database function error:', rpcError);
                return res.status(500).json({ error: 'Failed to approve transaction', details: rpcError.message });
            }

            const approvalResult = result && result.length > 0 ? result[0] : null;

            await supabase
                .from('transactions')
                .update({
                    payment_method: responseData.PaymentMethod || responseData.MobileChannelName || transaction.payment_method,
                    raw_status_check: hubtelData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', transaction.id);

            await logUserAction({
                user_id: user.id,
                action_type: 'deposit_completed',
                entity_type: 'transaction',
                entity_id: transaction.id,
                description: `Hubtel deposit completed via status check: ₵${creditAmount}`,
                metadata: { hubtelData },
                req
            });

            return res.status(200).json({
                success: true,
                status: 'approved',
                new_balance: approvalResult?.new_balance,
                hubtelResponse: hubtelData
            });
        } else if (transactionStatus === 'Failed' || transactionStatus === 'Unpaid') {
            await supabase
                .from('transactions')
                .update({
                    status: 'rejected',
                    raw_status_check: hubtelData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', transaction.id);

            return res.status(200).json({
                success: false,
                status: 'rejected',
                hubtelResponse: hubtelData
            });
        }

        return res.status(200).json({
            success: true,
            status: transaction.status,
            hubtelResponse: hubtelData
        });

    } catch (error) {
        console.error('Error in Hubtel status check:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
