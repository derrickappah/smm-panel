-- Add 'refunded' status to orders table
-- Run this in Supabase SQL Editor

-- Drop the existing check constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add the new check constraint with 'refunded' status included
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
  'refunds',
  'refunded' -- New status for orders that have been refunded
));

-- Add comment for documentation
COMMENT ON COLUMN orders.status IS 'Order status: pending, in progress, processing, partial, completed, canceled/cancelled, refunds, refunded';

