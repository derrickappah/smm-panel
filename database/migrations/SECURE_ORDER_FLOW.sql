-- Migration: Add idempotency and secure order functions

-- 1. Add idempotency_key to orders table if it doesn't exist
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(idempotency_key);

-- 2. Create RPC for secure order creation with balance check
CREATE OR REPLACE FUNCTION create_secure_order(
    p_user_id UUID,
    p_service_id UUID,
    p_package_id UUID,
    p_link TEXT,
    p_quantity INTEGER,
    p_total_cost NUMERIC,
    p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_balance NUMERIC;
    v_order_id UUID;
BEGIN
    -- Get and Lock user profile
    SELECT balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
    
    IF v_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    IF v_balance < p_total_cost THEN
        RETURN jsonb_build_object('success', false, 'message', 'Insufficient balance');
    END IF;

    -- Create order in 'pending_provider' status
    INSERT INTO orders (
        user_id,
        service_id,
        promotion_package_id,
        link,
        quantity,
        total_cost,
        status,
        idempotency_key
    ) VALUES (
        p_user_id,
        p_service_id,
        p_package_id,
        p_link,
        p_quantity,
        p_total_cost,
        'pending',
        p_idempotency_key
    ) RETURNING id INTO v_order_id;

    -- Deduct balance
    UPDATE profiles SET balance = v_balance - p_total_cost WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true, 
        'order_id', v_order_id, 
        'new_balance', v_balance - p_total_cost
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create RPC for refunding failed provider orders
CREATE OR REPLACE FUNCTION refund_failed_order(
    p_order_id UUID,
    p_user_id UUID,
    p_amount NUMERIC
)
RETURNS VOID AS $$
BEGIN
    -- Update order status
    UPDATE orders SET status = 'failed' WHERE id = p_order_id AND user_id = p_user_id;
    
    -- Refund balance
    UPDATE profiles SET balance = balance + p_amount WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
