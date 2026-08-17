import { verifyAdmin, getServiceRoleClient } from '../../utils/auth.js';

/**
 * Admin Transaction Lifecycle View
 * 
 * This endpoint provides a detailed view of a transaction's lifecycle
 * across all payment providers, including Hubtel specific logs.
 */
export default async function handler(req, res) {
    const { clientReference } = req.query;

    if (!clientReference) {
        return res.status(400).json({ error: 'Missing clientReference' });
    }

    try {
        const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
        if (!isAdmin) {
            return res.status(403).json({ error: 'Access denied: Admin only' });
        }

        const supabase = getServiceRoleClient();

        // 2. Fetch full transaction details
        const { data: transaction, error: fetchError } = await supabase
            .from('transactions')
            .select(`
        *,
        user:profiles(email, full_name)
      `)
            .eq('client_reference', clientReference)
            .single();

        if (fetchError || !transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // 3. Return lifecycle data
        return res.status(200).json({
            success: true,
            transaction: {
                id: transaction.id,
                user: transaction.user,
                amount: transaction.amount,
                status: transaction.status,
                method: transaction.deposit_method,
                clientReference: transaction.client_reference,
                hubtel: {
                    checkoutId: transaction.checkout_id,
                    transactionId: transaction.hubtel_transaction_id,
                    initiateResponse: transaction.raw_initiate_response,
                    callbackPayload: transaction.raw_callback,
                    statusCheckResponse: transaction.raw_status_check
                },
                timestamps: {
                    created: transaction.created_at,
                    updated: transaction.updated_at
                }
            }
        });

    } catch (error) {
        console.error('Error fetching administrative transaction details:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
