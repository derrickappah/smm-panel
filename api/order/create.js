import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';
import { placeProviderOrder, extractOrderId } from '../utils/providers.js';
import {
    cleanUrl,
    validateUrlForService,
    classifyProviderError,
} from '../utils/orderValidation.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';

export default async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // ── Authentication ────────────────────────────────────────────────────
        let user;
        try {
            const authResult = await verifyAuth(req);
            user = authResult.user;
        } catch (authError) {
            return res.status(401).json({
                error: 'Authentication required',
                message: authError.message,
            });
        }

        const { service_id, link: rawLink, quantity, comments } = req.body;

        // ── Basic field validation ────────────────────────────────────────────
        if (!rawLink || typeof rawLink !== 'string' || rawLink.trim() === '') {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (!quantity || !service_id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const quantityNum = parseInt(quantity);
        if (isNaN(quantityNum) || quantityNum <= 0) {
            return res.status(400).json({ error: 'Invalid quantity' });
        }

        const supabase = getServiceRoleClient();

        // ── STEP 1: Clean URL ─────────────────────────────────────────────────
        const cleanedLink = cleanUrl(rawLink.trim());
        if (!cleanedLink) {
            return res.status(400).json({ error: 'Enter a valid link.' });
        }

        console.log('[ORDER] URL cleaned:', { raw: rawLink.trim(), cleaned: cleanedLink });

        // ── Rate Limit Check ──────────────────────────────────────────────────
        const { count: recentOrderCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('created_at', new Date(Date.now() - 60000).toISOString());

        if (recentOrderCount > 10) {
            return res.status(429).json({ error: 'Too many orders. Please wait a minute.' });
        }

        // ── STEP 2: Resolve service ───────────────────────────────────────────
        const { data: service, error: sErr } = await supabase
            .from('services')
            .select('id, name, provider_id, provider_service_id, our_price_per_1000, min_quantity, max_quantity, status, url_type')
            .eq('id', service_id)
            .single();

        if (sErr || !service || service.status !== 'active') {
            return res.status(400).json({ error: 'Service not found or inactive' });
        }

        // Validate quantity bounds
        if (service.min_quantity && quantityNum < service.min_quantity) {
            return res.status(400).json({
                error: `Minimum quantity is ${service.min_quantity}`,
            });
        }
        if (service.max_quantity && quantityNum > service.max_quantity) {
            return res.status(400).json({
                error: `Maximum quantity is ${service.max_quantity}`,
            });
        }

        // ── STEP 3: URL Type Validation ───────────────────────────────────────
        const urlValidation = validateUrlForService(cleanedLink, service.url_type || null);
        if (!urlValidation.valid) {
            console.log('[ORDER] URL type validation failed:', {
                url: cleanedLink,
                required: service.url_type,
                message: urlValidation.message,
            });
            return res.status(400).json({ error: urlValidation.message });
        }

        // ── STEP 4: Duplicate Active Order Check ──────────────────────────────
        const { data: activeOrders } = await supabase
            .from('orders')
            .select('id, status, created_at')
            .eq('user_id', user.id)
            .eq('service_id', service_id)
            .eq('link', cleanedLink)
            .in('status', ['pending', 'processing', 'in_progress'])
            .limit(1);

        if (activeOrders && activeOrders.length > 0) {
            return res.status(409).json({ error: 'Active order already exists for this link.' });
        }

        // ── STEP 5: Atomic Balance Deduction & Order Creation ─────────────────
        // This RPC atomically: checks balance, deducts from wallets, creates order, creates transaction
        const { data: rpcResult, error: rpcError } = await supabase.rpc('create_order_with_wallet_payment', {
            p_user_id: user.id,
            p_service_id: service_id,
            p_link: cleanedLink,
            p_quantity: quantityNum,
        });

        if (rpcError) {
            console.error('[ORDER] RPC error:', rpcError);
            return res.status(500).json({
                error: 'Failed to process order',
                details: rpcError.message,
            });
        }

        if (!rpcResult?.success) {
            return res.status(400).json({
                error: rpcResult?.message || 'Failed to process order',
            });
        }

        const order_id = rpcResult.order_id;
        const totalPrice = rpcResult.total_price;

        console.log('[ORDER] Order created:', { order_id, totalPrice, service: service.name });

        // ── STEP 6: Get provider info and call Provider API ───────────────────
        if (service.provider_id && service.provider_service_id) {
            // Look up the provider to get the API URL and key
            const { data: provider } = await supabase
                .from('providers')
                .select('id, name, api_url, api_key, is_active')
                .eq('id', service.provider_id)
                .single();

            if (provider && provider.is_active && provider.api_url && provider.api_key) {
                try {
                    // Call the provider API to place the order
                    const providerResponse = await callProviderApi(provider, {
                        service: service.provider_service_id,
                        link: cleanedLink,
                        quantity: quantityNum,
                        comments: comments || undefined,
                    });

                    console.log('[ORDER] Provider response:', providerResponse);

                    // Extract the provider's order ID
                    const providerOrderId = providerResponse?.order
                        || providerResponse?.id
                        || providerResponse?.order_id
                        || null;

                    if (providerOrderId) {
                        // Update order with provider order ID and set status to processing
                        await supabase.from('orders').update({
                            provider_order_id: String(providerOrderId),
                            status: 'processing',
                            status_updated_at: new Date().toISOString(),
                        }).eq('id', order_id);
                    } else {
                        // Provider responded but no order ID — check for error
                        const providerError = providerResponse?.error || providerResponse?.message || 'No order ID returned';
                        console.error('[ORDER] Provider error:', providerError);

                        // Auto-refund on provider failure
                        await handleProviderFailure(supabase, order_id, user.id, totalPrice, providerError);

                        return res.status(200).json({
                            success: false,
                            refunded: true,
                            message: 'Provider failed. Your balance has been refunded.',
                            order_id,
                        });
                    }
                } catch (provErr) {
                    console.error('[ORDER] Provider call failed:', provErr.message);

                    // Auto-refund on provider exception
                    await handleProviderFailure(supabase, order_id, user.id, totalPrice, provErr.message);

                    return res.status(200).json({
                        success: false,
                        refunded: true,
                        message: 'Provider temporarily unavailable. Your balance has been refunded.',
                        order_id,
                    });
                }
            } else {
                // Provider not active or not configured — keep order pending
                console.log('[ORDER] Provider not active or configured, order stays pending');
            }
        }

        // ── STEP 7: Get updated wallet balance to return ──────────────────────
        const { data: wallet } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', user.id)
            .single();

        return res.status(200).json({
            success: true,
            order_id,
            total_price: totalPrice,
            new_balance: wallet?.balance ?? null,
        });

    } catch (error) {
        console.error('[ORDER] Unexpected error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Call a provider API to place an order
// ─────────────────────────────────────────────────────────────────────────────
async function callProviderApi(provider, orderParams) {
    const params = new URLSearchParams({
        key: provider.api_key,
        action: 'add',
        service: orderParams.service,
        link: orderParams.link,
        quantity: String(orderParams.quantity),
    });

    if (orderParams.comments) {
        params.append('comments', orderParams.comments);
    }

    const response = await fetch(provider.api_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
        signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
        throw new Error(`Provider API returned HTTP ${response.status}`);
    }

    return await response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle provider failure: refund the user
// ─────────────────────────────────────────────────────────────────────────────
async function handleProviderFailure(supabase, orderId, userId, refundAmount, errorMessage) {
    try {
        // Update order to failed
        await supabase.from('orders').update({
            status: 'failed',
            error_message: errorMessage,
            status_updated_at: new Date().toISOString(),
        }).eq('id', orderId);

        // Refund via the database function
        const { data: refundResult, error: refundError } = await supabase.rpc('process_order_refund', {
            p_order_id: orderId,
        });

        if (refundError || !refundResult?.success) {
            console.error('[ORDER] CRITICAL: Auto-refund failed!', {
                orderId,
                refundError: refundError?.message || refundResult?.message,
            });
        } else {
            console.log('[ORDER] Auto-refund successful:', { orderId, amount: refundAmount });
        }
    } catch (err) {
        console.error('[ORDER] CRITICAL: Refund exception:', err.message);
    }
}
