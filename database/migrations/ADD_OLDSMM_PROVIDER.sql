-- Migration: Add OldSMM SMM Panel Support
-- This adds columns to map services, packages, and orders to the OldSMM provider, and updates the atomic placement RPC.

-- 1. Add oldsmm_service_id to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS oldsmm_service_id TEXT;

-- 2. Add oldsmm_service_id to promotion_packages table
ALTER TABLE promotion_packages ADD COLUMN IF NOT EXISTS oldsmm_service_id TEXT;

-- 3. Add oldsmm_order_id to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS oldsmm_order_id TEXT;

-- 4. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_services_oldsmm_id ON services(oldsmm_service_id);
CREATE INDEX IF NOT EXISTS idx_promotion_packages_oldsmm_id ON promotion_packages(oldsmm_service_id);
CREATE INDEX IF NOT EXISTS idx_orders_oldsmm_id ON orders(oldsmm_order_id);

-- 5. Add comments
COMMENT ON COLUMN services.oldsmm_service_id IS 'Service ID from OldSMM API used for mapping local services.';
COMMENT ON COLUMN promotion_packages.oldsmm_service_id IS 'Service ID from OldSMM API.';
COMMENT ON COLUMN orders.oldsmm_order_id IS 'Order ID returned by OldSMM API for tracking.';

-- 6. Drop existing versions of the place_order_with_balance_deduction function to avoid signature conflicts
DROP FUNCTION IF EXISTS place_order_with_balance_deduction(UUID, TEXT, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS place_order_with_balance_deduction(UUID, TEXT, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT);

-- 7. Create unified place_order_with_balance_deduction function
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
    p_g1618_order_id TEXT DEFAULT NULL,
    p_oldsmm_order_id TEXT DEFAULT NULL,
    p_comments TEXT DEFAULT NULL,
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
    v_transaction_id UUID;
    v_audit_log_id UUID;
    v_duplicate_transaction_id UUID;
BEGIN
    -- 1. Idempotency Check (if key provided)
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_idempotency_check 
        FROM orders 
        WHERE idempotency_key = p_idempotency_key 
        LIMIT 1;
        
        IF v_idempotency_check IS NOT NULL THEN
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
        RETURN QUERY SELECT FALSE, 'User profile not found', NULL::UUID, NULL::NUMERIC, NULL::NUMERIC;
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
        g1618_order_id,
        oldsmm_order_id,
        comments,
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
        'pending',
        p_smmgen_order_id,
        p_smmcost_order_id,
        p_jbsmmpanel_order_id,
        p_worldofsmm_order_id,
        p_g1618_order_id,
        p_oldsmm_order_id,
        p_comments,
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
        -p_total_cost,
        'approved',
        CASE 
            WHEN p_service_id IS NOT NULL THEN 'Order for service ' || p_service_id
            ELSE 'Order for package ' || p_package_id
        END,
        v_order_id,
        NOW(),
        NOW()
    ) RETURNING id INTO v_transaction_id;

    -- 7. Link transaction to balance_audit_log if it exists
    SELECT id INTO v_audit_log_id
    FROM balance_audit_log
    WHERE user_id = p_user_id
      AND change_amount = -p_total_cost
      AND transaction_id IS NULL
      AND created_at BETWEEN NOW() - INTERVAL '5 seconds' AND NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_audit_log_id IS NOT NULL THEN
        UPDATE balance_audit_log
        SET transaction_id = v_transaction_id
        WHERE id = v_audit_log_id;
    END IF;

    -- 8. Find and delete any duplicate manual_adjustment transactions created by the trigger
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

    IF v_duplicate_transaction_id IS NOT NULL THEN
        UPDATE balance_audit_log
        SET transaction_id = v_transaction_id
        WHERE transaction_id = v_duplicate_transaction_id;

        DELETE FROM transactions
        WHERE id = v_duplicate_transaction_id;
    END IF;

    -- 9. Return success
    RETURN QUERY SELECT TRUE, 'Order placed successfully', v_order_id, v_user_balance, v_new_balance;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, 'Database error: ' || SQLERRM, NULL::UUID, v_user_balance, v_user_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION place_order_with_balance_deduction(UUID, TEXT, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role, authenticated;

-- Add comment
COMMENT ON FUNCTION place_order_with_balance_deduction IS 'Atomically places an order, deducts balance, and creates a transaction record. Supports SMMGen, SMMCost, JBSMMPanel, WorldOfSMM, G1618, and OldSMM.';
