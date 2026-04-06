-- Allow transactions that were marked 'rejected' (e.g. from polling timeouts)
-- to be successfully approved if a late webhook arrives or if an Admin manually verifies.
-- This ensures users are properly credited if they pay after the 3-minute UI timeout.

CREATE OR REPLACE FUNCTION approve_deposit_transaction_universal_v2(
    p_transaction_id UUID,
    p_payment_method TEXT,
    p_payment_status TEXT,
    p_payment_reference TEXT,
    p_actual_amount NUMERIC DEFAULT NULL,
    p_provider_event_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    old_status TEXT,
    new_status TEXT,
    old_balance NUMERIC,
    new_balance NUMERIC,
    amount_credited NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
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
    FROM transactions
    WHERE id = p_transaction_id
    FOR UPDATE; -- Lock the row to prevent concurrent updates

    -- Check if transaction exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Idempotency check: event already processed?
    IF p_provider_event_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM transactions 
        WHERE provider_event_id = p_provider_event_id AND id != p_transaction_id
    ) THEN
        RETURN QUERY SELECT FALSE, 'Duplicate provider event ID detected'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Use actual amount if provided, otherwise fallback to stored transaction amount
    v_final_amount := COALESCE(p_actual_amount, v_transaction.amount, 0);

    -- Check if transaction is a deposit
    IF v_transaction.type != 'deposit' THEN
        RETURN QUERY SELECT FALSE, 'Transaction is not a deposit'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- Store old status
    v_old_status := v_transaction.status;

    -- If already approved, return success (idempotent)
    IF v_transaction.status = 'approved' THEN
        SELECT balance INTO v_old_balance FROM profiles WHERE id = v_transaction.user_id;
        RETURN QUERY SELECT TRUE, 'Transaction already approved'::TEXT, v_old_status, 'approved'::TEXT, v_old_balance, v_old_balance, v_transaction.amount;
        RETURN;
    END IF;

    -- Check if status is pending OR rejected (to allow overriding timeouts)
    IF v_transaction.status NOT IN ('pending', 'rejected') THEN
        RETURN QUERY SELECT FALSE, ('Transaction status is ' || v_transaction.status || ', cannot approve')::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- Get user profile and lock it
    SELECT * INTO v_profile FROM profiles WHERE id = v_transaction.user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'User profile not found'::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- Store balances
    v_old_balance := COALESCE(v_profile.balance, 0);
    v_new_balance := v_old_balance + v_final_amount;

    -- Update transaction
    UPDATE transactions
    SET 
        status = 'approved',
        amount = v_final_amount,
        provider_event_id = COALESCE(p_provider_event_id, provider_event_id),
        paystack_status = CASE WHEN p_payment_method = 'paystack' THEN COALESCE(p_payment_status, paystack_status, 'success') ELSE paystack_status END,
        paystack_reference = CASE WHEN p_payment_method = 'paystack' THEN COALESCE(p_payment_reference, paystack_reference) ELSE paystack_reference END,
        korapay_status = CASE WHEN p_payment_method = 'korapay' THEN COALESCE(p_payment_status, korapay_status, 'success') ELSE korapay_status END,
        korapay_reference = CASE WHEN p_payment_method = 'korapay' THEN COALESCE(p_payment_reference, korapay_reference) ELSE korapay_reference END,
        moolre_status = CASE WHEN p_payment_method IN ('moolre', 'moolre_web') THEN COALESCE(p_payment_status, moolre_status, 'success') ELSE moolre_status END,
        moolre_reference = CASE WHEN p_payment_method IN ('moolre', 'moolre_web') THEN COALESCE(p_payment_reference, moolre_reference) ELSE moolre_reference END
    WHERE id = p_transaction_id;

    -- Update user balance
    UPDATE profiles SET balance = v_new_balance WHERE id = v_transaction.user_id;

    -- Success
    RETURN QUERY SELECT TRUE, 'Deposit approved successfully'::TEXT, v_old_status, 'approved'::TEXT, v_old_balance, v_new_balance, v_final_amount;
END;
$$;
