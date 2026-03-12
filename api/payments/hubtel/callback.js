import { getServiceRoleClient } from '../../utils/auth.js';
import { logUserAction } from '../../utils/activityLogger.js';

/**
 * Hubtel Online Checkout Callback (Webhook)
 * 
 * This endpoint handles asynchronous notifications from Hubtel
 * when a transaction status changes.
 * 
 * Documentation: https://developers.hubtel.com/docs/callback-handling
 */
export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Log the raw notification for UAT and debugging
    console.log('Hubtel Callback received:', JSON.stringify(req.body, null, 2));

    try {
        const payload = req.body;

        /**
         * Payload structure (Redirect Checkout):
         * {
         *   "ResponseCode": "0000",
         *   "Status": "Success",
         *   "Amount": 10.00,
         *   "ClientReference": "...",
         *   "TransactionId": "...",
         *   "ExternalTransactionId": "...",
         *   "CheckoutId": "...",
         *   "PaymentDetails": { "Channel": "mtn-gh", ... },
         *   "Description": "..."
         * }
         */

        const clientReference = payload.ClientReference;
        const hubtelStatus = payload.Status;
        const responseCode = payload.ResponseCode;
        const amount = payload.Amount;

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

        // 3. Security Verification: Validate amount matches
        if (Math.abs(parseFloat(transaction.amount) - parseFloat(amount)) > 0.01) {
            console.error(`Amount mismatch in Hubtel callback! DB: ${transaction.amount}, Payload: ${amount}`);
            await logUserAction({
                user_id: transaction.user_id,
                action_type: 'suspicious_callback',
                entity_type: 'transaction',
                entity_id: transaction.id,
                description: `Suspicious Hubtel callback: Amount mismatch. DB: ${transaction.amount}, Payload: ${amount}`,
                metadata: { payload }
            });
            return res.status(400).json({ error: 'Amount mismatch' });
        }

        // 4. Update Transaction Status
        let newStatus = 'Pending';
        if (responseCode === '0000' && hubtelStatus === 'Success') {
            newStatus = 'approved';
        } else if (responseCode === '2001' || hubtelStatus === 'Failed') {
            newStatus = 'rejected';
        }

        const { error: updateError } = await supabase
            .from('transactions')
            .update({
                status: newStatus,
                hubtel_transaction_id: payload.TransactionId,
                external_transaction_id: payload.ExternalTransactionId,
                payment_method: payload.PaymentDetails?.Channel || transaction.payment_method,
                raw_callback: payload,
                updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id);

        if (updateError) {
            console.error('Error updating transaction in callback:', updateError);
            return res.status(500).json({ error: 'Internal update error' });
        }

        // 5. If successful, update user balance
        if (newStatus === 'approved') {
            const { data: profile } = await supabase
                .from('profiles')
                .select('balance')
                .eq('id', transaction.user_id)
                .single();

            if (profile) {
                const newBalance = (profile.balance || 0) + parseFloat(transaction.amount);
                const { error: balanceError } = await supabase
                    .from('profiles')
                    .update({ balance: newBalance })
                    .eq('id', transaction.user_id);

                if (balanceError) {
                    console.error('Error updating balance in Hubtel callback:', balanceError);
                } else {
                    // Log completion
                    await logUserAction({
                        user_id: transaction.user_id,
                        action_type: 'deposit_completed',
                        entity_type: 'transaction',
                        entity_id: transaction.id,
                        description: `Hubtel deposit completed: ₵${transaction.amount}`,
                        metadata: { hubtel_transaction_id: payload.TransactionId },
                        req
                    });
                }
            }
        }

        // Return 200 OK to Hubtel immediately
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error in Hubtel callback handler:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
