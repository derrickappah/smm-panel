-- Undo script for UUID auto-cancellation logic
-- This will stop the system from automatically marking legacy UUID orders as 'canceled'
-- Run this in your Supabase SQL Editor

-- 1. Revert the Trigger Function to only handle 'Order not placed' status
CREATE OR REPLACE FUNCTION auto_mark_submission_failed()
RETURNS TRIGGER AS $$
BEGIN
    -- Only mark 'Order not placed' text as submission_failed
    -- (Removed the UUID pattern check)
    IF (NEW.smmgen_order_id ILIKE '%Order not placed%' OR 
        NEW.smmcost_order_id::text ILIKE '%Order not placed%' OR 
        NEW.jbsmmpanel_order_id::text ILIKE '%Order not placed%') 
       AND NEW.status != 'submission_failed' THEN
        NEW.status := 'submission_failed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Optional: Revert orders that were automatically marked as 'canceled' back to 'pending'
-- This target orders that have UUID-style IDs and are currently 'canceled'
-- WARNING: This assumes these orders should have been 'pending'.
UPDATE orders
SET status = 'pending'
WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
AND status = 'canceled';

-- 3. Confirm status
COMMENT ON FUNCTION auto_mark_submission_failed IS 'Auto-marks orders as submission_failed if provider ID indicates placement failure. UUID matching removed.';
