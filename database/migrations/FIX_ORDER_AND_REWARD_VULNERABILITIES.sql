-- Migration: Fix 0 Cedi Order Vulnerability and Reward Abuse
-- 1. CLEANUP DUPLICATE REWARD CLAIMS
-- Keep only the earliest claim for each (user_id, claim_date)
WITH rows_to_keep AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id, claim_date ORDER BY created_at ASC) as rn
    FROM daily_reward_claims
)
DELETE FROM daily_reward_claims
WHERE id IN (
    SELECT id FROM rows_to_keep WHERE rn > 1
);

-- 2. ADD UNIQUE CONSTRAINT TO PREVENT FUTURE DUPLICATES
-- This ensures users can only claim one reward per day at the database level.
ALTER TABLE daily_reward_claims 
ADD CONSTRAINT daily_reward_claims_user_id_claim_date_key UNIQUE (user_id, claim_date);

-- 3. HARDEN create_secure_order RPC
-- Explicitly rejects zero or negative cost orders to prevent validation bypasses.
CREATE OR REPLACE FUNCTION create_secure_order(
    p_user_id UUID,
    p_service_id UUID,
    p_package_id UUID,
    p_link TEXT,
    p_quantity INTEGER,
    p_total_cost NUMERIC,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance NUMERIC;
    v_order_id UUID;
BEGIN
    -- SECURITY CHECK: Reject zero or negative cost orders
    IF p_total_cost <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid order cost. Must be greater than zero.');
    END IF;

    -- Get and Lock user profile
    SELECT balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
    
    IF v_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    IF v_balance < p_total_cost THEN
        RETURN jsonb_build_object('success', false, 'message', 'Insufficient balance');
    END IF;

    -- Create order in 'pending' status
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
$$;
