-- Migration 264: Harden Universal Payment Approvals & Referral Concurrency
-- OWASP A06:2025 – Insecure Design Remediation
-- Description: Enhances approve_deposit_transaction_universal_v2 to handle Hubtel & KoraPay metadata atomically,
--              and enforces row-level locking (FOR UPDATE) in transfer_referral_to_main_wallet.

BEGIN;

-- ============================================================================
-- 1. Universal Atomic Deposit Approval Function (Hardened v2.1)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_deposit_transaction_universal_v2(
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
    -- 1. Lock the transaction row to prevent race conditions
    SELECT * INTO v_transaction
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- 2. Idempotency Check: check if provider_event_id was already credited on another transaction
    IF p_provider_event_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE (provider_event_id = p_provider_event_id OR moolre_id = p_provider_event_id OR hubtel_transaction_id = p_provider_event_id) 
          AND id != p_transaction_id 
          AND status = 'approved'
    ) THEN
        RETURN QUERY SELECT FALSE, 'Duplicate provider event ID detected'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- 3. Determine authoritative credit amount (prioritize actual amount verified from gateway)
    v_final_amount := COALESCE(p_actual_amount, v_transaction.amount, 0);

    IF v_final_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, 'Invalid deposit amount'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- 4. Validate transaction type
    IF v_transaction.type != 'deposit' THEN
        RETURN QUERY SELECT FALSE, 'Transaction is not a deposit'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    v_old_status := v_transaction.status;

    -- 5. If already approved, return idempotent success without duplicate crediting
    IF v_transaction.status = 'approved' THEN
        SELECT balance INTO v_old_balance FROM public.profiles WHERE id = v_transaction.user_id;
        RETURN QUERY SELECT TRUE, 'Transaction already approved'::TEXT, v_old_status, 'approved'::TEXT, v_old_balance, v_old_balance, v_transaction.amount;
        RETURN;
    END IF;

    -- 6. Check if status allows approval
    IF v_transaction.status NOT IN ('pending', 'rejected', 'expired') THEN
        RETURN QUERY SELECT FALSE, ('Transaction status is ' || v_transaction.status || ', cannot approve')::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- 7. If expired, require admin authorization
    IF v_transaction.status = 'expired' AND p_admin_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Only admins can approve an expired deposit'::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- 8. Lock user profile row before balance mutation
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_transaction.user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'User profile not found'::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    v_old_balance := COALESCE(v_profile.balance, 0);
    v_new_balance := v_old_balance + v_final_amount;

    -- 9. Update transaction record
    UPDATE public.transactions
    SET 
        status = 'approved',
        amount = v_final_amount,
        payment_method = COALESCE(p_payment_method, payment_method, deposit_method),
        provider_event_id = COALESCE(p_provider_event_id, provider_event_id),
        paystack_status = CASE WHEN p_payment_method = 'paystack' THEN COALESCE(p_payment_status, paystack_status, 'success') ELSE paystack_status END,
        paystack_reference = CASE WHEN p_payment_method = 'paystack' THEN COALESCE(p_payment_reference, paystack_reference) ELSE paystack_reference END,
        korapay_status = CASE WHEN p_payment_method = 'korapay' THEN COALESCE(p_payment_status, korapay_status, 'success') ELSE korapay_status END,
        korapay_reference = CASE WHEN p_payment_method = 'korapay' THEN COALESCE(p_payment_reference, korapay_reference) ELSE korapay_reference END,
        moolre_status = CASE WHEN p_payment_method IN ('moolre', 'moolre_web') THEN COALESCE(p_payment_status, moolre_status, 'success') ELSE moolre_status END,
        moolre_reference = CASE WHEN p_payment_method IN ('moolre', 'moolre_web') THEN COALESCE(p_payment_reference, moolre_reference) ELSE moolre_reference END,
        hubtel_status = CASE WHEN p_payment_method = 'hubtel' THEN COALESCE(p_payment_status, hubtel_status, 'Paid') ELSE hubtel_status END,
        hubtel_transaction_id = CASE WHEN p_payment_method = 'hubtel' THEN COALESCE(p_provider_event_id, hubtel_transaction_id) ELSE hubtel_transaction_id END,
        admin_approved_by = COALESCE(p_admin_id, admin_approved_by),
        admin_approved_at = CASE WHEN p_admin_id IS NOT NULL THEN NOW() ELSE admin_approved_at END,
        updated_at = NOW()
    WHERE id = p_transaction_id;

    -- 10. Atomic balance update
    UPDATE public.profiles 
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_transaction.user_id;

    RETURN QUERY SELECT TRUE, 'Deposit approved successfully'::TEXT, v_old_status, 'approved'::TEXT, v_old_balance, v_new_balance, v_final_amount;
END;
$$;

-- Secure execution permissions
REVOKE EXECUTE ON FUNCTION public.approve_deposit_transaction_universal_v2(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_deposit_transaction_universal_v2(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID) TO service_role;


-- ============================================================================
-- 2. Referral Transfer with Row-Level Locking (FOR UPDATE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transfer_referral_to_main_wallet(p_amount DECIMAL)
RETURNS JSON 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_balance DECIMAL;
    v_profile_balance DECIMAL;
BEGIN
    -- Check authentication
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Authentication required');
    END IF;

    -- Validation: Minimum amount
    IF p_amount < 0.1 THEN
        RETURN json_build_object('success', false, 'message', 'Minimum transfer amount is GHS 0.1');
    END IF;

    -- Lock referral wallet row FOR UPDATE to prevent race conditions / double spends
    SELECT balance INTO v_current_balance
    FROM public.referral_wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

    -- Validation: Insufficient balance
    IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
        RETURN json_build_object('success', false, 'message', 'Insufficient referral balance');
    END IF;

    -- Lock profiles row FOR UPDATE
    SELECT balance INTO v_profile_balance
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'User profile not found');
    END IF;

    -- Atomic Transfers
    -- a. Deduct from referral wallet
    UPDATE public.referral_wallets
    SET balance = balance - p_amount,
        total_withdrawn = total_withdrawn + p_amount,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    -- b. Add to main profile balance
    UPDATE public.profiles
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE id = v_user_id;

    -- c. Log in referral transactions
    INSERT INTO public.referral_transactions (user_id, amount, type, status, description)
    VALUES (v_user_id, -p_amount, 'transfer', 'completed', 'Transfer to main wallet');

    -- d. Log in main transactions for history
    INSERT INTO public.transactions (user_id, amount, type, status, description, deposit_method)
    VALUES (v_user_id, p_amount, 'deposit', 'approved', 'Transfer from referral earnings', 'referral_commission');

    RETURN json_build_object(
        'success', true, 
        'message', 'Transferred GHS ' || p_amount || ' to main wallet successfully',
        'new_referral_balance', v_current_balance - p_amount,
        'new_main_balance', v_profile_balance + p_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_referral_to_main_wallet(DECIMAL) TO authenticated;

COMMIT;
