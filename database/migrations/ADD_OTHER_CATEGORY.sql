-- Add 'other' category to support_tickets category constraint
-- Run this in your Supabase SQL Editor

-- Drop the existing check constraint
ALTER TABLE support_tickets
DROP CONSTRAINT IF EXISTS support_tickets_category_check;

-- Add new constraint with 'other' category included
ALTER TABLE support_tickets
ADD CONSTRAINT support_tickets_category_check 
CHECK (category IN ('technical', 'billing', 'order', 'account', 'general', 'other'));

-- Update comment for documentation
COMMENT ON COLUMN support_tickets.category IS 'Ticket category: technical, billing, order, account, general, other';

