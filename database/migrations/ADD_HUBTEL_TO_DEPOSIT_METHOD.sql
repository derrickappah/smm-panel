-- Add 'hubtel' to deposit_method check constraint
-- Run this in Supabase SQL Editor

-- Drop the existing constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_deposit_method_check;

-- Recreate the constraint with 'hubtel' and 'korapay' included
ALTER TABLE transactions
ADD CONSTRAINT transactions_deposit_method_check
CHECK (deposit_method IN ('paystack', 'manual', 'momo', 'hubtel', 'korapay'));

-- Add comment
COMMENT ON COLUMN transactions.deposit_method IS 'Method used for deposit: paystack, manual, momo, or hubtel.';

