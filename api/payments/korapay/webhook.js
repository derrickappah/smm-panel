import { getServiceRoleClient } from '../../utils/auth.js';
import { logUserAction } from '../../utils/activityLogger.js';
import { redis } from '../../utils/redisClient.js';
import crypto from 'crypto';
import getRawBody from 'raw-body';
export const config = { api: { bodyParser: false } };
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
        if (!signature) {
            console.error('KoraPay webhook received without signature header');
            return res.status(401).json({ error: 'Missing webhook signature' });
        }

        const rawBodyBuffer = await getRawBody(req);
        const rawBody = rawBodyBuffer.toString('utf8');
        const expectedSignature = crypto
            .createHmac('sha256', korapaySecretKey)
            .update(rawBody, 'utf8')
            .digest('hex');

        try {
            const sigBuf = Buffer.from(signature, 'hex');
            const expBuf = Buffer.from(expectedSignature, 'hex');
            if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
                console.error('KoraPay webhook signature mismatch');
                return res.status(401).json({ error: 'Invalid webhook signature' });
            }
        } catch (e) {
            console.error('KoraPay webhook signature verification error:', e);
            return res.status(401).json({ error: 'Invalid signature format' });
        }

        const payload = JSON.parse(rawBody);

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

        // 2. Find transaction by client_reference or korapay_reference
        const { data: transaction, error: fetchError } = await supabase
            .from('transactions')
            .select('*')
            .or(`client_reference.eq.${reference},korapay_reference.eq.${reference}`)
            .maybeSingle();

        if (fetchError || !transaction) {
            console.error(`Transaction not found for KoraPay webhook: ${reference}`);
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // 3. Idempotency and status check
        if (transaction.status === 'approved') {
            console.log(`Transaction ${reference} already approved. Skipping.`);
            return res.status(200).json({ success: true, message: 'Already processed' });
        }

        if (transaction.status === 'rejected') {
            console.warn(`Transaction ${reference} was previously rejected. Skipping approval.`);
            return res.status(400).json({ error: 'Transaction has been rejected' });
        }

        // Atomic Redis Lock for 30s
        if (redis) {
            const lockKey = `smm:lock:deposit:${transaction.id}`;
            const acquired = await redis.set(lockKey, 'locked', { nx: true, ex: 30 });
            if (!acquired) {
                return res.status(409).json({
                    error: 'Deposit approval for this transaction is currently being processed. Please wait.',
                    transaction_id: transaction.id
                });
            }
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

        // Check if user is banned
        const { data: bannedEntry } = await supabase
            .from('banned_users')
            .select('user_id')
            .eq('user_id', transaction.user_id)
            .maybeSingle();

        if (bannedEntry) {
            console.warn(`User ${transaction.user_id} is banned. Rejecting KoraPay deposit credit.`);
            await supabase.from('transactions').update({ status: 'rejected', korapay_status: korapayStatus }).eq('id', transaction.id);
            return res.status(403).json({ error: 'User is suspended. Deposit rejected.' });
        }

        // 5. Update transaction metadata
        await supabase
            .from('transactions')
            .update({
                korapay_reference: reference,
                korapay_status: korapayStatus,
                raw_callback: payload,
                updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id);

        // 6. Atomic balance crediting via database stored procedure (credit exact paid amount)
        const creditAmount = amount > 0 ? amount : expectedAmount;
        const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction_universal_v2', {
            p_transaction_id: transaction.id,
            p_payment_method: 'korapay',
            p_payment_status: korapayStatus || 'success',
            p_payment_reference: reference,
            p_actual_amount: creditAmount,
            p_provider_event_id: reference
        });

        if (rpcError) {
            console.error('[KORAPAY WEBHOOK] Database function error:', rpcError);
            return res.status(500).json({ error: 'Failed to approve transaction', details: rpcError.message });
        }

        const approvalResult = result && result.length > 0 ? result[0] : null;

        if (!approvalResult || !approvalResult.success) {
            if (approvalResult?.message?.includes('already approved')) {
                return res.status(200).json({ success: true, message: 'Already approved' });
            }
            return res.status(400).json({ error: approvalResult?.message || 'Transaction approval failed' });
        }

        await logUserAction({
            user_id: transaction.user_id,
            action_type: 'deposit_completed',
            entity_type: 'transaction',
            entity_id: transaction.id,
            description: `KoraPay deposit completed via webhook: ₵${creditAmount}`,
            metadata: { 
                reference, 
                korapay_status: korapayStatus,
                old_balance: approvalResult.old_balance,
                new_balance: approvalResult.new_balance
            }
        });

        console.log(`KoraPay webhook processed: ${reference} → approved (balance: ${approvalResult.new_balance})`);
        return res.status(200).json({ 
            success: true,
            transaction_id: transaction.id,
            new_balance: approvalResult.new_balance
        });

    } catch (error) {
        console.error('Error in KoraPay webhook handler:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
