import { verifyAuth, getServiceRoleClient } from '../../utils/auth.js';
import { logUserAction } from '../../utils/activityLogger.js';

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
 *  4. If successful and not yet approved, we approve + credit balance
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
        // 1. Authenticate user
        const { user } = await verifyAuth(req);
        const { reference } = req.body;

        if (!reference) {
            return res.status(400).json({ error: 'Missing reference' });
        }

        const supabase = getServiceRoleClient();

        // 2. Fetch the transaction (scoped to this user)
        const { data: transaction, error: fetchError } = await supabase
            .from('transactions')
            .select('*')
            .eq('client_reference', reference)
            .eq('user_id', user.id)
            .single();

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

        // 6. Update transaction
        let newStatus = transaction.status;
        if (isSuccessful) {
            newStatus = 'approved';
        } else if (korapayStatus === 'failed') {
            newStatus = 'rejected';
        }

        await supabase
            .from('transactions')
            .update({
                status: newStatus,
                korapay_reference: reference,
                korapay_status: korapayStatus,
                raw_status_check: korapayData,
                updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id);

        // 7. Credit user balance if now approved (and wasn't already)
        if (newStatus === 'approved' && transaction.status !== 'approved') {
            const { data: profile } = await supabase
                .from('profiles')
                .select('balance')
                .eq('id', user.id)
                .single();

            if (profile) {
                const newBalance = (parseFloat(profile.balance) || 0) + parseFloat(transaction.amount);
                const { error: balanceError } = await supabase
                    .from('profiles')
                    .update({ balance: newBalance })
                    .eq('id', user.id);

                if (balanceError) {
                    console.error('Error updating balance in KoraPay verify:', balanceError);
                } else {
                    await logUserAction({
                        user_id: user.id,
                        action_type: 'deposit_completed',
                        entity_type: 'transaction',
                        entity_id: transaction.id,
                        description: `KoraPay deposit completed via redirect verify: ₵${transaction.amount}`,
                        metadata: { reference, korapayData },
                        req
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            status: newStatus,
            amount: transaction.amount,
            korapayStatus,
            reference
        });

    } catch (error) {
        console.error('Error in KoraPay verify:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
