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
    -- Get order details and lock the row
    -- Using explicit casting to handle potential type differences
    SELECT * INTO v_order
    FROM orders
    WHERE id = p_order_id
    AND (p_user_id IS NULL OR user_id::text = p_user_id)
    FOR UPDATE NOWAIT; -- Lock the row, fail if already locked

    -- Check if found
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Order not found or access denied'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    -- Check status
    IF v_order.status NOT IN ('submission_failed', 'pending') THEN
        RETURN QUERY SELECT FALSE, ('Order cannot be retried in status: ' || v_order.status)::TEXT, row_to_json(v_order)::JSONB;
        RETURN;
    END IF;

    -- Check for recent retry attempt (prevent spamming same order every second)
    IF v_order.last_checked_at IS NOT NULL AND v_order.last_checked_at > (NOW() - INTERVAL '30 seconds') THEN
        RETURN QUERY SELECT FALSE, 'Please wait 30 seconds between retry attempts'::TEXT, row_to_json(v_order)::JSONB;
        RETURN;
    END IF;

    -- Update to a temporary state or just update the timestamp to "claim" the retry
    UPDATE orders
    SET 
        last_checked_at = NOW(),
        manual_retry_count = manual_retry_count + 1
    WHERE id = p_order_id;

    RETURN QUERY SELECT TRUE, 'Order locked for retry'::TEXT, row_to_json(v_order)::JSONB;
EXCEPTION
    WHEN lock_not_available THEN
        RETURN QUERY SELECT FALSE, 'Retry already in progress for this order'::TEXT, NULL::JSONB;
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM::TEXT, NULL::JSONB;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION lock_order_for_retry(TEXT, TEXT) TO service_role, authenticated;
