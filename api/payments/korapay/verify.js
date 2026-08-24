import { verifyAuth, getServiceRoleClient } from '../../utils/auth.js';
import { logUserAction } from '../../utils/activityLogger.js';
import { redis } from '../../utils/redisClient.js';

/**
 * KoraPay Transaction Verify
 *
 * Called from the frontend after the customer is redirected back from
 * the KoraPay checkout page (`redirect_url`).
 *
 * Flow:
 *  1. Frontend reads `?reference=` from the redirect URL
 *  2. POSTs here with { reference }
 *  3. We query KoraPay's verify endpoint
 *  4. If successful and not yet approved, we approve + credit balance atomically
 *
 * This is the fallback/confirmation step — the webhook (webhook.js)
 * is the primary mechanism and may already have completed the transaction.
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
        const { reference } = req.body;

        if (!reference) {
            return res.status(400).json({ error: 'Missing reference' });
        }

        const supabase = getServiceRoleClient();

        // 2. Fetch the transaction (scoped to this user by reference or korapay_reference)
        const { data: transaction, error: fetchError } = await supabase
            .from('transactions')
            .select('*')
            .or(`client_reference.eq.${reference},korapay_reference.eq.${reference}`)
            .eq('user_id', user.id)
            .maybeSingle();

        if (fetchError || !transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // 3. If already approved (webhook beat us to it), return immediately
        if (transaction.status === 'approved') {
            return res.status(200).json({
                success: true,
                status: 'approved',
                amount: transaction.amount,
                message: 'Payment already confirmed'
            });
        }

        // Atomic Redis Lock for 30s
        if (redis) {
            const lockKey = `smm:lock:deposit:${transaction.id}`;
            const acquired = await redis.set(lockKey, 'locked', { nx: true, ex: 30 });
            if (!acquired) {
                return res.status(409).json({
                    error: 'Deposit verification for this transaction is currently being processed. Please wait.',
                    transaction_id: transaction.id
                });
            }
        }

        // 4. Check KoraPay credentials
        const korapaySecretKey = (process.env.KORAPAY_SECRET_KEY || '').trim();
        if (!korapaySecretKey) {
            return res.status(500).json({ error: 'KoraPay is not configured on the server.' });
        }

        // 5. Call KoraPay verify endpoint
        console.log(`Verifying KoraPay charge: ${reference}`);
        const korapayResponse = await fetch(
            `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${korapaySecretKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        let korapayData;
        const responseText = await korapayResponse.text();
        try {
            korapayData = JSON.parse(responseText);
        } catch (e) {
            console.error('Failed to parse KoraPay verify response:', responseText);
            return res.status(500).json({ error: 'Invalid response from KoraPay' });
        }

        if (!korapayResponse.ok) {
            console.error('KoraPay verify API error:', korapayData);
            return res.status(200).json({
                success: false,
                status: transaction.status,
                message: korapayData.message || 'Could not verify with KoraPay'
            });
        }

        const chargeData = korapayData.data || {};
        const korapayStatus = chargeData.status;
        const isSuccessful = korapayStatus === 'success';
        const gatewayAmount = parseFloat(chargeData.amount || 0);

        // 6. Update transaction and atomic balance crediting if successful
        if (isSuccessful) {
            const creditAmount = gatewayAmount > 0 ? gatewayAmount : parseFloat(transaction.amount);
            const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_transaction_universal_v2', {
                p_transaction_id: transaction.id,
                p_payment_method: 'korapay',
                p_payment_status: korapayStatus || 'success',
                p_payment_reference: reference,
                p_actual_amount: creditAmount,
                p_provider_event_id: reference
            });

            if (rpcError) {
                console.error('[KORAPAY VERIFY] Database function error:', rpcError);
                return res.status(500).json({ error: 'Failed to approve transaction', details: rpcError.message });
            }

            const approvalResult = result && result.length > 0 ? result[0] : null;

            await supabase
                .from('transactions')
                .update({
                    korapay_reference: reference,
                    korapay_status: korapayStatus,
                    raw_status_check: korapayData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', transaction.id);

            await logUserAction({
                user_id: user.id,
                action_type: 'deposit_completed',
                entity_type: 'transaction',
                entity_id: transaction.id,
                description: `KoraPay deposit completed via redirect verify: ₵${creditAmount}`,
                metadata: { reference, korapayData },
                req
            });

            return res.status(200).json({
                success: true,
                status: 'approved',
                amount: creditAmount,
                new_balance: approvalResult?.new_balance,
                korapayStatus,
                reference
            });
        } else if (korapayStatus === 'failed') {
            await supabase
                .from('transactions')
                .update({
                    status: 'rejected',
                    korapay_reference: reference,
                    korapay_status: korapayStatus,
                    raw_status_check: korapayData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', transaction.id);

            return res.status(200).json({
                success: false,
                status: 'rejected',
                amount: transaction.amount,
                korapayStatus,
                reference
            });
        }

        return res.status(200).json({
            success: true,
            status: transaction.status,
            amount: transaction.amount,
            korapayStatus,
            reference
        });

    } catch (error) {
        console.error('Error in KoraPay verify:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}

