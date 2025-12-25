-- Quick fix: Update constraint to allow 'payment' category
-- Run this in your Supabase SQL Editor immediately to fix the error

-- Step 1: Update existing 'billing' records to 'payment'
UPDATE support_tickets
SET category = 'payment'
WHERE category = 'billing';

-- Step 2: Drop the constraint (this will work even if it's currently blocking)
ALTER TABLE support_tickets 
DROP CONSTRAINT support_tickets_category_check;

-- Step 3: Recreate the constraint with 'payment' instead of 'billing'
ALTER TABLE support_tickets
ADD CONSTRAINT support_tickets_category_check 
CHECK (category IN ('technical', 'payment', 'order', 'account', 'general', 'other'));

-- Step 4: Update the comment
COMMENT ON COLUMN support_tickets.category IS 'Ticket category: technical, payment, order, account, general, other';

