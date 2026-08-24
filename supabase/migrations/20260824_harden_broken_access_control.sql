-- Migration: 20260824_harden_broken_access_control.sql
-- Description: Secures update_referral_transaction_status with public.is_admin() checks
--              and hardens get_pending_service_notifications against IDOR data exposure.

BEGIN;

-- 1. Secure update_referral_transaction_status with explicit admin authorization
CREATE OR REPLACE FUNCTION public.update_referral_transaction_status(p_tx_id UUID, p_status TEXT)
RETURNS JSON AS $$
DECLARE
    v_tx RECORD;
BEGIN
    -- Enforce strict admin access
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required.';
    END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Secure get_pending_service_notifications against unauthorized user enumeration (IDOR)
CREATE OR REPLACE FUNCTION public.get_pending_service_notifications(p_user_id UUID)
RETURNS TABLE (
    notification_id UUID,
    order_id TEXT,
    service_id UUID,
    message TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Verify caller owns the user_id or is an administrator
    IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: Access to service notifications denied.';
    END IF;

    RETURN QUERY
    SELECT 
        sn.id as notification_id,
        o.id as order_id,
        sn.service_id,
        sn.message,
        sn.image_url,
        sn.created_at
    FROM public.service_notifications sn
    JOIN public.orders o ON o.service_id = sn.service_id
    LEFT JOIN public.service_notification_acknowledgments sna 
        ON sna.notification_id = sn.id 
        AND sna.order_id = o.id 
        AND sna.user_id = p_user_id
    WHERE sn.is_active = true
      AND o.user_id = p_user_id
      AND sna.id IS NULL
    ORDER BY sn.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Explicit permissions
GRANT EXECUTE ON FUNCTION public.update_referral_transaction_status(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_service_notifications(UUID) TO authenticated, service_role;

COMMIT;
