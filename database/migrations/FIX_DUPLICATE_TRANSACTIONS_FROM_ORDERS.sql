-- Fix duplicate transactions created for orders
-- The issue: When an order is placed, the balance_audit_log trigger fires and creates a manual_adjustment
-- before the place_order function can link the order transaction. This creates duplicates.
-- 
-- Solution: Improve the trigger to better detect order transactions and prevent creating duplicates

-- Step 1: Update the trigger function to better handle order transactions
CREATE OR REPLACE FUNCTION create_transaction_from_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_transaction_id UUID;
    v_classification JSONB;
    v_transaction_id UUID;
    v_order_id UUID;
BEGIN
    -- Skip if transaction_id already exists (balance change already has a transaction)
    IF NEW.transaction_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    
    -- Check if a transaction already exists for this balance change
    -- For deposits (positive change_amount), look for approved deposit transactions
    IF NEW.change_amount > 0 THEN
        -- Look for approved deposit transactions with matching amount
        SELECT id INTO v_existing_transaction_id
        FROM transactions
        WHERE user_id = NEW.user_id
          AND type = 'deposit'
          AND status = 'approved'
          AND ABS(amount - ABS(NEW.change_amount)) < 0.01
          AND created_at <= NEW.created_at
          AND created_at >= NEW.created_at - INTERVAL '24 hours'
        ORDER BY 
            ABS(amount - ABS(NEW.change_amount)) ASC,
            created_at DESC
        LIMIT 1;
        
        -- If no deposit found, also check for refunds and referral bonuses
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
        -- CRITICAL: Orders are created AFTER balance update in place_order_with_balance_deduction
        -- Use a longer time window and check for order_id to ensure it's a real order transaction
        
        -- Check if an order transaction exists (with order_id set - indicates it was created by place_order function)
        SELECT id INTO v_existing_transaction_id
        FROM transactions
        WHERE user_id = NEW.user_id
          AND type = 'order'
          AND status = 'approved'
          AND order_id IS NOT NULL  -- Only match transactions with order_id (created by place_order function)
          AND ABS(amount - ABS(NEW.change_amount)) < 0.01
          AND created_at BETWEEN NEW.created_at - INTERVAL '5 seconds' AND NEW.created_at + INTERVAL '60 seconds'
        ORDER BY 
            ABS(amount - ABS(NEW.change_amount)) ASC,
            created_at DESC
        LIMIT 1;
        
        -- If no order transaction with order_id found, check for any order transaction (fallback)
        IF v_existing_transaction_id IS NULL THEN
            SELECT id INTO v_existing_transaction_id
            FROM transactions
            WHERE user_id = NEW.user_id
              AND type = 'order'
              AND status = 'approved'
              AND ABS(amount - ABS(NEW.change_amount)) < 0.01
              AND created_at BETWEEN NEW.created_at - INTERVAL '5 seconds' AND NEW.created_at + INTERVAL '60 seconds'
            ORDER BY 
                ABS(amount - ABS(NEW.change_amount)) ASC,
                created_at DESC
            LIMIT 1;
        END IF;
        
        -- Only check for manual_adjustment if no order transaction found
        -- This prevents creating duplicate manual_adjustments when an order transaction exists
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
        p_order_id := NULL,
        p_payment_method := NULL,
        p_payment_reference := NULL,
        p_is_admin_action := (NEW.change_reason LIKE '%admin%' OR NEW.change_reason LIKE '%manual%' OR NEW.change_reason LIKE '%Balance update%')
    );
    
    -- For negative balance changes, if classification is 'order', don't create a transaction
    -- The place_order function will create the order transaction and link it
    -- This prevents creating duplicate manual_adjustment transactions
    IF NEW.change_amount < 0 AND (v_classification->>'type')::TEXT = 'order' THEN
        -- Don't create transaction - wait for place_order function to create it
        -- The place_order function will link it via the UPDATE in balance_audit_log
        -- If no order transaction is created within a reasonable time, it will be handled by backfill
        RETURN NEW;
    END IF;
    
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
    RAISE WARNING 'Error creating transaction from audit log: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Add comment
COMMENT ON FUNCTION create_transaction_from_audit_log IS 'Trigger function that automatically creates transaction records for balance changes. Improved to prevent duplicate transactions for orders by checking for order_id and waiting for place_order function to create order transactions.';



