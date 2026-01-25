-- Migration: System hardening and reliability enhancements
-- This script adds additive safety layers, monitoring, and integrity checks.

-- 1. Create system_events table for centralized monitoring and alerting
CREATE TABLE IF NOT EXISTS system_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- e.g., 'provider_api_failure', 'payment_mismatch', 'balance_anomaly', 'stuck_order'
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    source TEXT NOT NULL, -- e.g., 'paystack-webhook', 'order-processor', 'provider-api'
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}', -- Store full context (provider response, transaction state, etc.)
    entity_type TEXT, -- e.g., 'order', 'transaction', 'user'
    entity_id TEXT, -- ID of the related entity
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying by type and time
CREATE INDEX IF NOT EXISTS idx_system_events_type_time ON system_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events(severity);
CREATE INDEX IF NOT EXISTS idx_system_events_entity ON system_events(entity_type, entity_id);

COMMENT ON TABLE system_events IS 'Centralized log for critical system events, failures, and security alerts.';

-- 2. Add provider_event_id to transactions for webhook idempotency
-- This stores the unique ID provided by Paystack/Moolre for each event
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_event_id TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_provider_event_id ON transactions(provider_event_id) WHERE provider_event_id IS NOT NULL;

COMMENT ON COLUMN transactions.provider_event_id IS 'Unique ID from the payment provider (e.g., Paystack event_id) to prevent duplicate processing.';

-- 3. Add reliability tracking to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_error_count INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_provider_error TEXT;

COMMENT ON COLUMN orders.submitted_at IS 'Timestamp when the order was successfully submitted to the external provider API.';
COMMENT ON COLUMN orders.provider_error_count IS 'Count of consecutive failures when attempting to submit or check status with the provider.';
COMMENT ON COLUMN orders.last_provider_error IS 'Last error message received from the provider API.';

-- 4. Create Ledger Balance Verification View
-- This view helps detect balance corruption by comparing profiles.balance with transaction sum
CREATE OR REPLACE VIEW ledger_balance_verification AS
SELECT 
    p.id as user_id,
    p.email,
    p.balance as cached_balance,
    COALESCE(SUM(
        CASE 
            WHEN t.status = 'approved' THEN
                CASE 
                    -- These ALWAYS add to balance (credits)
                    WHEN t.type IN ('deposit', 'refund', 'referral_bonus') THEN ABS(t.amount)
                    
                    -- Orders ALWAYS subtract from balance (debits)
                    WHEN t.type = 'order' THEN -ABS(t.amount)
                    
                    -- Manual adjustments depend on context (stored in description)
                    WHEN t.type = 'manual_adjustment' THEN
                        CASE 
                            WHEN t.description LIKE '%debit%' OR t.description LIKE '%removal%' THEN -ABS(t.amount)
                            ELSE ABS(t.amount) -- Default to credit if not explicitly debit
                        END
                        
                    -- Unknown fallback: let's treat them as credits if positive, but they shouldn't exist anymore
                    ELSE ABS(t.amount)
                END
            ELSE 0
        END
    ), 0) as ledger_balance,
    p.balance - COALESCE(SUM(
        CASE 
            WHEN t.status = 'approved' THEN
                CASE 
                    WHEN t.type IN ('deposit', 'refund', 'referral_bonus') THEN ABS(t.amount)
                    WHEN t.type = 'order' THEN -ABS(t.amount)
                    WHEN t.type = 'manual_adjustment' THEN
                        CASE 
                            WHEN t.description LIKE '%debit%' OR t.description LIKE '%removal%' THEN -ABS(t.amount)
                            ELSE ABS(t.amount)
                        END
                    ELSE ABS(t.amount)
                END
            ELSE 0
        END
    ), 0) as discrepancy
FROM profiles p
LEFT JOIN transactions t ON p.id = t.user_id
-- Filter out ignored users
WHERE NOT EXISTS (SELECT 1 FROM ledger_balance_exceptions WHERE user_id = p.id)
GROUP BY p.id, p.email, p.balance
HAVING p.balance != 0 OR EXISTS (SELECT 1 FROM transactions WHERE user_id = p.id);

COMMENT ON VIEW ledger_balance_verification IS 'Detects silent balance corruption by comparing cached balance with transaction ledger.';

