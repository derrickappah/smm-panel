-- Fix Referral Bonus System
-- This migration fixes the referral bonus issue where deposits don't trigger bonuses
-- and provides tools to retroactively process missed bonuses

-- ============================================
-- PART 1: Diagnostic Function
-- ============================================

CREATE OR REPLACE FUNCTION diagnose_referral_bonus(p_user_id UUID DEFAULT NULL, p_transaction_id UUID DEFAULT NULL)
RETURNS TABLE (
    has_referral_record BOOLEAN,
    referral_id UUID,
    referrer_id UUID,
    referee_id UUID,
    bonus_awarded BOOLEAN,
    first_deposit_amount DECIMAL(10, 2),
    referral_bonus DECIMAL(10, 2),
    transaction_id UUID,
    transaction_amount DECIMAL(10, 2),
    transaction_status TEXT,
    transaction_type TEXT,
    is_first_deposit BOOLEAN,
    referrer_balance DECIMAL(10, 2),
    can_process_bonus BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_referee_id UUID;
    v_transaction_id UUID;
    v_referral_record RECORD;
    v_transaction_record RECORD;
    v_referrer_balance DECIMAL(10, 2);
    v_is_first_deposit BOOLEAN;
    v_can_process BOOLEAN := false;
    v_error_msg TEXT;
BEGIN
    -- Determine referee_id
    IF p_user_id IS NOT NULL THEN
        v_referee_id := p_user_id;
    ELSIF p_transaction_id IS NOT NULL THEN
        SELECT user_id INTO v_referee_id
        FROM transactions
        WHERE id = p_transaction_id;
    ELSE
        RETURN QUERY SELECT 
            false, NULL::UUID, NULL::UUID, NULL::UUID, false, 
            NULL::DECIMAL, NULL::DECIMAL, NULL::UUID, NULL::DECIMAL, 
            NULL::TEXT, NULL::TEXT, false, NULL::DECIMAL, false,
            'No user_id or transaction_id provided'::TEXT;
        RETURN;
    END IF;

    -- Get referral record
    SELECT * INTO v_referral_record
    FROM referrals
    WHERE referee_id = v_referee_id
    LIMIT 1;

    -- Get transaction record
    IF p_transaction_id IS NOT NULL THEN
        SELECT * INTO v_transaction_record
        FROM transactions
        WHERE id = p_transaction_id;
    ELSE
        -- Get first approved deposit for this user
        SELECT * INTO v_transaction_record
        FROM transactions
        WHERE user_id = v_referee_id
        AND type = 'deposit'
        AND status = 'approved'
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- Get referrer balance if referral exists
    IF v_referral_record IS NOT NULL THEN
        SELECT balance INTO v_referrer_balance
        FROM profiles
        WHERE id = v_referral_record.referrer_id;
    END IF;

    -- Check if this is first deposit
    IF v_transaction_record IS NOT NULL THEN
        v_is_first_deposit := NOT EXISTS (
            SELECT 1 FROM transactions
            WHERE user_id = v_referee_id
            AND type = 'deposit'
            AND status = 'approved'
            AND id != v_transaction_record.id
            AND created_at < v_transaction_record.created_at
        );
    END IF;

    -- Determine if bonus can be processed
    IF v_referral_record IS NOT NULL 
       AND v_transaction_record IS NOT NULL
       AND v_transaction_record.status = 'approved'
       AND v_transaction_record.type = 'deposit'
       AND NOT v_referral_record.bonus_awarded
       AND v_is_first_deposit THEN
        v_can_process := true;
    ELSIF v_referral_record IS NULL THEN
        v_error_msg := 'No referral record found for this user';
    ELSIF v_transaction_record IS NULL THEN
        v_error_msg := 'No approved deposit transaction found';
    ELSIF v_referral_record.bonus_awarded THEN
        v_error_msg := 'Bonus already awarded';
    ELSIF NOT v_is_first_deposit THEN
        v_error_msg := 'This is not the first deposit';
    ELSE
        v_error_msg := 'Unknown error';
    END IF;

    -- Return diagnostic results
    RETURN QUERY SELECT
        (v_referral_record IS NOT NULL),
        COALESCE(v_referral_record.id, NULL::UUID),
        COALESCE(v_referral_record.referrer_id, NULL::UUID),
        COALESCE(v_referral_record.referee_id, NULL::UUID),
        COALESCE(v_referral_record.bonus_awarded, false),
        v_referral_record.first_deposit_amount,
        v_referral_record.referral_bonus,
        COALESCE(v_transaction_record.id, NULL::UUID),
        v_transaction_record.amount,
        v_transaction_record.status::TEXT,
        v_transaction_record.type::TEXT,
        v_is_first_deposit,
        v_referrer_balance,
        v_can_process,
        v_error_msg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 2: Manual Bonus Processing Function
-- ============================================

CREATE OR REPLACE FUNCTION process_referral_bonus_manual(
    p_user_id UUID DEFAULT NULL,
    p_transaction_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_referee_id UUID;
    v_transaction_id UUID;
    v_referral_record RECORD;
    v_transaction_record RECORD;
    v_bonus_amount DECIMAL(10, 2);
    v_referrer_balance DECIMAL(10, 2);
    v_is_first_deposit BOOLEAN;
    v_result JSON;
BEGIN
    -- Determine referee_id and transaction_id
    IF p_transaction_id IS NOT NULL THEN
        SELECT user_id, id INTO v_referee_id, v_transaction_id
        FROM transactions
        WHERE id = p_transaction_id;
    ELSIF p_user_id IS NOT NULL THEN
        v_referee_id := p_user_id;
        -- Get first approved deposit
        SELECT * INTO v_transaction_record
        FROM transactions
        WHERE user_id = p_user_id
        AND type = 'deposit'
        AND status = 'approved'
        ORDER BY created_at ASC
        LIMIT 1;
        
        IF v_transaction_record IS NOT NULL THEN
            v_transaction_id := v_transaction_record.id;
        END IF;
    ELSE
        RETURN json_build_object(
            'success', false,
            'error', 'Either user_id or transaction_id must be provided'
        );
    END IF;

    -- Get referral record
    SELECT * INTO v_referral_record
    FROM referrals
    WHERE referee_id = v_referee_id
    AND bonus_awarded = false
    LIMIT 1;

    IF v_referral_record IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No referral record found or bonus already awarded'
        );
    END IF;

    -- Get transaction if not already retrieved
    IF v_transaction_record IS NULL THEN
        SELECT * INTO v_transaction_record
        FROM transactions
        WHERE id = v_transaction_id;
    END IF;

    IF v_transaction_record IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Transaction not found'
        );
    END IF;

    -- Verify transaction is approved deposit
    IF v_transaction_record.status != 'approved' OR v_transaction_record.type != 'deposit' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Transaction is not an approved deposit'
        );
    END IF;

    -- Check if this is the first approved deposit
    v_is_first_deposit := NOT EXISTS (
        SELECT 1 FROM transactions
        WHERE user_id = v_referee_id
        AND type = 'deposit'
        AND status = 'approved'
        AND id != v_transaction_id
        AND created_at < v_transaction_record.created_at
    );

    IF NOT v_is_first_deposit THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This is not the first approved deposit for this user'
        );
    END IF;

    -- Calculate bonus (10% of deposit amount)
    v_bonus_amount := v_transaction_record.amount * 0.10;

    -- Get current referrer balance
    SELECT balance INTO v_referrer_balance
    FROM profiles
    WHERE id = v_referral_record.referrer_id;

    -- Update referrer's balance
    UPDATE profiles
    SET balance = COALESCE(v_referrer_balance, 0) + v_bonus_amount
    WHERE id = v_referral_record.referrer_id;

    -- Update referral record
    UPDATE referrals
    SET 
        first_deposit_amount = v_transaction_record.amount,
        referral_bonus = v_bonus_amount,
        bonus_awarded = true,
        bonus_awarded_at = NOW()
    WHERE id = v_referral_record.id;

    -- Create transaction record for the bonus
    -- Note: description column may not exist, so we'll insert without it
    INSERT INTO transactions (user_id, amount, type, status, deposit_method)
    VALUES (
        v_referral_record.referrer_id,
        v_bonus_amount,
        'deposit',
        'approved',
        'ref_bonus'
    );

    -- Return success result
    RETURN json_build_object(
        'success', true,
        'referral_id', v_referral_record.id,
        'referrer_id', v_referral_record.referrer_id,
        'referee_id', v_referee_id,
        'deposit_amount', v_transaction_record.amount,
        'bonus_amount', v_bonus_amount,
        'referrer_new_balance', COALESCE(v_referrer_balance, 0) + v_bonus_amount
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 3: Enhanced Trigger Function
-- ============================================

CREATE OR REPLACE FUNCTION award_referral_bonus()
RETURNS TRIGGER AS $$
DECLARE
    referral_record RECORD;
    bonus_amount DECIMAL(10, 2);
    referrer_balance DECIMAL(10, 2);
    v_is_first_deposit BOOLEAN;
BEGIN
    -- Only process approved deposits
    IF NEW.type != 'deposit' OR NEW.status != 'approved' THEN
        RETURN NEW;
    END IF;

    -- For UPDATE trigger: only process if status changed to approved
    IF TG_OP = 'UPDATE' AND (OLD.status = 'approved' OR NEW.status = OLD.status) THEN
        RETURN NEW;
    END IF;

    -- Check if this user was referred and has a referral record
    SELECT * INTO referral_record
    FROM referrals
    WHERE referee_id = NEW.user_id
    AND bonus_awarded = false
    LIMIT 1;

    -- If no referral record or bonus already awarded, skip
    IF referral_record IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if this is the first approved deposit for this user
    v_is_first_deposit := NOT EXISTS (
        SELECT 1 FROM transactions
        WHERE user_id = NEW.user_id
        AND type = 'deposit'
        AND status = 'approved'
        AND id != NEW.id
        AND (
            created_at < NEW.created_at
            OR (created_at = NEW.created_at AND id < NEW.id)
        )
    );

    -- Only award bonus for first deposit
    IF NOT v_is_first_deposit THEN
        RETURN NEW;
    END IF;

    -- Calculate 10% bonus
    bonus_amount := NEW.amount * 0.10;

    -- Get current referrer balance
    SELECT balance INTO referrer_balance
    FROM profiles
    WHERE id = referral_record.referrer_id;

    -- Update referrer's balance
    UPDATE profiles
    SET balance = COALESCE(referrer_balance, 0) + bonus_amount
    WHERE id = referral_record.referrer_id;

    -- Update referral record
    UPDATE referrals
    SET 
        first_deposit_amount = NEW.amount,
        referral_bonus = bonus_amount,
        bonus_awarded = true,
        bonus_awarded_at = NOW()
    WHERE id = referral_record.id;

    -- Create transaction record for the bonus
    -- Note: description column may not exist, so we'll insert without it
    INSERT INTO transactions (user_id, amount, type, status, deposit_method)
    VALUES (
        referral_record.referrer_id,
        bonus_amount,
        'deposit',
        'approved',
        'ref_bonus'
    );

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the transaction update
    -- In production, you might want to log this to an error table
    RAISE WARNING 'Error in award_referral_bonus: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 4: Create/Update Triggers
-- ============================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_award_referral_bonus ON transactions;

-- Create UPDATE trigger (for when status changes to approved)
CREATE TRIGGER trigger_award_referral_bonus
    AFTER UPDATE ON transactions
    FOR EACH ROW
    WHEN (NEW.status = 'approved' AND NEW.type = 'deposit')
    EXECUTE FUNCTION award_referral_bonus();

-- Create INSERT trigger (for transactions created with approved status)
DROP TRIGGER IF EXISTS trigger_award_referral_bonus_insert ON transactions;
CREATE TRIGGER trigger_award_referral_bonus_insert
    AFTER INSERT ON transactions
    FOR EACH ROW
    WHEN (NEW.status = 'approved' AND NEW.type = 'deposit')
    EXECUTE FUNCTION award_referral_bonus();

-- ============================================
-- PART 5: Retroactive Processing Function
-- ============================================

CREATE OR REPLACE FUNCTION process_all_missed_referral_bonuses()
RETURNS JSON AS $$
DECLARE
    v_missed_record RECORD;
    v_processed_count INTEGER := 0;
    v_error_count INTEGER := 0;
    v_result JSON;
    v_results JSON[] := ARRAY[]::JSON[];
    v_processing_result JSON;
BEGIN
    -- Find all missed referral bonuses
    FOR v_missed_record IN
        SELECT DISTINCT ON (r.referee_id)
            r.id as referral_id,
            r.referrer_id,
            r.referee_id,
            t.id as transaction_id,
            t.amount as deposit_amount
        FROM referrals r
        INNER JOIN transactions t ON t.user_id = r.referee_id
        WHERE r.bonus_awarded = false
        AND t.type = 'deposit'
        AND t.status = 'approved'
        AND NOT EXISTS (
            -- Ensure this is the first approved deposit
            SELECT 1 FROM transactions t2
            WHERE t2.user_id = r.referee_id
            AND t2.type = 'deposit'
            AND t2.status = 'approved'
            AND t2.id != t.id
            AND (
                t2.created_at < t.created_at
                OR (t2.created_at = t.created_at AND t2.id < t.id)
            )
        )
        ORDER BY r.referee_id, t.created_at ASC, t.id ASC
    LOOP
        -- Process each missed bonus
        v_processing_result := process_referral_bonus_manual(
            p_user_id => v_missed_record.referee_id,
            p_transaction_id => v_missed_record.transaction_id
        );

        v_results := array_append(v_results, json_build_object(
            'referral_id', v_missed_record.referral_id,
            'referee_id', v_missed_record.referee_id,
            'transaction_id', v_missed_record.transaction_id,
            'result', v_processing_result
        ));

        IF (v_processing_result->>'success')::BOOLEAN THEN
            v_processed_count := v_processed_count + 1;
        ELSE
            v_error_count := v_error_count + 1;
        END IF;
    END LOOP;

    -- Return summary
    RETURN json_build_object(
        'success', true,
        'processed_count', v_processed_count,
        'error_count', v_error_count,
        'total_found', v_processed_count + v_error_count,
        'results', array_to_json(v_results)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 6: Grant Permissions
-- ============================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION diagnose_referral_bonus(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION process_referral_bonus_manual(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION process_all_missed_referral_bonuses() TO authenticated, service_role;

-- ============================================
-- PART 7: Verification Query
-- ============================================

-- Run this to see current state of referral bonuses
-- SELECT * FROM diagnose_referral_bonus(NULL, NULL); -- Will show error
-- SELECT * FROM diagnose_referral_bonus('user-uuid-here'); -- Check specific user
-- SELECT process_all_missed_referral_bonuses(); -- Process all missed bonuses

SELECT 
    'Referral bonus system fixed!' as status,
    (SELECT COUNT(*) FROM referrals WHERE bonus_awarded = true) as bonuses_awarded,
    (SELECT COUNT(*) FROM referrals WHERE bonus_awarded = false) as pending_bonuses,
    (SELECT COUNT(*) FROM referrals) as total_referrals;

