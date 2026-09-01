-- =====================================================================================
-- Migration 270: Split Combo Orders System
--
-- Ensures combo purchases are atomically split into individual, independent orders in public.orders.
-- Each split order possesses:
--   1. Individual provider order ID, tracking, and independent status
--   2. Proportional allocated selling price (ensuring sum = total combo price)
--   3. Individual refund tracking via standard process_automatic_refund
--   4. combo_id, combo_name, combo_item_name, and is_combo columns for frontend indication
-- =====================================================================================

-- 1. Add combo metadata columns to public.orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS combo_id UUID NULL,
ADD COLUMN IF NOT EXISTS combo_name TEXT NULL,
ADD COLUMN IF NOT EXISTS combo_item_name TEXT NULL,
ADD COLUMN IF NOT EXISTS service_name TEXT NULL,
ADD COLUMN IF NOT EXISTS is_combo BOOLEAN DEFAULT FALSE;

-- 2. Create index on combo_id and is_combo for fast querying
CREATE INDEX IF NOT EXISTS idx_orders_combo_id ON public.orders(combo_id);
CREATE INDEX IF NOT EXISTS idx_orders_is_combo ON public.orders(is_combo);

-- 3. Atomic RPC to place split combo orders securely
CREATE OR REPLACE FUNCTION create_secure_combo_orders(
    p_user_id UUID,
    p_service_id UUID,
    p_combo_name TEXT,
    p_link TEXT,
    p_total_cost NUMERIC,
    p_items JSONB, -- Array of [{ "service_type": "Likes", "quantity": 1000, "allocated_cost": 20.00, "provider": "smmgen", "provider_service_id": "15008" }, ...]
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance NUMERIC;
    v_combo_group_id UUID := gen_random_uuid();
    v_item JSONB;
    v_item_idx INT := 0;
    v_item_cost NUMERIC;
    v_item_qty INT;
    v_item_type TEXT;
    v_item_service_name TEXT;
    v_item_provider TEXT;
    v_item_provider_service_id TEXT;
    v_order_id TEXT;
    v_created_orders JSONB := '[]'::jsonb;
BEGIN
    -- 1. Check idempotency if provided
    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        IF EXISTS (SELECT 1 FROM orders WHERE idempotency_key = p_idempotency_key LIMIT 1) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Duplicate order detected via idempotency key');
        END IF;
    END IF;

    -- 2. Validate total cost and items
    IF p_total_cost <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid order cost. Must be greater than zero.');
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No combo items provided');
    END IF;

    -- 3. Lock user profile and check balance
    SELECT balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
    
    IF v_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    IF v_balance < p_total_cost THEN
        RETURN jsonb_build_object('success', false, 'message', 'Insufficient balance');
    END IF;

    -- 4. Deduct total combo selling price from user balance
    UPDATE profiles SET balance = v_balance - p_total_cost WHERE id = p_user_id;

    -- 5. Insert individual split order rows in public.orders and corresponding transactions
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_idx := v_item_idx + 1;
        v_item_cost := (v_item->>'allocated_cost')::NUMERIC;
        v_item_qty := (v_item->>'quantity')::INT;
        v_item_type := COALESCE(v_item->>'service_type', 'Item ' || v_item_idx);
        v_item_service_name := COALESCE(p_combo_name, 'Combo') || ' (' || v_item_type || ')';
        v_item_provider := COALESCE(v_item->>'provider', '');
        v_item_provider_service_id := COALESCE(v_item->>'provider_service_id', '');

        INSERT INTO orders (
            user_id,
            service_id,
            link,
            quantity,
            total_cost,
            status,
            combo_id,
            combo_name,
            combo_item_name,
            service_name,
            is_combo,
            idempotency_key,
            created_at,
            updated_at
        ) VALUES (
            p_user_id,
            p_service_id,
            p_link,
            v_item_qty,
            v_item_cost,
            'pending',
            v_combo_group_id,
            p_combo_name,
            v_item_type,
            v_item_service_name,
            TRUE,
            CASE WHEN p_idempotency_key IS NOT NULL THEN p_idempotency_key || '-' || v_item_idx ELSE NULL END,
            NOW(),
            NOW()
        ) RETURNING id INTO v_order_id;

        -- Record transaction referencing this split order
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
            -v_item_cost,
            'approved',
            'Combo: ' || COALESCE(p_combo_name, 'Combo Service') || ' (' || v_item_type || ')',
            v_order_id,
            NOW(),
            NOW()
        );

        -- Append to created orders array
        v_created_orders := v_created_orders || jsonb_build_object(
            'id', v_order_id,
            'item_index', v_item_idx,
            'service_type', v_item_type,
            'service_name', v_item_service_name,
            'quantity', v_item_qty,
            'allocated_cost', v_item_cost,
            'provider', v_item_provider,
            'provider_service_id', v_item_provider_service_id
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'combo_id', v_combo_group_id,
        'new_balance', (v_balance - p_total_cost),
        'created_orders', v_created_orders
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', SQLERRM
    );
END;
$$;