-- 5. Helper Function to log system events from within SQL
CREATE OR REPLACE FUNCTION log_system_event(
    p_type TEXT,
    p_severity TEXT,
    p_source TEXT,
    p_description TEXT,
    p_metadata JSONB DEFAULT '{}',
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO system_events (event_type, severity, source, description, metadata, entity_type, entity_id)
    VALUES (p_type, p_severity, p_source, p_description, p_metadata, p_entity_type, p_entity_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Helper Query for Stuck Orders
CREATE OR REPLACE VIEW stuck_orders_monitor AS
SELECT 
    id,
    user_id,
    status,
    total_cost,
    created_at,
    submitted_at,
    provider_error_count,
    last_provider_error
FROM orders
WHERE 
    (status = 'pending' AND created_at < NOW() - INTERVAL '15 minutes')
    OR (status = 'processing' AND submitted_at < NOW() - INTERVAL '24 hours')
    OR (provider_error_count > 3);

COMMENT ON VIEW stuck_orders_monitor IS 'Monitors orders that are stuck in pending, processing, or have multiple provider errors.';

-- 7. Enhanced Universal Atomic Deposit Approval Function
-- This version supports provider_event_id for atomicity and idempotency
CREATE OR REPLACE FUNCTION approve_deposit_transaction_universal_v2(
    p_transaction_id UUID,
    p_payment_method TEXT DEFAULT 'paystack',
    p_payment_status TEXT DEFAULT 'success',
    p_payment_reference TEXT DEFAULT NULL,
    p_actual_amount NUMERIC DEFAULT NULL,
    p_provider_event_id TEXT DEFAULT NULL
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

    -- Check if status is pending
    IF v_transaction.status != 'pending' THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION approve_deposit_transaction_universal_v2(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO service_role, authenticated;

-- 8. Comprehensive Monitoring Summary for /dev Dashboard
CREATE OR REPLACE VIEW dev_monitoring_summary AS
WITH order_stats AS (
    SELECT
        COUNT(*) as total_today,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        -- Corrected: Stuck orders should be tracked across ALL time if still active
        (SELECT COUNT(*) FROM orders WHERE status = 'pending' AND created_at < NOW() - INTERVAL '5 minutes') as stuck_pending,
        (SELECT COUNT(*) FROM orders WHERE status = 'processing' AND submitted_at < NOW() - INTERVAL '4 hours') as stuck_processing
    FROM orders
    WHERE created_at >= CURRENT_DATE
),
payment_stats AS (
    SELECT
        COUNT(*) as deposits_today,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_today
    FROM transactions
    WHERE type = 'deposit' AND created_at >= CURRENT_DATE
),
event_stats AS (
    SELECT
        COUNT(*) FILTER (WHERE event_type = 'provider_submission_failure' AND created_at >= NOW() - INTERVAL '1 hour') as provider_errors_1h,
        COUNT(*) FILTER (WHERE event_type = 'duplicate_webhook_attempt' AND created_at >= CURRENT_DATE) as duplicate_webhooks_today,
        COUNT(*) FILTER (WHERE event_type = 'payment_amount_mismatch' AND created_at >= CURRENT_DATE) as payment_mismatches_today,
        COUNT(*) FILTER (WHERE event_type = 'rate_limit_exceeded' AND created_at >= CURRENT_DATE) as rate_limits_today,
        COUNT(*) FILTER (WHERE severity IN ('error', 'critical') AND created_at >= NOW() - INTERVAL '1 hour') as system_errors_1h
    FROM system_events
),
security_stats AS (
    SELECT 
        COUNT(*) as balance_discrepancies
    FROM ledger_balance_verification
    WHERE discrepancy != 0
)
SELECT 
    (SELECT row_to_json(order_stats.*) FROM order_stats) as order_pipeline,
    (SELECT row_to_json(payment_stats.*) FROM payment_stats) as payment_health,
    (SELECT row_to_json(event_stats.*) FROM event_stats) as system_events,
    (SELECT row_to_json(security_stats.*) FROM security_stats) as security_signals,
    (SELECT MAX(submitted_at) FROM orders) as last_provider_success,
    NOW() as updated_at;

COMMENT ON VIEW dev_monitoring_summary IS 'Centralized metrics for the hidden /dev monitoring dashboard.';
