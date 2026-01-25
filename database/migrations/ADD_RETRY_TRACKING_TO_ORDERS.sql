-- Migration: Add retry tracking to orders
-- This adds columns to track retries and updates the status constraint to include submission_failed.

-- 1. Add retry tracking columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reconciliation_log JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manual_retry_count INTEGER DEFAULT 0;

-- 2. Update status constraint to include submission_failed
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders 
ADD CONSTRAINT orders_status_check 
CHECK (status IN (
  'pending',
  'in progress',
  'processing',
  'partial',
  'completed',
  'canceled',
  'cancelled',
  'refunded',
  'refunds',
  'submission_failed' -- Added for safe retry flow
));

-- 3. Update column comments
COMMENT ON COLUMN orders.last_checked_at IS 'Last time the order status was verified with the provider.';
COMMENT ON COLUMN orders.reconciliation_log IS 'Log of reconciliation attempts and findings.';
COMMENT ON COLUMN orders.manual_retry_count IS 'Number of times an admin has manually triggered a retry for this order.';
COMMENT ON COLUMN orders.status IS 'Order status: pending, in progress, processing, partial, completed, canceled/cancelled, refunded/refunds, submission_failed';

-- 4. Atomic Lockout Function for Retries
-- IMPORTANT: Drop both potential overloaded signatures to avoid ambiguity
DROP FUNCTION IF EXISTS lock_order_for_retry(UUID, UUID);
DROP FUNCTION IF EXISTS lock_order_for_retry(TEXT, TEXT);

CREATE OR REPLACE FUNCTION lock_order_for_retry(
    p_order_id TEXT,
    p_user_id TEXT DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    order_data JSONB
) AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- 1. Attempt to claim the order for retry
    -- This update only succeeds if the order is in a retryable state and not recently checked
    UPDATE orders
    SET 
        last_checked_at = NOW(),
        manual_retry_count = manual_retry_count + 1
    WHERE id = p_order_id
    AND (p_user_id IS NULL OR user_id::text = p_user_id)
    AND status IN ('submission_failed', 'pending')
    -- If last_checked_at is very recent (under 5s), it might be a concurrent request from same UI click
    AND (last_checked_at IS NULL OR last_checked_at < (NOW() - INTERVAL '5 seconds'))
    RETURNING * INTO v_order;

    -- 2. Check result
    IF NOT FOUND THEN
        -- Check if it exists at all to give better message
        SELECT * INTO v_order FROM orders WHERE id = p_order_id;
        IF NOT FOUND THEN
            RETURN QUERY SELECT FALSE, 'Order not found'::TEXT, NULL::JSONB;
        ELSE
            RETURN QUERY SELECT FALSE, 'Order is already being retried or is in an invalid status'::TEXT, row_to_json(v_order)::JSONB;
        END IF;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, 'Order locked for retry'::TEXT, row_to_json(v_order)::JSONB;
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM::TEXT, NULL::JSONB;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION lock_order_for_retry(TEXT, TEXT) TO service_role, authenticated;

-- 5. Auto-Mark Submission Failed Trigger
-- This ensures that any orders with 'Order not placed' text in the panel ID
-- are instantly correctly classified in the database status.
CREATE OR REPLACE FUNCTION auto_mark_submission_failed()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.smmgen_order_id ILIKE '%Order not placed%' OR 
        NEW.smmcost_order_id::text ILIKE '%Order not placed%' OR 
        NEW.jbsmmpanel_order_id::text ILIKE '%Order not placed%') 
       AND NEW.status != 'submission_failed' THEN
        NEW.status := 'submission_failed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_mark_submission_failed ON orders;
CREATE TRIGGER trigger_auto_mark_submission_failed
BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION auto_mark_submission_failed();

-- 6. Cleanup Existing Legacy Failed Records
-- One-time sync to move legacy text-failures to the new formal status
UPDATE orders
SET status = 'submission_failed'
WHERE (smmgen_order_id ILIKE '%Order not placed%' OR 
       smmcost_order_id::text ILIKE '%Order not placed%' OR 
       jbsmmpanel_order_id::text ILIKE '%Order not placed%')
AND status NOT IN ('submission_failed', 'completed', 'cancelled', 'canceled', 'refunded');
