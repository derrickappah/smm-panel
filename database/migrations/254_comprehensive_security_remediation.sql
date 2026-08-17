-- Migration 254: Comprehensive Security & Database Integrity Remediation
-- Description: Locks down RPC function permissions, restricts table mutation privileges,
--              hardens Row-Level Security (RLS) policies, and secures sensitive settings.

BEGIN;

-- ============================================================================
-- 1. RPC PRIVILEGE HARDENING (Financial & Administrative Functions)
-- ============================================================================

-- Revoke dangerous deposit approval RPCs from authenticated and public roles
REVOKE EXECUTE ON FUNCTION public.approve_deposit_transaction_universal_v2(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_deposit_transaction_universal(UUID, TEXT, TEXT, TEXT, NUMERIC) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_deposit_transaction(UUID, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_deposit_transaction_universal_v2(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID) TO service_role;

-- Revoke refund execution from authenticated users (must only be called by service_role / backend worker)
REVOKE EXECUTE ON FUNCTION public.refund_failed_order(UUID, UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_failed_order(UUID, UUID) TO service_role;

-- Revoke unprivileged audit log maintenance & sensitive telemetry functions
REVOKE EXECUTE ON FUNCTION public.cleanup_old_activity_logs(INTEGER) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_security_events(INTEGER) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.export_activity_logs(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_activity_statistics(INTEGER) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_old_activity_logs(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_security_events(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.export_activity_logs(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_activity_statistics(INTEGER) TO service_role;

-- Revoke manual referral bonus awarding functions from regular authenticated users
REVOKE EXECUTE ON FUNCTION public.process_referral_bonus_manual(UUID, UUID) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_all_missed_referral_bonuses() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.diagnose_referral_bonus(UUID, UUID) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_referral_bonus_manual(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_all_missed_referral_bonuses() TO service_role;
GRANT EXECUTE ON FUNCTION public.diagnose_referral_bonus(UUID, UUID) TO service_role;

-- ============================================================================
-- 2. TABLE LEVEL PRIVILEGES HARDENING
-- ============================================================================

-- Orders: Users must never insert directly via PostgREST; orders must go through backend RPC
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated, anon, public;
GRANT SELECT ON public.orders TO authenticated;

-- Transactions: Users must never update or delete transactions directly
REVOKE UPDATE, DELETE ON public.transactions FROM authenticated, anon, public;
GRANT SELECT, INSERT ON public.transactions TO authenticated;

-- Daily reward claims: Users must never insert arbitrary claims directly via PostgREST
REVOKE INSERT, UPDATE, DELETE ON public.daily_reward_claims FROM authenticated, anon, public;
GRANT SELECT ON public.daily_reward_claims TO authenticated;

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES HARDENING
-- ============================================================================

-- A. Orders Table
DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public insert on orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;

CREATE POLICY "Users can view own orders" 
  ON public.orders FOR SELECT TO authenticated 
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders" 
  ON public.orders FOR SELECT TO authenticated 
  USING (public.is_admin());

-- B. Transactions Table
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can create own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;

CREATE POLICY "Users can view own transactions" 
  ON public.transactions FOR SELECT TO authenticated 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own pending deposit transactions" 
  ON public.transactions FOR INSERT TO authenticated 
  WITH CHECK (
    auth.uid() = user_id 
    AND status = 'pending' 
    AND type = 'deposit'
    AND amount > 0
  );

CREATE POLICY "Admins can view all transactions" 
  ON public.transactions FOR SELECT TO authenticated 
  USING (public.is_admin());

-- C. Daily Reward Claims Table
DROP POLICY IF EXISTS "Users can insert own reward claims" ON public.daily_reward_claims;
DROP POLICY IF EXISTS "Users can view own reward claims" ON public.daily_reward_claims;
DROP POLICY IF EXISTS "Admins can view all reward claims" ON public.daily_reward_claims;

CREATE POLICY "Users can view own reward claims" 
  ON public.daily_reward_claims FOR SELECT TO authenticated 
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reward claims" 
  ON public.daily_reward_claims FOR ALL TO authenticated 
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- D. App Settings Table (Prevent credential leakage like moolre_vaskey)
DROP POLICY IF EXISTS "Authenticated users can read app settings" ON public.app_settings;
DROP POLICY IF EXISTS "rls_app_settings_select_public" ON public.app_settings;
DROP POLICY IF EXISTS "Public can read terms and conditions" ON public.app_settings;
DROP POLICY IF EXISTS "Public can read whatsapp number" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can read app settings" ON public.app_settings;

CREATE POLICY "Admins full access to app_settings"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "rls_app_settings_public_whitelist" 
  ON public.app_settings FOR SELECT TO anon, authenticated
  USING (
    key = ANY (ARRAY[
      'payment_method_paystack_enabled'::text,
      'payment_method_manual_enabled'::text,
      'payment_method_hubtel_enabled'::text,
      'payment_method_korapay_enabled'::text,
      'payment_method_moolre_enabled'::text,
      'payment_method_moolre_web_enabled'::text,
      'payment_method_paystack_min_deposit'::text,
      'payment_method_manual_min_deposit'::text,
      'payment_method_hubtel_min_deposit'::text,
      'payment_method_korapay_min_deposit'::text,
      'payment_method_moolre_min_deposit'::text,
      'payment_method_moolre_web_min_deposit'::text,
      'manual_deposit_phone_number'::text,
      'manual_deposit_account_name'::text,
      'manual_deposit_instructions'::text,
      'whatsapp_number'::text,
      'terms_and_conditions'::text,
      'require_captcha'::text,
      'require_otp'::text,
      'require_phone_verification'::text,
      'moolre_sender_id'::text,
      'support_phone_number'::text
    ])
  );

-- E. Profiles Table (Ensure WITH CHECK is enforced)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE TO authenticated 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 4. HARDEN SECURITY DEFINER FUNCTION INTERNAL CHECKS
-- ============================================================================

-- Secure refund_failed_order with caller defense
CREATE OR REPLACE FUNCTION refund_failed_order(
    p_order_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_balance NUMERIC;
    v_refund_amount NUMERIC;
BEGIN
    -- 1. Lock the order row to prevent race-condition refunds
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Order not found or access denied');
    END IF;

    -- 2. Validate order status — cannot refund already refunded or completed orders
    IF v_order.status IN ('refunded', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Order cannot be refunded with current status: ' || v_order.status);
    END IF;

    -- 3. Check if already refunded in order_refunds tracking table if present
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'order_refunds'
    ) THEN
        IF EXISTS (SELECT 1 FROM public.order_refunds WHERE order_id = p_order_id::TEXT) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Order has already been refunded');
        END IF;
    END IF;

    -- 4. Derive refund amount strictly from DB total_cost
    v_refund_amount := COALESCE(v_order.total_cost, 0);
    IF v_refund_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Order has no refundable balance');
    END IF;

    -- 5. Lock and update profile balance
    SELECT balance INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User profile not found');
    END IF;

    -- Update order status to refunded
    UPDATE public.orders
    SET status = 'refunded'
    WHERE id = p_order_id;

    -- Credit user balance
    UPDATE public.profiles
    SET balance = v_balance + v_refund_amount
    WHERE id = p_user_id;

    -- Log transaction for auditability
    INSERT INTO public.transactions (
        user_id,
        amount,
        type,
        status,
        description
    ) VALUES (
        p_user_id,
        v_refund_amount,
        'refund',
        'approved',
        'Automatic refund for failed order ' || p_order_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'refunded_amount', v_refund_amount,
        'new_balance', v_balance + v_refund_amount
    );
END;
$$;

-- Secure approve_deposit_transaction_universal_v2 with defense-in-depth checks
CREATE OR REPLACE FUNCTION approve_deposit_transaction_universal_v2(
    p_transaction_id UUID,
    p_payment_method TEXT DEFAULT 'paystack',
    p_payment_status TEXT DEFAULT 'success',
    p_payment_reference TEXT DEFAULT NULL,
    p_actual_amount NUMERIC DEFAULT NULL,
    p_provider_event_id TEXT DEFAULT NULL,
    p_admin_id UUID DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    old_status TEXT,
    new_status TEXT,
    old_balance NUMERIC,
    new_balance NUMERIC,
    final_amount NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transaction RECORD;
    v_profile RECORD;
    v_old_status TEXT;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
    v_final_amount NUMERIC;
BEGIN
    -- Get transaction details and lock the row
    SELECT * INTO v_transaction
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Idempotency check: provider event ID already processed on another transaction?
    IF p_provider_event_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE (provider_event_id = p_provider_event_id OR moolre_id = p_provider_event_id) 
          AND id != p_transaction_id 
          AND status = 'approved'
    ) THEN
        RETURN QUERY SELECT FALSE, 'Duplicate provider event ID detected'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Use actual amount if provided and positive, otherwise fallback to stored transaction amount
    v_final_amount := COALESCE(p_actual_amount, v_transaction.amount, 0);

    IF v_final_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, 'Invalid deposit amount'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- Check if transaction is a deposit
    IF v_transaction.type != 'deposit' THEN
        RETURN QUERY SELECT FALSE, 'Transaction is not a deposit'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    v_old_status := v_transaction.status;

    -- If already approved, return idempotent success
    IF v_transaction.status = 'approved' THEN
        SELECT balance INTO v_old_balance FROM public.profiles WHERE id = v_transaction.user_id;
        RETURN QUERY SELECT TRUE, 'Transaction already approved'::TEXT, v_old_status, 'approved'::TEXT, v_old_balance, v_old_balance, v_transaction.amount;
        RETURN;
    END IF;

    -- Check if status is pending, rejected, or expired
    IF v_transaction.status NOT IN ('pending', 'rejected', 'expired') THEN
        RETURN QUERY SELECT FALSE, ('Transaction status is ' || v_transaction.status || ', cannot approve')::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- If status is expired, require admin approval (p_admin_id must not be null)
    IF v_transaction.status = 'expired' AND p_admin_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Only admins can approve an expired deposit'::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- Get user profile and lock it
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_transaction.user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'User profile not found'::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    v_old_balance := COALESCE(v_profile.balance, 0);
    v_new_balance := v_old_balance + v_final_amount;

    -- Update transaction
    UPDATE public.transactions
    SET 
        status = 'approved',
        amount = v_final_amount,
        provider_event_id = COALESCE(p_provider_event_id, provider_event_id),
        paystack_status = CASE WHEN p_payment_method = 'paystack' THEN COALESCE(p_payment_status, paystack_status, 'success') ELSE paystack_status END,
        paystack_reference = CASE WHEN p_payment_method = 'paystack' THEN COALESCE(p_payment_reference, paystack_reference) ELSE paystack_reference END,
        korapay_status = CASE WHEN p_payment_method = 'korapay' THEN COALESCE(p_payment_status, korapay_status, 'success') ELSE korapay_status END,
        korapay_reference = CASE WHEN p_payment_method = 'korapay' THEN COALESCE(p_payment_reference, korapay_reference) ELSE korapay_reference END,
        moolre_status = CASE WHEN p_payment_method IN ('moolre', 'moolre_web') THEN COALESCE(p_payment_status, moolre_status, 'success') ELSE moolre_status END,
        moolre_reference = CASE WHEN p_payment_method IN ('moolre', 'moolre_web') THEN COALESCE(p_payment_reference, moolre_reference) ELSE moolre_reference END,
        admin_approved_by = COALESCE(p_admin_id, admin_approved_by),
        admin_approved_at = CASE WHEN p_admin_id IS NOT NULL THEN NOW() ELSE admin_approved_at END
    WHERE id = p_transaction_id;

    -- Update user balance
    UPDATE public.profiles SET balance = v_new_balance WHERE id = v_transaction.user_id;

    RETURN QUERY SELECT TRUE, 'Deposit approved successfully'::TEXT, v_old_status, 'approved'::TEXT, v_old_balance, v_new_balance, v_final_amount;
END;
$$;

COMMIT;
