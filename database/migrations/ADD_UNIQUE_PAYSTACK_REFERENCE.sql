-- Add unique constraint on paystack_reference to prevent duplicate transactions
-- Only apply to non-null values (multiple nulls are allowed)
-- This prevents the same Paystack payment from creating multiple transaction records

-- Drop existing index if it exists (in case we need to recreate it)
DROP INDEX IF EXISTS unique_paystack_reference;

-- Create unique index on paystack_reference where it's not null
-- This allows multiple NULL values but ensures each non-null reference is unique
CREATE UNIQUE INDEX unique_paystack_reference 
ON transactions (paystack_reference) 
WHERE paystack_reference IS NOT NULL;

-- Add comment
COMMENT ON INDEX unique_paystack_reference IS 'Prevents duplicate transactions with the same Paystack reference. Allows multiple NULL values but ensures each non-null reference is unique across all transactions.';
