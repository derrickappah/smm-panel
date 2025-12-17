-- Backfill missing transactions and update existing referral bonuses
-- This migration ensures all historical balance changes have transaction records
-- Run this in Supabase SQL Editor

-- Step 1: Update existing referral bonus transactions
-- Change type from 'deposit' to 'referral_bonus' for transactions with deposit_method='ref_bonus'
UPDATE transactions
SET 
    type = 'referral_bonus',
    description = COALESCE(description, 'Referral bonus for first deposit'),
    deposit_method = NULL -- Remove deposit_method as it's no longer needed
WHERE type = 'deposit'
AND deposit_method = 'ref_bonus';

-- Step 2: Create transaction records for balance_audit_log entries without transactions
-- This handles historical balance changes that weren't recorded as transactions
DO $$
DECLARE
    v_audit_record RECORD;
    v_classification JSONB;
    v_transaction_id UUID;
    v_existing_transaction_id UUID;
    v_count INTEGER := 0;
BEGIN
    -- Loop through audit log entries without transaction_id
    FOR v_audit_record IN
        SELECT 
            bal.id,
            bal.user_id,
            bal.change_amount,
            bal.created_at,
            bal.change_reason
        FROM balance_audit_log bal
        WHERE bal.transaction_id IS NULL
        ORDER BY bal.created_at ASC
    LOOP
        -- Check if a transaction already exists for this balance change
        SELECT id INTO v_existing_transaction_id
        FROM transactions
        WHERE user_id = v_audit_record.user_id
        AND amount = ABS(v_audit_record.change_amount)
        AND created_at BETWEEN v_audit_record.created_at - INTERVAL '10 seconds' AND v_audit_record.created_at + INTERVAL '10 seconds'
        AND (
            (v_audit_record.change_amount > 0 AND type IN ('deposit', 'refund', 'referral_bonus', 'manual_adjustment'))
            OR (v_audit_record.change_amount < 0 AND type = 'order')
        )
        LIMIT 1;
        
        -- If transaction exists, link it
        IF v_existing_transaction_id IS NOT NULL THEN
            UPDATE balance_audit_log
            SET transaction_id = v_existing_transaction_id
            WHERE id = v_audit_record.id;
            CONTINUE;
        END IF;
        
        -- Auto-classify the transaction
        v_classification := auto_classify_transaction(
            p_user_id := v_audit_record.user_id,
            p_amount := v_audit_record.change_amount,
            p_order_id := NULL,
            p_payment_method := NULL,
            p_payment_reference := NULL,
            p_is_admin_action := (
                v_audit_record.change_reason LIKE '%admin%' 
                OR v_audit_record.change_reason LIKE '%manual%'
                OR v_audit_record.change_reason LIKE '%trigger%'
            )
        );
        
        -- Create transaction record
        BEGIN
            INSERT INTO transactions (
                user_id,
                amount,
                type,
                status,
                description,
                auto_classified,
                created_at
            )
            VALUES (
                v_audit_record.user_id,
                ABS(v_audit_record.change_amount),
                (v_classification->>'type')::TEXT,
                'approved',
                COALESCE(v_classification->>'description', 'Historical balance change'),
                (v_classification->>'auto_classified')::BOOLEAN,
                v_audit_record.created_at
            )
            RETURNING id INTO v_transaction_id;
            
            -- Link the transaction to the audit log entry
            UPDATE balance_audit_log
            SET transaction_id = v_transaction_id
            WHERE id = v_audit_record.id;
            
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            -- Log error but continue processing
            RAISE WARNING 'Error creating transaction for audit log entry %: %', v_audit_record.id, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE 'Created % transaction records from balance_audit_log', v_count;
END $$;

-- Step 3: Add index to improve performance of future queries
CREATE INDEX IF NOT EXISTS idx_balance_audit_log_transaction_id_null 
ON balance_audit_log(created_at) 
WHERE transaction_id IS NULL;

-- Step 4: Add comment for documentation
COMMENT ON INDEX idx_balance_audit_log_transaction_id_null IS 'Index to quickly find audit log entries without associated transactions for backfilling';

-- Note: After running this migration, verify results with:
-- SELECT COUNT(*) FROM balance_audit_log WHERE transaction_id IS NULL;
-- Should return 0 or very few entries (only for edge cases)
