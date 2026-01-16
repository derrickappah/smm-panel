-- Universal Atomic Deposit Approval Function
-- This function atomically approves deposit transactions and updates user balance
-- Supports all payment methods: Paystack, Korapay, Moolre, Moolre Web
-- Prevents race conditions by using row-level locking

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS approve_deposit_transaction_universal(UUID, TEXT, TEXT, TEXT);

-- Create universal function to atomically approve deposit and update balance
CREATE OR REPLACE FUNCTION approve_deposit_transaction_universal(
    p_transaction_id UUID,
    p_payment_method TEXT DEFAULT 'paystack',
    p_payment_status TEXT DEFAULT 'success',
    p_payment_reference TEXT DEFAULT NULL,
    p_actual_amount NUMERIC DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    old_status TEXT,
    new_status TEXT,
    old_balance NUMERIC,
    new_balance NUMERIC,
    final_amount NUMERIC
) AS $$
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

    -- Use actual amount if provided, otherwise fallback to stored transaction amount
    v_final_amount := COALESCE(p_actual_amount, v_transaction.amount, 0);

    -- Check if transaction is a deposit
    IF v_transaction.type != 'deposit' THEN
        RETURN QUERY SELECT FALSE, 'Transaction is not a deposit'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- Store old status
    v_old_status := v_transaction.status;

    -- If already approved, just verify balance and return (idempotent)
    IF v_transaction.status = 'approved' THEN
        -- Get current balance
        SELECT balance INTO v_old_balance
        FROM profiles
        WHERE id = v_transaction.user_id;

        RETURN QUERY SELECT 
            TRUE, 
            'Transaction already approved'::TEXT,
            v_old_status,
            'approved'::TEXT,
            v_old_balance,
            v_old_balance,
            v_transaction.amount; -- Return original amount for already approved
        RETURN;
    END IF;

    -- Only update if status is pending (prevent overwriting rejected transactions)
    IF v_transaction.status != 'pending' THEN
        RETURN QUERY SELECT 
            FALSE, 
            ('Transaction status is ' || v_transaction.status || ', cannot approve')::TEXT,
            v_old_status,
            v_old_status,
            NULL::NUMERIC,
            NULL::NUMERIC,
            v_final_amount;
        RETURN;
    END IF;

    -- Get user profile and lock it
    SELECT * INTO v_profile
    FROM profiles
    WHERE id = v_transaction.user_id
    FOR UPDATE; -- Lock the row to prevent concurrent balance updates

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'User profile not found'::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- Store old balance
    v_old_balance := COALESCE(v_profile.balance, 0);
    
    -- Calculate new balance using the validated amount from payment gateway
    v_new_balance := v_old_balance + v_final_amount;

    -- Update transaction status and amount atomically
    IF p_payment_method = 'paystack' THEN
        UPDATE transactions
        SET 
            status = 'approved',
            amount = v_final_amount,
            paystack_status = COALESCE(p_payment_status, paystack_status, 'success'),
            paystack_reference = COALESCE(p_payment_reference, paystack_reference)
        WHERE id = p_transaction_id
        AND status = 'pending';
    ELSIF p_payment_method = 'korapay' THEN
        UPDATE transactions
        SET 
            status = 'approved',
            amount = v_final_amount,
            korapay_status = COALESCE(p_payment_status, korapay_status, 'success'),
            korapay_reference = COALESCE(p_payment_reference, korapay_reference)
        WHERE id = p_transaction_id
        AND status = 'pending';
    ELSIF p_payment_method = 'moolre' OR p_payment_method = 'moolre_web' THEN
        UPDATE transactions
        SET 
            status = 'approved',
            amount = v_final_amount,
            moolre_status = COALESCE(p_payment_status, moolre_status, 'success'),
            moolre_reference = COALESCE(p_payment_reference, moolre_reference)
        WHERE id = p_transaction_id
        AND status = 'pending';
    ELSE
        -- Generic update for other payment methods
        UPDATE transactions
        SET 
            status = 'approved',
            amount = v_final_amount
        WHERE id = p_transaction_id
        AND status = 'pending';
        
        -- Try to update reference if provided
        IF p_payment_reference IS NOT NULL THEN
            BEGIN
                EXECUTE format('UPDATE transactions SET %I = $1 WHERE id = $2', 
                    p_payment_method || '_reference', p_payment_reference, p_transaction_id);
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;
    END IF;

    -- Check if update succeeded
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            FALSE, 
            'Transaction status changed during update (race condition)'::TEXT,
            v_old_status,
            (SELECT status FROM transactions WHERE id = p_transaction_id),
            v_old_balance,
            v_old_balance,
            v_final_amount;
        RETURN;
    END IF;

    -- Update user balance atomically
    UPDATE profiles
    SET balance = v_new_balance
    WHERE id = v_transaction.user_id;

    -- Verify the update succeeded
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            FALSE, 
            'Failed to update user balance'::TEXT,
            v_old_status,
            'approved'::TEXT,
            v_old_balance,
            v_old_balance,
            v_final_amount;
        RETURN;
    END IF;

    -- Link the transaction_id to the balance_audit_log entry
    UPDATE balance_audit_log
    SET transaction_id = p_transaction_id
    WHERE id = (
        SELECT id
        FROM balance_audit_log
        WHERE user_id = v_transaction.user_id
          AND transaction_id IS NULL
          AND change_amount = v_final_amount
          AND created_at >= NOW() - INTERVAL '2 seconds'
        ORDER BY created_at DESC
        LIMIT 1
    );

    -- Success
    RETURN QUERY SELECT 
        TRUE, 
        'Deposit approved and balance updated successfully'::TEXT,
        v_old_status,
        'approved'::TEXT,
        v_old_balance,
        v_new_balance,
        v_final_amount;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION approve_deposit_transaction_universal(UUID, TEXT, TEXT, TEXT, NUMERIC) TO service_role, authenticated;

-- Add comment
COMMENT ON FUNCTION approve_deposit_transaction_universal IS 'Atomically approves a deposit transaction and updates user balance using the EXACT amount paid to the gateway. Supports: paystack, korapay, moolre, moolre_web';

