-- Verify and Fix place_order_with_balance_deduction function
-- This ensures the function includes the p_smmcost_order_id parameter
-- Run this in Supabase SQL Editor

-- First, check current function signature
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'place_order_with_balance_deduction';

-- Drop existing function with old signature (if exists)
DROP FUNCTION IF EXISTS place_order_with_balance_deduction(UUID, TEXT, INTEGER, NUMERIC, UUID, UUID, TEXT);

-- Create/Replace function with SMMCost support
CREATE OR REPLACE FUNCTION place_order_with_balance_deduction(
    p_user_id UUID,
    p_link TEXT,
    p_quantity INTEGER,
    p_total_cost NUMERIC,
    p_service_id UUID DEFAULT NULL,
    p_package_id UUID DEFAULT NULL,
    p_smmgen_order_id TEXT DEFAULT NULL,
    p_smmcost_order_id INTEGER DEFAULT NULL
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
    v_audit_log_id UUID;
    v_duplicate_transaction_id UUID;
BEGIN
    -- Validate that either service_id or package_id is provided
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
    FOR UPDATE;

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

    -- Check balance
    IF v_old_balance < p_total_cost THEN
        RETURN QUERY SELECT 
            FALSE, 
            'Insufficient balance'::TEXT,
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
        smmgen_order_id,
        smmcost_order_id
    ) VALUES (
        p_user_id,
        p_service_id,
        p_package_id,
        p_link,
        p_quantity,
        p_total_cost,
        'pending',
        p_smmgen_order_id,
        p_smmcost_order_id
    ) RETURNING id INTO v_order_id;

    -- Update balance atomically
    UPDATE profiles
    SET balance = v_new_balance
    WHERE id = p_user_id;
    
    v_balance_updated := TRUE;

    -- Create transaction record
    INSERT INTO transactions (
        user_id,
        amount,
        type,
        status,
        order_id
    ) VALUES (
        p_user_id,
        -p_total_cost, -- Negative for orders
        'order',
        'approved', -- Order transactions are immediately approved
        v_order_id
    ) RETURNING id INTO v_transaction_id;

    -- Link transaction to balance_audit_log if it exists
    -- Find the most recent balance_audit_log entry for this user that matches the balance change
    SELECT id INTO v_audit_log_id
    FROM balance_audit_log
    WHERE user_id = p_user_id
      AND change_amount = -p_total_cost
      AND transaction_id IS NULL
      AND created_at BETWEEN NOW() - INTERVAL '5 seconds' AND NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    -- Link transaction to audit log if found
    IF v_audit_log_id IS NOT NULL THEN
        UPDATE balance_audit_log
        SET transaction_id = v_transaction_id
        WHERE id = v_audit_log_id;
    END IF;

    -- Find and delete any duplicate manual_adjustment transactions created by the trigger
    -- These are transactions that match the same amount and time but are manual_adjustments
    SELECT id INTO v_duplicate_transaction_id
    FROM transactions
    WHERE user_id = p_user_id
      AND type = 'manual_adjustment'
      AND status = 'approved'
      AND ABS(amount - p_total_cost) < 0.01
      AND created_at BETWEEN NOW() - INTERVAL '10 seconds' AND NOW()
      AND id != v_transaction_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- If duplicate found, update balance_audit_log entries linked to it and delete it
    IF v_duplicate_transaction_id IS NOT NULL THEN
        -- Update any balance_audit_log entries linked to the duplicate to point to the order transaction
        UPDATE balance_audit_log
        SET transaction_id = v_transaction_id
        WHERE transaction_id = v_duplicate_transaction_id;

        -- Delete the duplicate manual_adjustment transaction
        DELETE FROM transactions
        WHERE id = v_duplicate_transaction_id;
    END IF;

    -- Success
    RETURN QUERY SELECT 
        TRUE, 
        'Order placed successfully and balance deducted'::TEXT,
        v_order_id,
        v_old_balance,
        v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission with correct signature
GRANT EXECUTE ON FUNCTION place_order_with_balance_deduction(UUID, TEXT, INTEGER, NUMERIC, UUID, UUID, TEXT, INTEGER) TO service_role, authenticated;

-- Add comment
COMMENT ON FUNCTION place_order_with_balance_deduction IS 'Atomically places an order, deducts balance, and creates a transaction record. Supports both SMMGen and SMMCost order IDs.';

-- Verify the function was created correctly
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'place_order_with_balance_deduction';
