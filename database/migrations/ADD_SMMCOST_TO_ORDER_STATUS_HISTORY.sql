-- Add 'smmcost' to order_status_history source constraint
-- Run this in Supabase SQL Editor

-- Drop the existing check constraint
ALTER TABLE order_status_history DROP CONSTRAINT IF EXISTS order_status_history_source_check;

-- Add the new check constraint with 'smmcost' included
ALTER TABLE order_status_history 
ADD CONSTRAINT order_status_history_source_check 
CHECK (source IN ('smmgen', 'smmcost', 'manual', 'system'));

-- Update the comment to reflect the new source option
COMMENT ON COLUMN order_status_history.source IS 'Source of status change: smmgen (from SMMGen API), smmcost (from SMMCost API), manual (admin), system (automatic)';
