-- Migration: Reward Processing & Orders Integration (FIXED TYPES)
-- Enable processing claims to SMM panels and tracking as orders

-- 1. Update daily_reward_claims table
ALTER TABLE daily_reward_claims 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES orders(id), -- Changed to TEXT to match orders.id
ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id);

-- 2. Update orders table to tag rewards
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS is_reward BOOLEAN DEFAULT FALSE;

-- 3. RPC: Admin Create Reward Order
-- Creates an order record for a claim (Pre-API Call)
CREATE OR REPLACE FUNCTION admin_create_reward_order(
    claim_id_param UUID,
    service_id_param UUID,
    quantity_param INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_admin BOOLEAN;
    claim_record RECORD;
    new_order_id TEXT; -- Changed to TEXT
BEGIN
    -- Auth check
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Admin check
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = current_user_id AND role = 'admin'
    ) INTO is_admin;

    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    -- Get Claim
    SELECT * INTO claim_record FROM daily_reward_claims WHERE id = claim_id_param;
    IF claim_record IS NULL THEN
        RAISE EXCEPTION 'Claim not found';
    END IF;

    IF claim_record.status = 'processed' THEN
         RAISE EXCEPTION 'Claim already processed';
    END IF;

    -- Generate a temporary TEXT ID (or let SMM provider generate it later)
    -- Since orders.id is TEXT and Primary Key, we must provide a unique value.
    -- We can use a generated UUID as string for now.
    new_order_id := uuid_generate_v4()::text;

    -- Create Order (Cost = 0, is_reward = TRUE)
    INSERT INTO orders (
        id, -- Must provide since it's PK and TEXT
        user_id,
        service_id, 
        link,
        quantity,
        total_cost,
        status,
        is_reward,
        created_at
    ) VALUES (
        new_order_id,
        claim_record.user_id,
        service_id_param,
        claim_record.link,
        quantity_param,
        0, -- Free
        'pending',
        TRUE,
        NOW()
    );
    
    -- Update Claim
    UPDATE daily_reward_claims
    SET 
        status = 'processed',
        order_id = new_order_id,
        service_id = service_id_param
    WHERE id = claim_id_param;

    RETURN json_build_object(
        'success', true,
        'order_id', new_order_id
    );
END;
$$;
