-- 244_admin_referral_management.sql
-- Administrative functions for referral management

CREATE OR REPLACE FUNCTION public.update_referral_transaction_status(p_tx_id UUID, p_status TEXT)
RETURNS JSON AS $$
DECLARE
    v_tx RECORD;
BEGIN
    -- 1. Get the transaction
    SELECT * INTO v_tx FROM public.referral_transactions WHERE id = p_tx_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Transaction not found');
    END IF;

    -- 2. Validate status
    IF p_status NOT IN ('completed', 'failed') THEN
        RETURN json_build_object('success', false, 'message', 'Invalid status. Use completed or failed.');
    END IF;

    -- 3. If transitioning FROM pending TO failed, refund the balance
    IF v_tx.status = 'pending' AND p_status = 'failed' AND v_tx.type = 'withdrawal' THEN
        UPDATE public.referral_wallets
        SET balance = balance + ABS(v_tx.amount),
            total_withdrawn = total_withdrawn - ABS(v_tx.amount),
            updated_at = NOW()
        WHERE user_id = v_tx.user_id;
    END IF;

    -- 4. Update the transaction status
    UPDATE public.referral_transactions
    SET status = p_status
    WHERE id = p_tx_id;

    RETURN json_build_object('success', true, 'message', 'Transaction status updated to ' || p_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to service_role (admins)
GRANT EXECUTE ON FUNCTION public.update_referral_transaction_status TO service_role;
