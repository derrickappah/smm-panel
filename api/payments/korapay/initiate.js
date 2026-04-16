import { verifyAuth, getServiceRoleClient } from '../../utils/auth.js';
import { logUserAction } from '../../utils/activityLogger.js';
import { checkDepositRateLimit } from '../../utils/depositRateLimit.js';
import crypto from 'crypto';

/**
 * KoraPay Checkout Redirect - Initiate Payment
 *
 * This endpoint initializes a KoraPay Checkout Redirect transaction.
 * The customer is redirected to a KoraPay-hosted payment page.
 *
 * Documentation: https://developers.korapay.com/docs/checkout-redirect
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
        const { amount, description } = req.body;

        const totalAmount = parseFloat(amount);

        // 1b. Check Rate Limit (5 rejected deposits per hour)
        const rateLimit = await checkDepositRateLimit(user.id, req);
        if (rateLimit.blocked) {
            return res.status(429).json({ error: rateLimit.message });
        }

        // 2. Check KoraPay credentials
        const korapaySecretKey = (process.env.KORAPAY_SECRET_KEY || '').trim();
        if (!korapaySecretKey) {
            console.error('KORAPAY_SECRET_KEY is not configured');
            return res.status(500).json({ error: 'KoraPay is not configured on the server. Please contact support.' });
        }

        // Generate unique reference — must fit varchar(32): "KORA_" (5) + 27 hex chars = 32
        const reference = `KORA_${crypto.randomUUID().replace(/-/g, '').substring(0, 27)}`;

        // 4. Insert transaction into database as 'pending'
        const supabase = getServiceRoleClient();
        const { data: transaction, error: insertError } = await supabase
            .from('transactions')
            .insert({
                user_id: user.id,
                amount: totalAmount,
                type: 'deposit',
                status: 'pending',
                deposit_method: 'korapay',
                client_reference: reference,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error creating KoraPay transaction:', insertError);
            return res.status(500).json({ error: 'Failed to create transaction' });
        }

        // 5. Prepare KoraPay payload
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (origin || 'https://boostupgh.com');

        // Fetch user profile for customer name/email
        const { data: profile } = await supabase
            .from('profiles')
            .select('email, name')
            .eq('id', user.id)
            .single();

        const customerEmail = profile?.email || user.email || '';
        const customerName = profile?.name || '';

        const korapayPayload = {
            amount: totalAmount,
            currency: 'GHS',
            reference: reference,
            narration: description || 'Wallet Deposit',
            notification_url: `${baseUrl}/api/payments/korapay/webhook`,
            redirect_url: `${baseUrl}/payment/success?provider=korapay`,
            merchant_bears_cost: true,
            customer: {
                email: customerEmail,
                name: customerName || 'Customer'
            }
        };

        console.log('Sending KoraPay Initiation Request:', {
            url: 'https://api.korapay.com/merchant/api/v1/charges/initialize',
            reference,
            amount: totalAmount,
            currency: 'GHS'
        });

        // 6. Call KoraPay API
        const response = await fetch('https://api.korapay.com/merchant/api/v1/charges/initialize', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${korapaySecretKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(korapayPayload)
        });

        console.log('KoraPay API Response Status:', response.status);

        let korapayData;
        const responseText = await response.text();

        try {
            korapayData = JSON.parse(responseText);
        } catch (e) {
            console.error('Failed to parse KoraPay response as JSON:', responseText);
            return res.status(500).json({
                error: 'Invalid response from KoraPay',
                status: response.status,
                rawData: responseText.substring(0, 500)
            });
        }

        if (korapayData.status === true && korapayData.data?.checkout_url) {
            // 7. Update transaction with raw response
            await supabase
                .from('transactions')
                .update({
                    korapay_reference: reference,
                    raw_initiate_response: korapayData
                })
                .eq('id', transaction.id);

            // Log activity
            await logUserAction({
                user_id: user.id,
                action_type: 'deposit_initiated',
                entity_type: 'transaction',
                entity_id: transaction.id,
                description: `KoraPay deposit initiated: ₵${totalAmount}`,
                metadata: { reference, checkout_url: korapayData.data.checkout_url },
                req
            });

            return res.status(200).json({
                success: true,
                checkoutUrl: korapayData.data.checkout_url,
                reference: reference
            });
        } else {
            console.error('KoraPay API Error:', korapayData);

            // Mark transaction as failed
            await supabase
                .from('transactions')
                .update({ status: 'rejected', raw_initiate_response: korapayData })
                .eq('id', transaction.id);

            return res.status(500).json({
                error: korapayData.message || 'Failed to initiate payment with KoraPay',
                korapayError: korapayData
            });
        }

    } catch (error) {
        console.error('Error in KoraPay initiation:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
