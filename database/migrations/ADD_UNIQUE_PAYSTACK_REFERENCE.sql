-- Add unique constraint on paystack_reference to prevent duplicate transactions
-- Only apply to non-null values (multiple nulls are allowed)
-- This prevents the same Paystack payment from creating multiple transaction records

-- First, ensure the paystack_reference column exists (in case ADD_PAYSTACK_REFERENCE.sql wasn't run)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS paystack_reference TEXT;

-- Drop existing index if it exists (in case we need to recreate it)
DROP INDEX IF EXISTS unique_paystack_reference;

-- Create unique index on paystack_reference where it's not null
-- This allows multiple NULL values but ensures each non-null reference is unique
CREATE UNIQUE INDEX unique_paystack_reference 
ON transactions (paystack_reference) 
WHERE paystack_reference IS NOT NULL;

-- Add comment
COMMENT ON INDEX unique_paystack_reference IS 'Prevents duplicate transactions with the same Paystack reference. Allows multiple NULL values but ensures each non-null reference is unique across all transactions.';
