-- Fix Deposit Status Update - Atomic Function
-- This migration creates a database function that atomically updates transaction status and user balance
-- This prevents race conditions and ensures consistency

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS approve_deposit_transaction(UUID, TEXT, TEXT);

-- Create function to atomically approve deposit and update balance
CREATE OR REPLACE FUNCTION approve_deposit_transaction(
    p_transaction_id UUID,
    p_paystack_status TEXT DEFAULT 'success',
    p_paystack_reference TEXT DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    old_status TEXT,
    new_status TEXT,
    old_balance NUMERIC,
    new_balance NUMERIC
) AS $$
DECLARE
    v_transaction RECORD;
    v_profile RECORD;
    v_old_status TEXT;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Get transaction details
    SELECT * INTO v_transaction
    FROM transactions
    WHERE id = p_transaction_id
    FOR UPDATE; -- Lock the row to prevent concurrent updates

    -- Check if transaction exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Check if transaction is a deposit
    IF v_transaction.type != 'deposit' THEN
        RETURN QUERY SELECT FALSE, 'Transaction is not a deposit'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Store old status
    v_old_status := v_transaction.status;

    -- If already approved, just verify balance and return
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
            v_old_balance;
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
            NULL::NUMERIC;
        RETURN;
    END IF;

    -- Get user profile and lock it
    SELECT * INTO v_profile
    FROM profiles
    WHERE id = v_transaction.user_id
    FOR UPDATE; -- Lock the row to prevent concurrent balance updates

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'User profile not found'::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Store old balance
    v_old_balance := COALESCE(v_profile.balance, 0);
    
    -- Calculate new balance
    v_new_balance := v_old_balance + COALESCE(v_transaction.amount, 0);

    -- Update transaction status atomically
    UPDATE transactions
    SET 
        status = 'approved',
        paystack_status = COALESCE(p_paystack_status, paystack_status, 'success'),
        paystack_reference = COALESCE(p_paystack_reference, paystack_reference)
    WHERE id = p_transaction_id
    AND status = 'pending'; -- Only update if still pending (double-check)

    -- Check if update succeeded
    IF NOT FOUND THEN
        -- Status changed between lock and update (race condition)
        RETURN QUERY SELECT 
            FALSE, 
            'Transaction status changed during update (race condition)'::TEXT,
            v_old_status,
            (SELECT status FROM transactions WHERE id = p_transaction_id),
            v_old_balance,
            v_old_balance;
        RETURN;
    END IF;

    -- Update user balance atomically
    UPDATE profiles
    SET balance = v_new_balance
    WHERE id = v_transaction.user_id;

    -- Verify the update succeeded
    IF NOT FOUND THEN
        -- Rollback transaction status (in a real transaction, this would be automatic)
        -- For now, we'll log the error
        RETURN QUERY SELECT 
            FALSE, 
            'Failed to update user balance'::TEXT,
            v_old_status,
            'approved'::TEXT, -- Status was updated but balance wasn't
            v_old_balance,
            v_old_balance;
        RETURN;
    END IF;

    -- Success
    RETURN QUERY SELECT 
        TRUE, 
        'Deposit approved and balance updated successfully'::TEXT,
        v_old_status,
        'approved'::TEXT,
        v_old_balance,
        v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to service_role and authenticated users
GRANT EXECUTE ON FUNCTION approve_deposit_transaction(UUID, TEXT, TEXT) TO service_role, authenticated;

-- Add comment
COMMENT ON FUNCTION approve_deposit_transaction IS 'Atomically approves a deposit transaction and updates user balance. Prevents race conditions by using row-level locking.';

-- Test query (commented out - uncomment to test)
-- SELECT * FROM approve_deposit_transaction('your-transaction-id-here'::UUID, 'success', 'ref_123');












