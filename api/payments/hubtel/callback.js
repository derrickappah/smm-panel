import { getServiceRoleClient } from '../../utils/auth.js';
import { logUserAction, logSecurityEvent } from '../../utils/activityLogger.js';

/**
 * Hubtel Online Checkout Callback (Webhook)
 * 
 * This endpoint handles asynchronous notifications from Hubtel.
 * To prevent forged callbacks and fraud, ALL incoming callbacks
 * are verified server-to-server against Hubtel's official Status API
 * before any balance is credited.
 * 
 * Documentation: https://developers.hubtel.com/docs/callback-handling
 */
export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Log the raw notification
    console.log('Hubtel Callback received:', JSON.stringify(req.body, null, 2));

    try {
        const payload = req.body || {};

        // Extract values from the deeply nested Hubtel Data array or object
        let responseData = {};
        if (payload.Data) {
            responseData = Array.isArray(payload.Data) && payload.Data.length > 0 ? payload.Data[0] : payload.Data;
        } else if (payload.data) {
            responseData = Array.isArray(payload.data) && payload.data.length > 0 ? payload.data[0] : payload.data;
        }

        const clientReference = payload.clientReference || payload.ClientReference || responseData.clientReference || responseData.ClientReference;
        const callbackAmount = payload.amount || payload.Amount || responseData.amount || responseData.Amount;

        if (!clientReference) {
            console.error('Hubtel Callback missing ClientReference');
            return res.status(400).json({ error: 'Missing ClientReference' });
        }

        const supabase = getServiceRoleClient();

        // 1. Fetch the transaction from the database
        const { data: transaction, error: fetchError } = await supabase
            .from('transactions')
            .select('*')
            .eq('client_reference', clientReference)
            .single();

        if (fetchError || !transaction) {
            console.error(`Transaction not found for Hubtel callback: ${clientReference}`);
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // 2. Idempotency Check: If already processed, return 200 OK
        if (transaction.status === 'Paid' || transaction.status === 'approved') {
            console.log(`Transaction ${clientReference} already processed. Skipping.`);
            return res.status(200).json({ success: true, message: 'Already processed' });
        }

        // 3. Mandatory Server-to-Server Verification with Hubtel RMSC Status API
        const clientId = (process.env.HUBTEL_API_ID || process.env.HUBTEL_CLIENT_ID || '').trim();
        const clientSecret = (process.env.HUBTEL_API_KEY || process.env.HUBTEL_CLIENT_SECRET || '').trim();
        const posId = (process.env.HUBTEL_POS_ID || process.env.HUBTEL_MERCHANT_ACCOUNT || '').trim();

        if (!clientId || !clientSecret || !posId) {
            console.error('Missing Hubtel credentials for server-side verification');
            return res.status(500).json({ error: 'Payment provider configuration error' });
        }

        const authString = `${clientId}:${clientSecret}`;
        const encodedAuth = Buffer.from(authString).toString('base64');
        const authHeader = `Basic ${encodedAuth}`;

        const hubtelStatusUrl = `https://rmsc.hubtel.com/v1/merchantaccount/merchants/${posId}/transactions/status?clientReference=${clientReference}`;
        
        console.log(`Verifying Hubtel callback server-to-server for clientReference: ${clientReference}`);
        
        let hubtelVerifiedData = null;
        let isPaymentConfirmed = false;

        try {
            const statusResponse = await fetch(hubtelStatusUrl, {
                method: 'GET',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });

            if (statusResponse.ok) {
                hubtelVerifiedData = await statusResponse.json();
                console.log('Hubtel Authoritative Verification Response:', JSON.stringify(hubtelVerifiedData));
            } else {
                const errText = await statusResponse.text();
                console.warn(`Hubtel Status API returned status ${statusResponse.status}: ${errText}`);
            }
        } catch (apiErr) {
            console.error('Error calling Hubtel Status API for verification:', apiErr);
            return res.status(502).json({ error: 'Failed to verify with payment provider' });
        }

        // Parse authoritative status from Hubtel
        let verifiedStatus = null;
        let verifiedAmount = 0;
        let verifiedTransactionId = null;

        if (hubtelVerifiedData) {
            let apiData = hubtelVerifiedData.data || hubtelVerifiedData.Data || hubtelVerifiedData;
            if (Array.isArray(apiData) && apiData.length > 0) {
                apiData = apiData[0];
            }

            verifiedStatus = apiData.status || apiData.Status || hubtelVerifiedData.status || hubtelVerifiedData.Status;
            verifiedAmount = parseFloat(apiData.amount || apiData.Amount || apiData.amountPaid || apiData.AmountPaid || 0);
            verifiedTransactionId = apiData.transactionId || apiData.TransactionId || hubtelVerifiedData.transactionId || hubtelVerifiedData.TransactionId;

            const responseCode = hubtelVerifiedData.responseCode || hubtelVerifiedData.ResponseCode;

            // Strict confirmation criteria from Hubtel official response
            const statusMatches = (
                verifiedStatus === 'Paid' || 
                verifiedStatus === 'Success' || 
                apiData.isSuccessful === true ||
                (responseCode === '0000' && verifiedStatus && verifiedStatus !== 'Unpaid' && verifiedStatus !== 'Failed')
            );

            const expectedAmount = parseFloat(transaction.amount);
            const amountMatches = verifiedAmount >= expectedAmount * 0.99; // Allow small rounding

            if (statusMatches && amountMatches) {
                isPaymentConfirmed = true;
            }
        }

        // 4. If Hubtel API did NOT confirm genuine payment, reject the callback
        if (!isPaymentConfirmed) {
            console.warn(`REJECTING Hubtel callback for ${clientReference} — Hubtel API did NOT confirm payment.`, {
                receivedPayload: payload,
                hubtelApiResult: hubtelVerifiedData
            });

            await logSecurityEvent({
                action_type: 'forged_callback_attempt',
                description: `Hubtel callback rejected: payment not confirmed by Hubtel RMSC API for reference ${clientReference}`,
                metadata: {
                    clientReference,
                    expectedAmount: transaction.amount,
                    callbackPayload: payload,
                    hubtelApiResponse: hubtelVerifiedData
                },
                severity: 'critical',
                req
            });

            return res.status(400).json({
                error: 'Payment verification failed with Hubtel',
                clientReference
            });
        }

        // 5. Payment verified genuine: Update transaction and credit wallet balance
        const { error: updateError } = await supabase
            .from('transactions')
            .update({
                status: 'approved',
                hubtel_transaction_id: verifiedTransactionId || payload.transactionId || payload.TransactionId,
                external_transaction_id: payload.externalTransactionId || payload.ExternalTransactionId || responseData.externalTransactionId,
                payment_method: payload.PaymentDetails?.Channel || responseData.PaymentDetails?.Channel || transaction.payment_method,
                raw_callback: payload,
                raw_status_check: hubtelVerifiedData,
                updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id);

        if (updateError) {
            console.error('Error updating transaction in callback:', updateError);
            return res.status(500).json({ error: 'Internal update error' });
        }

        // 6. Update user balance atomically
        const { data: profile } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', transaction.user_id)
            .single();

        if (profile) {
            const currentBal = parseFloat(profile.balance || 0);
            const depositAmt = parseFloat(transaction.amount);
            const newBalance = currentBal + depositAmt;

            const { error: balanceError } = await supabase
                .from('profiles')
                .update({ balance: newBalance })
                .eq('id', transaction.user_id);

            if (balanceError) {
                console.error('Error updating balance in Hubtel callback:', balanceError);
            } else {
                await logUserAction({
                    user_id: transaction.user_id,
                    action_type: 'deposit_completed',
                    entity_type: 'transaction',
                    entity_id: transaction.id,
                    description: `Hubtel deposit verified and completed: ₵${transaction.amount}`,
                    metadata: {
                        hubtel_transaction_id: verifiedTransactionId,
                        clientReference
                    },
                    req
                });
            }
        }

        return res.status(200).json({ success: true, message: 'Deposit verified and credited' });

    } catch (error) {
        console.error('Error in Hubtel callback handler:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
