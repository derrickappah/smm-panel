-- Create Atomic Order Placement Function
-- This function atomically places an order, deducts balance, and creates a transaction record
-- Prevents race conditions by using row-level locking
-- 
-- Run this in your Supabase SQL Editor

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS place_order_with_balance_deduction(UUID, UUID, UUID, TEXT, INTEGER, NUMERIC, TEXT);

-- Create function to atomically place order and deduct balance
CREATE OR REPLACE FUNCTION place_order_with_balance_deduction(
    p_user_id UUID,
    p_service_id UUID DEFAULT NULL,
    p_package_id UUID DEFAULT NULL,
    p_link TEXT,
    p_quantity INTEGER,
    p_total_cost NUMERIC,
    p_smmgen_order_id TEXT DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    order_id UUID,
    old_balance NUMERIC,
    new_balance NUMERIC
) AS $$
DECLARE
    v_profile RECORD;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
    v_order_id UUID;
    v_transaction_id UUID;
    v_balance_updated BOOLEAN := FALSE;
BEGIN
    -- Validate that either service_id or package_id is provided (but not both required)
    IF p_service_id IS NULL AND p_package_id IS NULL THEN
        RETURN QUERY SELECT 
            FALSE, 
            'Either service_id or package_id must be provided'::TEXT,
            NULL::UUID,
            NULL::NUMERIC,
            NULL::NUMERIC;
        RETURN;
    END IF;

    -- Validate total_cost is positive
    IF p_total_cost <= 0 THEN
        RETURN QUERY SELECT 
            FALSE, 
            'Total cost must be greater than zero'::TEXT,
            NULL::UUID,
            NULL::NUMERIC,
            NULL::NUMERIC;
        RETURN;
    END IF;

    -- Get user profile and lock it to prevent concurrent balance updates
    SELECT * INTO v_profile
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE; -- Lock the row to prevent concurrent updates

    -- Check if user exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            FALSE, 
            'User profile not found'::TEXT,
            NULL::UUID,
            NULL::NUMERIC,
            NULL::NUMERIC;
        RETURN;
    END IF;

    -- Store old balance
    v_old_balance := COALESCE(v_profile.balance, 0);

    -- Check if user has sufficient balance
    IF v_old_balance < p_total_cost THEN
        RETURN QUERY SELECT 
            FALSE, 
            ('Insufficient balance. Required: ' || p_total_cost || ', Available: ' || v_old_balance)::TEXT,
            NULL::UUID,
            v_old_balance,
            v_old_balance;
        RETURN;
    END IF;

    -- Calculate new balance
    v_new_balance := v_old_balance - p_total_cost;

    -- Create order record
    INSERT INTO orders (
        user_id,
        service_id,
        promotion_package_id,
        link,
        quantity,
        total_cost,
        status,
        smmgen_order_id
    ) VALUES (
        p_user_id,
        p_service_id,
        p_package_id,
        p_link,
        p_quantity,
        p_total_cost,
        'pending',
        p_smmgen_order_id
    )
    RETURNING id INTO v_order_id;

    -- Check if order was created
    IF v_order_id IS NULL THEN
        RETURN QUERY SELECT 
            FALSE, 
            'Failed to create order'::TEXT,
            NULL::UUID,
            v_old_balance,
            v_old_balance;
        RETURN;
    END IF;

    -- Atomically deduct balance using WHERE clause to ensure sufficient balance
    -- This prevents race conditions where balance might have changed
    UPDATE profiles
    SET balance = balance - p_total_cost
    WHERE id = p_user_id
    AND balance >= p_total_cost; -- Only update if balance is still sufficient

    -- Check if balance was updated
    GET DIAGNOSTICS v_balance_updated = ROW_COUNT;

    IF NOT v_balance_updated THEN
        -- Balance update failed (likely insufficient balance due to race condition)
        -- Rollback: Delete the order we just created
        DELETE FROM orders WHERE id = v_order_id;
        
        RETURN QUERY SELECT 
            FALSE, 
            'Failed to deduct balance (insufficient funds or concurrent order)'::TEXT,
            NULL::UUID,
            v_old_balance,
            v_old_balance;
        RETURN;
    END IF;

    -- Get the actual new balance after update
    SELECT balance INTO v_new_balance
    FROM profiles
    WHERE id = p_user_id;

    -- Create transaction record for the order
    INSERT INTO transactions (
        user_id,
        amount,
        type,
        status,
        order_id
    ) VALUES (
        p_user_id,
        p_total_cost,
        'order',
        'approved',
        v_order_id
    )
    RETURNING id INTO v_transaction_id;

    -- Link transaction to balance_audit_log if it exists
    -- This prevents the create_transaction_from_audit_trigger from creating a duplicate
    UPDATE balance_audit_log
    SET transaction_id = v_transaction_id
    WHERE user_id = p_user_id
    AND transaction_id IS NULL
    AND change_amount = -p_total_cost
    AND created_at >= NOW() - INTERVAL '5 seconds'
    AND id = (
        SELECT id FROM balance_audit_log
        WHERE user_id = p_user_id
        AND transaction_id IS NULL
        AND change_amount = -p_total_cost
        AND created_at >= NOW() - INTERVAL '5 seconds'
        ORDER BY created_at DESC
        LIMIT 1
    );

    -- Success
    RETURN QUERY SELECT 
        TRUE, 
        'Order placed successfully and balance deducted'::TEXT,
        v_order_id,
        v_old_balance,
        v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to service_role and authenticated users
GRANT EXECUTE ON FUNCTION place_order_with_balance_deduction(UUID, UUID, UUID, TEXT, INTEGER, NUMERIC, TEXT) TO service_role, authenticated;

-- Add comment
COMMENT ON FUNCTION place_order_with_balance_deduction IS 'Atomically places an order, deducts balance, and creates a transaction record. Prevents race conditions by using row-level locking and atomic balance updates.';
