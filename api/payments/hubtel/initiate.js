import { verifyAuth, getServiceRoleClient } from '../../utils/auth.js';
import { logUserAction } from '../../utils/activityLogger.js';
import crypto from 'crypto';


/**
 * Hubtel Online Checkout - Initiate Payment
 * 
 * This endpoint initializes a Hubtel Redirect Checkout transaction.
 * 
 * Documentation: https://developers.hubtel.com/docs/online-checkout
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

        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }

        const totalAmount = parseFloat(amount);
        const clientReference = crypto.randomUUID().replace(/-/g, '').substring(0, 32);


        // 2. Insert transaction into database as 'Pending'
        const supabase = getServiceRoleClient();
        const { data: transaction, error: insertError } = await supabase
            .from('transactions')
            .insert({
                user_id: user.id,
                amount: totalAmount,
                type: 'deposit',
                status: 'pending',
                deposit_method: 'hubtel',
                client_reference: clientReference,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error creating transaction:', insertError);
            return res.status(500).json({ error: 'Failed to create transaction' });
        }

        // 3. Prepare Hubtel Payload
        const clientId = process.env.HUBTEL_CLIENT_ID;
        const clientSecret = process.env.HUBTEL_CLIENT_SECRET;
        const merchantAccountNumber = process.env.HUBTEL_MERCHANT_ACCOUNT;

        // Use environment-specific URLs or current origin for callbacks
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (origin || 'https://boostupgh.com');
        const callbackUrl = `${baseUrl}/api/webhooks/hubtel/route`;
        const returnUrl = `${baseUrl}/payment/success?reference=${clientReference}`;
        const cancellationUrl = `${baseUrl}/payment/cancelled?reference=${clientReference}`;

        const hubtelPayload = {
            totalAmount: totalAmount,
            description: description || 'Wallet Deposit',
            callbackUrl: callbackUrl,
            returnUrl: returnUrl,
            cancellationUrl: cancellationUrl,
            merchantAccountNumber: merchantAccountNumber,
            clientReference: clientReference
        };

        // 4. Call Hubtel API
        const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

        console.log('Sending Hubtel Initiation Request:', {
            url: 'https://payproxyapi.hubtel.com/items/initiate',
            payload: { ...hubtelPayload, merchantAccountNumber: merchantAccountNumber ? '***' + merchantAccountNumber.slice(-3) : 'MISSING' },
            hasAuthHeader: !!authHeader
        });

        const response = await fetch('https://payproxyapi.hubtel.com/items/initiate', {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(hubtelPayload)
        });

        console.log('Hubtel API Response Status:', response.status);
        console.log('Hubtel API Response Headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));


        // Try to parse JSON, providing better error if it fails
        let hubtelData;
        const responseText = await response.text();

        try {
            hubtelData = JSON.parse(responseText);
        } catch (e) {
            console.error('Failed to parse Hubtel response as JSON:', responseText);
            return res.status(500).json({
                error: 'Invalid response from Hubtel',
                status: response.status,
                rawData: responseText.substring(0, 500) // Keep logs safe but useful
            });
        }


        if (hubtelData.responseCode === '0000') {
            // 5. Update transaction with checkoutId and raw response
            await supabase
                .from('transactions')
                .update({
                    checkout_id: hubtelData.data.checkoutId,
                    raw_initiate_response: hubtelData
                })
                .eq('id', transaction.id);

            // Log activity
            await logUserAction({
                user_id: user.id,
                action_type: 'deposit_initiated',
                entity_type: 'transaction',
                entity_id: transaction.id,
                description: `Hubtel deposit initiated: ₵${totalAmount}`,
                metadata: { clientReference, checkoutId: hubtelData.data.checkoutId },
                req
            });

            return res.status(200).json({
                success: true,
                checkoutUrl: hubtelData.data.checkoutUrl,
                clientReference: clientReference
            });
        } else {
            console.error('Hubtel API Error:', hubtelData);
            // Mark transaction as failed if initiation failed
            await supabase
                .from('transactions')
                .update({ status: 'rejected', raw_initiate_response: hubtelData })
                .eq('id', transaction.id);

            return res.status(500).json({
                error: 'Failed to initiate payment with Hubtel',
                hubtelError: hubtelData
            });
        }

    } catch (error) {
        console.error('Error in Hubtel initiation:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
