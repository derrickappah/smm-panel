-- Change 'billing' category to 'payment' in support_tickets
-- Run this in your Supabase SQL Editor

-- First, update existing records from 'billing' to 'payment'
UPDATE support_tickets
SET category = 'payment'
WHERE category = 'billing';

-- Drop the existing check constraint (using the exact name from the error)
ALTER TABLE support_tickets 
DROP CONSTRAINT IF EXISTS support_tickets_category_check;

-- Also try to drop any other possible constraint names
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND table_name = 'support_tickets'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%category%'
    LOOP
        EXECUTE 'ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- Add new constraint with 'payment' instead of 'billing'
ALTER TABLE support_tickets
ADD CONSTRAINT support_tickets_category_check 
CHECK (category IN ('technical', 'payment', 'order', 'account', 'general', 'other'));

-- Update comment for documentation
COMMENT ON COLUMN support_tickets.category IS 'Ticket category: technical, payment, order, account, general, other';

