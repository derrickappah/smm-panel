-- Enhance balance_audit_log trigger to automatically create transaction records
-- This ensures all balance changes are recorded as transactions
-- Run this in Supabase SQL Editor

-- Step 1: Create function to create transaction from balance audit log entry
CREATE OR REPLACE FUNCTION create_transaction_from_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_transaction_id UUID;
    v_classification JSONB;
    v_transaction_id UUID;
BEGIN
    -- Skip if transaction_id already exists (balance change already has a transaction)
    IF NEW.transaction_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    
    -- Check if a transaction already exists for this balance change
    -- For deposits (positive change_amount), look for approved deposit transactions
    -- Deposits can be created hours before they're approved, so we need a wider time window
    IF NEW.change_amount > 0 THEN
        -- Look for approved deposit transactions with matching amount
        -- Check transactions created up to 24 hours before the balance change
        -- This accounts for deposits that are created when payment is initiated but approved later
        SELECT id INTO v_existing_transaction_id
        FROM transactions
        WHERE user_id = NEW.user_id
          AND type = 'deposit'
          AND status = 'approved'
          AND ABS(amount - ABS(NEW.change_amount)) < 0.01  -- Allow small floating point differences
          AND created_at <= NEW.created_at  -- Transaction must exist before balance change
          AND created_at >= NEW.created_at - INTERVAL '24 hours'  -- But not too old
        ORDER BY 
            ABS(amount - ABS(NEW.change_amount)) ASC,  -- Prefer exact matches
            created_at DESC  -- Prefer recent transactions
        LIMIT 1;
        
        -- If no deposit found, also check for refunds and referral bonuses (within shorter window)
        IF v_existing_transaction_id IS NULL THEN
            SELECT id INTO v_existing_transaction_id
            FROM transactions
            WHERE user_id = NEW.user_id
              AND amount = ABS(NEW.change_amount)
              AND type IN ('refund', 'referral_bonus')
              AND status = 'approved'
              AND created_at BETWEEN NEW.created_at - INTERVAL '10 seconds' AND NEW.created_at + INTERVAL '2 seconds'
            ORDER BY created_at DESC
            LIMIT 1;
        END IF;
    ELSE
        -- For negative balance changes (orders, debits)
        -- Orders are created AFTER balance update, so we need to check both before and after
        -- Expand time window to account for frontend delays
        SELECT id INTO v_existing_transaction_id
        FROM transactions
        WHERE user_id = NEW.user_id
          AND type = 'order'
          AND status = 'approved'
          AND ABS(amount - ABS(NEW.change_amount)) < 0.01  -- Allow small floating point differences
          AND created_at BETWEEN NEW.created_at - INTERVAL '10 seconds' AND NEW.created_at + INTERVAL '30 seconds'
        ORDER BY 
            ABS(amount - ABS(NEW.change_amount)) ASC,  -- Prefer exact matches
            created_at DESC  -- Prefer recent transactions
        LIMIT 1;
        
        -- If no order found, also check for manual_adjustment (within shorter window)
        IF v_existing_transaction_id IS NULL THEN
            SELECT id INTO v_existing_transaction_id
            FROM transactions
            WHERE user_id = NEW.user_id
              AND amount = ABS(NEW.change_amount)
              AND type = 'manual_adjustment'
              AND status = 'approved'
              AND created_at BETWEEN NEW.created_at - INTERVAL '10 seconds' AND NEW.created_at + INTERVAL '2 seconds'
            ORDER BY created_at DESC
            LIMIT 1;
        END IF;
    END IF;
    
    -- If transaction already exists, link it
    IF v_existing_transaction_id IS NOT NULL THEN
        UPDATE balance_audit_log
        SET transaction_id = v_existing_transaction_id
        WHERE id = NEW.id;
        RETURN NEW;
    END IF;
    
    -- Auto-classify the transaction
    v_classification := auto_classify_transaction(
        p_user_id := NEW.user_id,
        p_amount := NEW.change_amount,
        p_order_id := NULL, -- We don't have order context in audit log
        p_payment_method := NULL, -- We don't have payment method in audit log
        p_payment_reference := NULL,
        p_is_admin_action := (NEW.change_reason LIKE '%admin%' OR NEW.change_reason LIKE '%manual%' OR NEW.change_reason LIKE '%Balance update%')
    );
    
    -- Create transaction record
    INSERT INTO transactions (
        user_id,
        amount,
        type,
        status,
        description,
        auto_classified
    )
    VALUES (
        NEW.user_id,
        ABS(NEW.change_amount),
        (v_classification->>'type')::TEXT,
        'approved',
        v_classification->>'description',
        (v_classification->>'auto_classified')::BOOLEAN
    )
    RETURNING id INTO v_transaction_id;
    
    -- Link the transaction to the audit log entry
    UPDATE balance_audit_log
    SET transaction_id = v_transaction_id
    WHERE id = NEW.id;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the trigger
    -- This prevents balance updates from failing if transaction creation fails
    RAISE WARNING 'Error creating transaction from audit log: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create trigger that runs AFTER balance_audit_log is inserted
DROP TRIGGER IF EXISTS create_transaction_from_audit_trigger ON balance_audit_log;
CREATE TRIGGER create_transaction_from_audit_trigger
    AFTER INSERT ON balance_audit_log
    FOR EACH ROW
    WHEN (NEW.transaction_id IS NULL) -- Only create transaction if one doesn't exist
    EXECUTE FUNCTION create_transaction_from_audit_log();

-- Step 3: Add comment for documentation
COMMENT ON FUNCTION create_transaction_from_audit_log IS 'Trigger function that automatically creates transaction records for balance changes that don''t have associated transactions. Uses auto_classify_transaction to determine transaction type.';

-- Note: This trigger will only create transactions for NEW balance_audit_log entries
-- For existing entries without transactions, use the BACKFILL_MISSING_TRANSACTIONS migration
