-- Add 'ref_bonus' to deposit_method check constraint
-- This allows referral bonus transactions to be properly labeled
-- Run this in Supabase SQL Editor

-- Drop the existing constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_deposit_method_check;

-- Recreate the constraint with 'ref_bonus' included
ALTER TABLE transactions
ADD CONSTRAINT transactions_deposit_method_check
CHECK (deposit_method IN ('paystack', 'manual', 'momo', 'hubtel', 'korapay', 'ref_bonus'));

-- Update comment
COMMENT ON COLUMN transactions.deposit_method IS 'Method used for deposit: paystack, manual, momo, hubtel, korapay, or ref_bonus (referral bonus)';

