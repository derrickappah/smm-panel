-- Add last_status_check column to orders table for tracking when orders were last checked
-- This allows us to skip orders that were recently checked, improving performance

-- Add the column
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS last_status_check TIMESTAMPTZ;

-- Create index for efficient filtering by status and last check time
-- This helps when querying orders that need status checking
CREATE INDEX IF NOT EXISTS idx_orders_status_last_check 
ON orders(status, last_status_check) 
WHERE status NOT IN ('completed', 'refunded');

-- Add comment for documentation
COMMENT ON COLUMN orders.last_status_check IS 'Timestamp of when the order status was last checked from SMMGen API. Used to avoid redundant status checks.';

