-- Migration 252: Harden Refund Functions and Restrict Anonymous Schema Privileges
-- Addresses Threat Vector 2 (Authorization/Access-Control), 8 (Wallet Integrity), 16 & 29 (Database & RLS Hardening)

-- 1. SECURE REFUND FUNCTION: Locks row, validates owner & status, derives amount strictly from order record
DROP FUNCTION IF EXISTS refund_failed_order(UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS refund_failed_order(UUID, UUID);

CREATE OR REPLACE FUNCTION refund_failed_order(
    p_order_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_balance NUMERIC;
    v_refund_amount NUMERIC;
BEGIN
    -- 1. Lock the order row to prevent race-condition refunds
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Order not found or access denied');
    END IF;

    -- 2. Validate order status — cannot refund already refunded or completed orders
    IF v_order.status IN ('refunded', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Order cannot be refunded with current status: ' || v_order.status);
    END IF;

    -- 3. Check if already refunded in order_refunds tracking table if present
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'order_refunds'
    ) THEN
        IF EXISTS (SELECT 1 FROM public.order_refunds WHERE order_id = p_order_id::TEXT) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Order has already been refunded');
        END IF;
    END IF;

    -- 4. Derive refund amount strictly from DB total_cost
    v_refund_amount := COALESCE(v_order.total_cost, 0);
    IF v_refund_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Order has no refundable balance');
    END IF;

    -- 5. Lock and update profile balance
    SELECT balance INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User profile not found');
    END IF;

    -- Update order status to refunded
    UPDATE public.orders
    SET status = 'refunded'
    WHERE id = p_order_id;

    -- Credit user balance
    UPDATE public.profiles
    SET balance = v_balance + v_refund_amount
    WHERE id = p_user_id;

    -- Log transaction for auditability
    INSERT INTO public.transactions (
        user_id,
        amount,
        type,
        status,
        description
    ) VALUES (
        p_user_id,
        v_refund_amount,
        'refund',
        'approved',
        'Automatic refund for failed order ' || p_order_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'refunded_amount', v_refund_amount,
        'new_balance', v_balance + v_refund_amount
    );
END;
$$;

-- Restrict execution to service_role and authenticated users
REVOKE EXECUTE ON FUNCTION refund_failed_order(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION refund_failed_order(UUID, UUID) TO authenticated, service_role;

-- 2. SCHEMA PRIVILEGES HARDENING
-- Revoke excessive write/all privileges from anonymous role
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Grant minimal necessary read permissions on public catalogs
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.services TO anon, authenticated;
GRANT SELECT ON public.faqs TO anon, authenticated;
GRANT SELECT ON public.updates TO anon, authenticated;
GRANT SELECT ON public.video_tutorials TO anon, authenticated;
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT SELECT ON public.promotion_packages TO anon, authenticated;
GRANT SELECT ON public.reward_tiers TO anon, authenticated;
GRANT SELECT ON public.knowledge_base_articles TO anon, authenticated;

-- Comment for tracking
COMMENT ON FUNCTION refund_failed_order(UUID, UUID) IS 'Secure atomic refund RPC that derives refund amount directly from database total_cost to prevent client parameter tampering.';
