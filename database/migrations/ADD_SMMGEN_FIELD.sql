-- Add SMMGen order ID field to orders table
-- Run this in Supabase SQL Editor

-- Add smmgen_order_id column to orders table (if it doesn't exist)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS smmgen_order_id TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN orders.smmgen_order_id IS 'SMMGen API order ID for tracking orders placed via SMMGen';

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name = 'smmgen_order_id';

