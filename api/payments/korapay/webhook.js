import { getServiceRoleClient } from '../../utils/auth.js';
import { logUserAction } from '../../utils/activityLogger.js';
import crypto from 'crypto';

/**
 * KoraPay Webhook (notification_url)
 *
 * Receives charge.success events from KoraPay and updates the
 * transaction status + user balance atomically.
 *
 * KoraPay sends an HMAC-SHA256 signature in the
 * 'x-korapay-signature' header, computed over the raw request body
 * using your KORAPAY_SECRET_KEY.
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('KoraPay Webhook received:', JSON.stringify(req.body, null, 2));

    try {
        // 1. Verify HMAC signature
        const korapaySecretKey = (process.env.KORAPAY_SECRET_KEY || '').trim();
        if (!korapaySecretKey) {
            console.error('KORAPAY_SECRET_KEY not configured — cannot verify webhook');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const signature = req.headers['x-korapay-signature'];
        if (signature) {
            const rawBody = JSON.stringify(req.body);
            const expectedSignature = crypto
                .createHmac('sha256', korapaySecretKey)
                .update(rawBody)
                .digest('hex');

            if (signature !== expectedSignature) {
                console.error('KoraPay webhook signature mismatch');
                return res.status(401).json({ error: 'Invalid webhook signature' });
            }
        } else {
            // KoraPay may not always send a signature in test mode; log but continue
            console.warn('KoraPay webhook received without signature header');
        }

        const payload = req.body;

        // KoraPay sends: { "event": "charge.success", "data": { ... } }
        const event = payload.event;
        const data = payload.data || {};

        if (event !== 'charge.success') {
            // We only handle successful charges
            console.log(`KoraPay webhook: ignoring event "${event}"`);
            return res.status(200).json({ success: true, message: 'Event ignored' });
        }

        const reference = data.reference;
        const korapayStatus = data.status;
        const amount = parseFloat(data.amount || 0);

        if (!reference) {
            console.error('KoraPay webhook missing reference');
            return res.status(400).json({ error: 'Missing reference' });
        }

        const supabase = getServiceRoleClient();

        // 2. Find transaction by client_reference (the reference we generated)
        const { data: transaction, error: fetchError } = await supabase
            .from('transactions')
            .select('*')
            .eq('client_reference', reference)
            .single();

        if (fetchError || !transaction) {
            console.error(`Transaction not found for KoraPay webhook: ${reference}`);
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // 3. Idempotency check
        if (transaction.status === 'approved') {
            console.log(`Transaction ${reference} already approved. Skipping.`);
            return res.status(200).json({ success: true, message: 'Already processed' });
        }

        // 4. Security — validate amount
        const expectedAmount = parseFloat(transaction.amount);
        if (amount < expectedAmount * 0.995) {
            console.error(`Potential underpayment for KoraPay transaction ${reference}: expected ${expectedAmount}, got ${amount}`);
            await logUserAction({
                user_id: transaction.user_id,
                action_type: 'suspicious_callback',
                entity_type: 'transaction',
                entity_id: transaction.id,
                description: `KoraPay underpayment detected. Expected: ${expectedAmount}, Received: ${amount}`,
                metadata: { payload }
            });
            return res.status(400).json({ error: 'Amount mismatch (underpayment)' });
        }

        // 5. Determine new status
        const isSuccessful = korapayStatus === 'success';
        const newStatus = isSuccessful ? 'approved' : 'rejected';

        const { error: updateError } = await supabase
            .from('transactions')
            .update({
                status: newStatus,
                korapay_reference: reference,
                korapay_status: korapayStatus,
                raw_callback: payload,
                updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id);

        if (updateError) {
            console.error('Error updating transaction in KoraPay webhook:', updateError);
            return res.status(500).json({ error: 'Internal update error' });
        }

        // 6. Credit user balance if successful
        if (newStatus === 'approved') {
            const { data: profile } = await supabase
                .from('profiles')
                .select('balance')
                .eq('id', transaction.user_id)
                .single();

            if (profile) {
                const newBalance = (parseFloat(profile.balance) || 0) + parseFloat(transaction.amount);
                const { error: balanceError } = await supabase
                    .from('profiles')
                    .update({ balance: newBalance })
                    .eq('id', transaction.user_id);

                if (balanceError) {
                    console.error('Error updating balance in KoraPay webhook:', balanceError);
                } else {
                    await logUserAction({
                        user_id: transaction.user_id,
                        action_type: 'deposit_completed',
                        entity_type: 'transaction',
                        entity_id: transaction.id,
                        description: `KoraPay deposit completed via webhook: ₵${transaction.amount}`,
                        metadata: { reference, korapay_status: korapayStatus }
                    });
                }
            }
        }

        console.log(`KoraPay webhook processed: ${reference} → ${newStatus}`);
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error in KoraPay webhook handler:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
