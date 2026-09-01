-- Migration: Automatic Refund Function for Combo Builder Orders
-- Creates atomic stored function to credit user balances and log refund transactions for combo parent/child orders

CREATE OR REPLACE FUNCTION process_combo_builder_refund(
    p_parent_order_id UUID,
    p_child_order_id UUID DEFAULT NULL,
    p_refund_amount DECIMAL DEFAULT 0,
    p_refund_type TEXT DEFAULT 'partial',
    p_reason TEXT DEFAULT 'Combo sub-order cancellation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_parent RECORD;
    v_user_id UUID;
    v_new_balance DECIMAL;
BEGIN
    SELECT * INTO v_parent FROM combo_parent_orders WHERE id = p_parent_order_id FOR UPDATE;

    IF v_parent IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Combo parent order not found');
    END IF;

    v_user_id := v_parent.user_id;

    IF p_refund_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be greater than zero');
    END IF;

    -- Update profile balance
    UPDATE profiles
    SET balance = balance + p_refund_amount
    WHERE id = v_user_id
    RETURNING balance INTO v_new_balance;

    -- Insert into transactions (order_id is NULL to avoid foreign key violation with public.orders)
    INSERT INTO transactions (user_id, amount, type, status, description, order_id)
    VALUES (v_user_id, p_refund_amount, 'refund', 'approved', p_reason, NULL);

    -- Log to combo_logs
    INSERT INTO combo_logs (parent_order_id, child_order_id, log_type, message, details)
    VALUES (
        p_parent_order_id,
        p_child_order_id,
        'refund',
        'Automatic refund of ₵' || p_refund_amount || ' credited to wallet',
        jsonb_build_object(
            'amount', p_refund_amount,
            'refund_type', p_refund_type,
            'reason', p_reason,
            'new_balance', v_new_balance
        )
    );

    -- If full refund, update parent status to refunded
    IF p_refund_type = 'full' THEN
        UPDATE combo_parent_orders
        SET status = 'refunded',
            updated_at = NOW()
        WHERE id = p_parent_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'amount_refunded', p_refund_amount,
        'new_balance', v_new_balance,
        'type', p_refund_type
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION process_combo_builder_refund(UUID, UUID, DECIMAL, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION process_combo_builder_refund(UUID, UUID, DECIMAL, TEXT, TEXT) TO authenticated;
