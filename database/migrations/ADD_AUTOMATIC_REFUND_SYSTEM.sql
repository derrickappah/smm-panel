-- Automatic Refund System with Permanent One-Time Protection
-- Includes order_refunds table and atomic refund function
-- Run this in Supabase SQL Editor

-- 1. Create order_refunds table to track processed refunds
-- This provides database-level protection against double refunds via UNIQUE constraint
CREATE TABLE IF NOT EXISTS order_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id TEXT NOT NULL REFERENCES orders(id) UNIQUE, -- Changed to TEXT to match orders.id
    user_id UUID NOT NULL REFERENCES profiles(id),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    type TEXT NOT NULL CHECK (type IN ('full', 'partial')),
    remains INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_order_refunds_order_id ON order_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_user_id ON order_refunds(user_id);

-- 2. Create atomic function to process refunds
-- This ensures that balance credit and order status update happen in one transaction
-- Uses row-level locking to prevent race conditions
CREATE OR REPLACE FUNCTION process_automatic_refund(
    p_order_id TEXT, -- Changed to TEXT to match orders.id
    p_refund_amount DECIMAL,
    p_refund_type TEXT,
    p_remains INTEGER DEFAULT 0
) RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_refund_id UUID;
    v_current_balance DECIMAL;
BEGIN
    -- 1. Lock the order row to prevent concurrent status updates
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;
    
    -- 2. Check if already refunded in order_refunds table (Permanent protection)
    -- This is redundant with the UNIQUE constraint but provides a cleaner error message
    IF EXISTS (SELECT 1 FROM order_refunds WHERE order_id = p_order_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order already refunded');
    END IF;
    
    -- 3. Validate refund amount
    IF p_refund_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid refund amount: must be greater than zero');
    END IF;

    -- 4. Insert into order_refunds (This will fail with exception if UNIQUE constraint is violated)
    INSERT INTO order_refunds (order_id, user_id, amount, type, remains)
    VALUES (p_order_id, v_order.user_id, p_refund_amount, p_refund_type, p_remains)
    RETURNING id INTO v_refund_id;
    
    -- 5. Credit user balance
    UPDATE profiles 
    SET balance = balance + p_refund_amount 
    WHERE id = v_order.user_id;

    -- 6. Update order status and refund tracking
    UPDATE orders 
    SET 
        status = CASE WHEN p_refund_type = 'full' THEN 'refunded' ELSE 'partial' END,
        refund_status = 'succeeded',
        refund_attempted_at = NOW(),
        -- Store the refund detail in a JSON column if it exists or in remarks
        refund_error = NULL -- Clear any previous error
    WHERE id = p_order_id;
    
    -- 7. Get new balance for logging
    SELECT balance INTO v_current_balance FROM profiles WHERE id = v_order.user_id;
    
    RETURN jsonb_build_object(
        'success', true, 
        'refund_id', v_refund_id,
        'amount_refunded', p_refund_amount,
        'new_balance', v_current_balance,
        'type', p_refund_type
    );

EXCEPTION WHEN OTHERS THEN
    -- In case of any error (e.g., UNIQUE constraint violation), the whole transaction rolls back
    RETURN jsonb_build_object(
        'success', false, 
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION process_automatic_refund(TEXT, DECIMAL, TEXT, INTEGER) TO service_role;

-- Add comments
COMMENT ON TABLE order_refunds IS 'Stores permanent records of orders that have been refunded to prevent duplicate processing.';
COMMENT ON FUNCTION process_automatic_refund IS 'Atomically processes an automatic order refund, credits user wallet, and updates order status. Uses UNIQUE constraint on order_refunds for ultimate protection.';
