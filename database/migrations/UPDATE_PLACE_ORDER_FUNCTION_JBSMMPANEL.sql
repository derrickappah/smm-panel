-- Update place_order_with_balance_deduction function to include jbsmmpanel_order_id
-- This migration adds support for JB SMM Panel order IDs in the order placement function

-- Drop the old function
DROP FUNCTION IF EXISTS place_order_with_balance_deduction(UUID, TEXT, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT);

-- Recreate with jbsmmpanel_order_id parameter (INTEGER, like the database column)
CREATE OR REPLACE FUNCTION place_order_with_balance_deduction(
    p_user_id UUID,
    p_link TEXT,
    p_quantity INTEGER,
    p_total_cost NUMERIC,
    p_service_id UUID DEFAULT NULL,
    p_package_id UUID DEFAULT NULL,
    p_smmgen_order_id TEXT DEFAULT NULL,
    p_smmcost_order_id TEXT DEFAULT NULL,
    p_jbsmmpanel_order_id INTEGER DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    order_id UUID,
    old_balance NUMERIC,
    new_balance NUMERIC
) AS $$
DECLARE
    v_user_balance NUMERIC;
    v_new_balance NUMERIC;
    v_order_id UUID;
BEGIN
    -- Get current user balance
    SELECT balance INTO v_user_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE; -- Lock the row for update
    
    -- Check if user exists
    IF v_user_balance IS NULL THEN
        RETURN QUERY SELECT FALSE, 'User not found', NULL::UUID, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;
    
    -- Check if user has sufficient balance
    IF v_user_balance < p_total_cost THEN
        RETURN QUERY SELECT FALSE, 'Insufficient balance', NULL::UUID, v_user_balance, v_user_balance;
        RETURN;
    END IF;
    
    -- Calculate new balance
    v_new_balance := v_user_balance - p_total_cost;
    
    -- Create the order
    INSERT INTO orders (
        user_id,
        service_id,
        promotion_package_id,
        link,
        quantity,
        total_cost,
        status,
        smmgen_order_id,
        smmcost_order_id,
        jbsmmpanel_order_id
    )
    VALUES (
        p_user_id,
        p_service_id,
        p_package_id,
        p_link,
        p_quantity,
        p_total_cost,
        'pending',
        p_smmgen_order_id,
        p_smmcost_order_id,
        p_jbsmmpanel_order_id
    )
    RETURNING id INTO v_order_id;
    
    -- Update user balance
    UPDATE profiles
    SET balance = v_new_balance
    WHERE id = p_user_id;
    
    -- Return success result
    RETURN QUERY SELECT TRUE, 'Order placed successfully and balance deducted', v_order_id, v_user_balance, v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION place_order_with_balance_deduction(UUID, TEXT, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, INTEGER) TO service_role, authenticated;
