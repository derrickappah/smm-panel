-- Migration 256: Business Logic Harmonization and Cleanup
-- 1. Drop legacy dual referral triggers (standardize on 5% referral wallet system)
-- 2. Add updated_at column to orders table
-- 3. Enhance create_secure_order to explicitly record and link order transactions
-- 4. Drop dead/obsolete RPCs

-- ========================================================
-- STEP 1: Standardize on Referral Wallet System (Drop 10% legacy trigger)
-- ========================================================
DROP TRIGGER IF EXISTS trigger_award_referral_bonus ON public.transactions;
DROP TRIGGER IF EXISTS trigger_award_referral_bonus_insert ON public.transactions;
DROP FUNCTION IF EXISTS public.award_referral_bonus();

-- Ensure tr_process_referral_commission exists and is active
DROP TRIGGER IF EXISTS tr_process_referral_commission ON public.transactions;
CREATE TRIGGER tr_process_referral_commission
    AFTER UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.process_referral_commission();

-- ========================================================
-- STEP 2: Ensure updated_at column exists on orders
-- ========================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ========================================================
-- STEP 3: Update create_secure_order with explicit transaction linking
-- ========================================================
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
AS 
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

    -- Insert order
    INSERT INTO orders (
        user_id,
        service_id,
        promotion_package_id,
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
;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.create_secure_order(uuid, uuid, uuid, text, integer, numeric, text) TO authenticated, service_role;

-- ========================================================
-- STEP 4: Drop dead / superseded legacy RPCs
-- ========================================================
DROP FUNCTION IF EXISTS public.create_order_with_wallet_payment(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.approve_deposit_transaction(uuid, text, text);
DROP FUNCTION IF EXISTS public.approve_deposit_transaction_universal(uuid, text, text, text, numeric);
