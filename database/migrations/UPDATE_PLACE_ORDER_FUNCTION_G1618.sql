-- Migration: Update place_order_with_balance_deduction for G1618
-- This updates the atomic function to accept and store the G1618 order ID.

CREATE OR REPLACE FUNCTION place_order_with_balance_deduction(
    p_user_id UUID,
    p_link TEXT,
    p_quantity INTEGER,
    p_total_cost NUMERIC,
    p_service_id UUID DEFAULT NULL,
    p_package_id UUID DEFAULT NULL,
    p_smmgen_order_id TEXT DEFAULT NULL,
    p_smmcost_order_id TEXT DEFAULT NULL,
    p_jbsmmpanel_order_id INTEGER DEFAULT NULL,
    p_worldofsmm_order_id TEXT DEFAULT NULL,
    p_g1618_order_id TEXT DEFAULT NULL, -- New parameter
    p_idempotency_key TEXT DEFAULT NULL
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
    v_idempotency_check UUID;
BEGIN
    -- 1. Idempotency Check (if key provided)
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_idempotency_check 
        FROM orders 
        WHERE idempotency_key = p_idempotency_key 
        LIMIT 1;
        
        IF v_idempotency_check IS NOT NULL THEN
            -- Function acts as if it succeeded, returning the existing order info would be ideal 
            -- but for now we return a specific message so caller knows it was a duplicate
            -- We just return false to let caller handle it, or true if we want to be fully idempotent.
            -- Let's return FALSE with a specific message.
            RETURN QUERY SELECT FALSE, 'Duplicate order (idempotency key)', v_idempotency_check, 0::NUMERIC, 0::NUMERIC;
            RETURN;
        END IF;
    END IF;

    -- 2. Lock user profile and get current balance
    SELECT balance INTO v_user_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    -- Check if user exists
    IF v_user_balance IS NULL THEN
        RETURN QUERY SELECT FALSE, 'User not found', NULL::UUID, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    -- 3. Check sufficient funds
    IF v_user_balance < p_total_cost THEN
        RETURN QUERY SELECT FALSE, 'Insufficient balance', NULL::UUID, v_user_balance, v_user_balance;
        RETURN;
    END IF;

    -- 4. Deduct balance
    v_new_balance := v_user_balance - p_total_cost;

    UPDATE profiles
    SET balance = v_new_balance
    WHERE id = p_user_id;

    -- 5. Create Order
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
        jbsmmpanel_order_id,
        worldofsmm_order_id,
        g1618_order_id, -- New column
        idempotency_key,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_service_id,
        p_package_id,
        p_link,
        p_quantity,
        p_total_cost,
        'pending', -- Initial status
        p_smmgen_order_id,
        p_smmcost_order_id,
        p_jbsmmpanel_order_id,
        p_worldofsmm_order_id,
        p_g1618_order_id, -- New value
        p_idempotency_key,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_order_id;

    -- 6. Create Transaction Record
    INSERT INTO transactions (
        user_id,
        type,
        amount,
        status,
        description,
        order_id,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        'order',
        -p_total_cost, -- Negative amount for debit
        'approved',    -- Auto-approved since we just deducted
        CASE 
            WHEN p_service_id IS NOT NULL THEN 'Order for service ' || p_service_id
            ELSE 'Order for package ' || p_package_id
        END,
        v_order_id,
        NOW(),
        NOW()
    );

    -- 7. Return success
    RETURN QUERY SELECT TRUE, 'Order placed successfully', v_order_id, v_user_balance, v_new_balance;

EXCEPTION
    WHEN OTHERS THEN
        -- Rollback is automatic in Postgres functions usually, but we return failure
        RETURN QUERY SELECT FALSE, 'Database error: ' || SQLERRM, NULL::UUID, v_user_balance, v_user_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION place_order_with_balance_deduction(UUID, TEXT, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO service_role, authenticated;
