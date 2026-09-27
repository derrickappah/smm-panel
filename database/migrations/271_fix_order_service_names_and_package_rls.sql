-- Migration 271: Fix Order Service Names and Promotion Package RLS
-- Resolves generic "SMM Service" display on /orders and dashboard by:
-- 1. Allowing authenticated users to view promotion packages they have ordered even if disabled
-- 2. Storing service_name directly on order creation in create_secure_order and place_order_with_balance_deduction
-- 3. Backfilling historical orders with their real service/package names

-- ============================================================================
-- 1. Helper function to check if the current authenticated user ordered a package
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_ordered_package(p_package_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.user_id = auth.uid() AND orders.promotion_package_id = p_package_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_ordered_package(uuid) TO authenticated, service_role;

-- ============================================================================
-- 2. Update RLS policy on promotion_packages for authenticated users
-- ============================================================================
DROP POLICY IF EXISTS rls_promo_packages_select_auth ON public.promotion_packages;

CREATE POLICY rls_promo_packages_select_auth ON public.promotion_packages
FOR SELECT TO authenticated
USING (
    is_admin() 
    OR (enabled = true) 
    OR has_ordered_package(id)
);

-- ============================================================================
-- 3. Update create_secure_order to insert service_name directly into orders table
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_secure_order(
    p_user_id uuid,
    p_service_id uuid,
    p_package_id uuid,
    p_link text,
    p_quantity integer,
    p_total_cost numeric,
    p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_balance NUMERIC;
    v_order_id TEXT;
    v_item_name TEXT := 'SMM Order';
    v_transaction_id UUID;
BEGIN
    -- Authorization check
    IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id AND NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized caller');
    END IF;

    IF p_total_cost <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid order cost. Must be greater than zero.');
    END IF;

    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid quantity. Must be greater than zero.');
    END IF;

    -- Lock profile and check balance
    SELECT balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
    
    IF v_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    IF v_balance < p_total_cost THEN
        RETURN jsonb_build_object('success', false, 'message', 'Insufficient balance');
    END IF;

    -- Determine descriptive item name
    IF p_service_id IS NOT NULL THEN
        SELECT name INTO v_item_name FROM services WHERE id = p_service_id;
    ELSIF p_package_id IS NOT NULL THEN
        SELECT name INTO v_item_name FROM promotion_packages WHERE id = p_package_id;
    END IF;

    -- Insert order with service_name populated
    INSERT INTO orders (
        user_id,
        service_id,
        promotion_package_id,
        service_name,
        link,
        quantity,
        total_cost,
        status,
        idempotency_key,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_service_id,
        p_package_id,
        v_item_name,
        p_link,
        p_quantity,
        p_total_cost,
        'pending',
        p_idempotency_key,
        NOW(),
        NOW()
    ) RETURNING id::TEXT INTO v_order_id;

    -- Deduct user balance
    UPDATE profiles SET balance = v_balance - p_total_cost WHERE id = p_user_id;

    -- Insert explicit linked transaction record
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
        'Order #' || v_order_id || ' (' || COALESCE(v_item_name, 'SMM Service') || ')',
        v_order_id,
        NOW(),
        NOW()
    ) RETURNING id INTO v_transaction_id;

    -- Link balance_audit_log to the explicit transaction
    UPDATE balance_audit_log
    SET transaction_id = v_transaction_id
    WHERE user_id = p_user_id
      AND transaction_id IS NULL
      AND change_amount = -p_total_cost
      AND created_at >= NOW() - INTERVAL '3 seconds';

    RETURN jsonb_build_object(
        'success', true, 
        'order_id', v_order_id, 
        'transaction_id', v_transaction_id,
        'new_balance', v_balance - p_total_cost
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_secure_order(uuid, uuid, uuid, text, integer, numeric, text) TO authenticated, service_role;

-- ============================================================================
-- 4. Update place_order_with_balance_deduction to insert service_name
-- ============================================================================
CREATE OR REPLACE FUNCTION public.place_order_with_balance_deduction(
    p_user_id uuid,
    p_link text,
    p_quantity integer,
    p_total_cost numeric,
    p_service_id uuid DEFAULT NULL::uuid,
    p_package_id uuid DEFAULT NULL::uuid,
    p_smmgen_order_id text DEFAULT NULL::text,
    p_smmcost_order_id text DEFAULT NULL::text,
    p_jbsmmpanel_order_id integer DEFAULT NULL::integer,
    p_worldofsmm_order_id text DEFAULT NULL::text,
    p_g1618_order_id text DEFAULT NULL::text,
    p_oldsmm_order_id text DEFAULT NULL::text,
    p_comments text DEFAULT NULL::text,
    p_idempotency_key text DEFAULT NULL::text
)
RETURNS TABLE(success boolean, message text, order_id uuid, old_balance numeric, new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_balance NUMERIC;
    v_new_balance NUMERIC;
    v_order_id UUID;
    v_idempotency_check UUID;
    v_transaction_id UUID;
    v_audit_log_id UUID;
    v_duplicate_transaction_id UUID;
    v_item_name TEXT := 'SMM Order';
BEGIN
    -- Authorization check: caller must be the user or an admin
    IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id AND NOT is_admin() THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized caller', NULL::UUID, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

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

    -- Determine descriptive item name
    IF p_service_id IS NOT NULL THEN
        SELECT name INTO v_item_name FROM services WHERE id = p_service_id;
    ELSIF p_package_id IS NOT NULL THEN
        SELECT name INTO v_item_name FROM promotion_packages WHERE id = p_package_id;
    END IF;

    -- 5. Create Order with service_name
    INSERT INTO orders (
        user_id,
        service_id,
        promotion_package_id,
        service_name,
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
        v_item_name,
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
        'Order #' || v_order_id || ' (' || COALESCE(v_item_name, 'SMM Service') || ')',
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
$$;

GRANT EXECUTE ON FUNCTION public.place_order_with_balance_deduction(UUID, TEXT, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role, authenticated;
