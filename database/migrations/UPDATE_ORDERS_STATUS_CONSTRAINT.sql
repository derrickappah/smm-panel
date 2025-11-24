-- Update orders table status constraint to include all SMMGen statuses
-- Run this in Supabase SQL Editor

-- Drop the existing check constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add the new check constraint with all SMMGen statuses
ALTER TABLE orders 
ADD CONSTRAINT orders_status_check 
CHECK (status IN (
  'pending',
  'in progress',
  'processing',
  'partial',
  'completed',
  'canceled',
  'cancelled', -- Keep both spellings for backward compatibility
  'refunds'
));

-- Add comment for documentation
COMMENT ON COLUMN orders.status IS 'Order status: pending, in progress, processing, partial, completed, canceled/cancelled, refunds';

